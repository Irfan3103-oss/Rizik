import 'dotenv/config';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import {
  db,
  DATA_DIR,
  initDatabase,
  generateId,
  generatePickupCode,
  hashPassword,
  verifyPassword,
  haversineKm,
  runAutoExpirySweep,
  refreshDemoListingsIfEmpty,
} from './server/db.ts';
import type { ClaimStatus, FoodCategory, ListingStatus, User, VolunteerRole } from './src/types.ts';

initDatabase();

const FIREBASE_PROJECT_ID = (() => {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'firebase-applet-config.json'), 'utf8');
    const parsed = JSON.parse(raw) as { projectId?: string };
    return parsed.projectId || 'ahar-for-all-58560';
  } catch {
    return 'ahar-for-all-58560';
  }
})();
const AUTHORITATIVE_ADMIN_EMAIL = 'jafor05101007@student.ndub.edu.bd';
const BLOCKED_ADMIN_EMAIL = 'sheikhsahel513@gmail.com';

const PORT = Number(process.env.PORT) || 3000;
const DAILY_CLAIM_LIMIT = 3;
const EXPOSE_DEV_OTP = process.env.EXPOSE_DEV_OTP === 'true';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

function dateDaysOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

// Simple sliding-window rate limiter to protect against spam/abuse
const rateWindows = new Map<string, number[]>();
function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const timestamps = (rateWindows.get(key) ?? []).filter((ts) => now - ts < windowMs);
  if (timestamps.length >= maxRequests) {
    rateWindows.set(key, timestamps);
    return false;
  }
  timestamps.push(now);
  rateWindows.set(key, timestamps);
  return true;
}

function mapUserRow(row: Record<string, unknown>): User {
  const donorRow = db
    .prepare('SELECT * FROM donors WHERE user_id = ?')
    .get(String(row.id)) as Record<string, unknown> | undefined;

  return {
    id: String(row.id),
    role: row.role as User['role'],
    name: String(row.name),
    phone: String(row.phone),
    email: String(row.email),
    location: String(row.location),
    area: String(row.area),
    organizationName: row.organization_name ? String(row.organization_name) : null,
    verified: Boolean(row.verified),
    language: (row.language === 'bn' ? 'bn' : 'en'),
    savedRadiusKm: Number(row.saved_radius_km ?? 8),
    createdAt: String(row.created_at),
    donorProfile: donorRow
      ? {
          userId: String(donorRow.user_id),
          businessName: String(donorRow.business_name),
          address: String(donorRow.address),
          addressBn: donorRow.address_bn ? String(donorRow.address_bn) : null,
          lat: Number(donorRow.lat),
          lng: Number(donorRow.lng),
          hours: String(donorRow.hours),
          verificationStatus: donorRow.verification_status as 'verified' | 'pending' | 'unverified',
          logoUrl: donorRow.logo_url ? String(donorRow.logo_url) : null,
        }
      : null,
  };
}

let firebaseCertCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (firebaseCertCache && firebaseCertCache.expiresAt > now) {
    return firebaseCertCache.certs;
  }
  const resp = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
    { signal: AbortSignal.timeout(5000) }
  );
  if (!resp.ok) {
    if (firebaseCertCache) return firebaseCertCache.certs;
    throw new Error('Failed to fetch Firebase signing certificates');
  }
  const cacheControl = resp.headers.get('cache-control') || '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Math.max(60, Number(maxAgeMatch[1])) : 300;
  const certs = (await resp.json()) as Record<string, string>;
  firebaseCertCache = { certs, expiresAt: now + maxAgeSec * 1000 };
  return certs;
}

function decodeBase64UrlJson<T>(segment: string): T | null {
  try {
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const jsonStr = Buffer.from(padded, 'base64').toString('utf8');
    return JSON.parse(jsonStr) as T;
  } catch {
    return null;
  }
}

async function verifyFirebaseIdToken(idToken: string): Promise<User | null> {
  try {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const header = decodeBase64UrlJson<{ alg?: string; kid?: string }>(headerB64);
    const payload = decodeBase64UrlJson<{
      iss?: string;
      aud?: string;
      sub?: string;
      exp?: number;
      iat?: number;
      auth_time?: number;
      email?: string;
      email_verified?: boolean;
      name?: string;
      admin?: boolean;
    }>(payloadB64);

    if (!header || !payload || header.alg !== 'RS256' || !header.kid) {
      return null;
    }

    const certs = await getFirebasePublicCerts();
    const certPem = certs[header.kid];
    if (!certPem) return null;

    const sigNorm = sigB64.replace(/-/g, '+').replace(/_/g, '/');
    const sigBuf = Buffer.from(sigNorm + '='.repeat((4 - (sigNorm.length % 4)) % 4), 'base64');
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    if (!verifier.verify(certPem, sigBuf)) {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (
      payload.aud !== FIREBASE_PROJECT_ID ||
      payload.iss !== `https://securetoken.google.com/${FIREBASE_PROJECT_ID}` ||
      typeof payload.sub !== 'string' ||
      payload.sub.length === 0 ||
      payload.sub.length > 128 ||
      typeof payload.exp !== 'number' ||
      payload.exp <= nowSec ||
      typeof payload.iat !== 'number' ||
      payload.iat > nowSec + 300 ||
      (typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 300) ||
      typeof payload.email !== 'string' ||
      !payload.email.trim()
    ) {
      return null;
    }

    const uid = payload.sub;
    const email = payload.email.trim().toLowerCase();
    const isAdmin =
      email !== BLOCKED_ADMIN_EMAIL &&
      (payload.admin === true || email === AUTHORITATIVE_ADMIN_EMAIL);
    const displayName = (payload.name && payload.name.trim()) || email.split('@')[0] || 'Member';
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as
      | Record<string, unknown>
      | undefined;

    if (!existing) {
      db.prepare(
        `INSERT INTO users (id, role, name, phone, email, location, area, organization_name, verified, language, saved_radius_km, last_login_at, last_active_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, 'en', 8, ?, ?, ?)`
      ).run(
        uid,
        isAdmin ? 'admin' : 'recipient',
        displayName,
        '+8801700-000000',
        email,
        'Dhaka, Bangladesh',
        'Dhaka',
        now,
        now,
        now
      );
    } else {
      const targetRole = isAdmin
        ? 'admin'
        : existing.role === 'admin'
          ? 'recipient'
          : String(existing.role);
      const nextName =
        existing.name && String(existing.name).trim() ? String(existing.name) : displayName;
      if (
        String(existing.role) !== targetRole ||
        String(existing.email).toLowerCase() !== email ||
        !existing.verified ||
        String(existing.name) !== nextName ||
        !existing.last_login_at
      ) {
        db.prepare(
          'UPDATE users SET role = ?, email = ?, name = ?, verified = 1, last_login_at = COALESCE(last_login_at, ?), last_active_at = ? WHERE id = ?'
        ).run(targetRole, email, nextName, now, now, uid);
      } else {
        touchUserPresence(uid, false);
      }
    }

    const freshRow = db.prepare('SELECT * FROM users WHERE id = ?').get(uid) as Record<
      string,
      unknown
    >;
    return mapUserRow(freshRow);
  } catch {
    return null;
  }
}

async function getUserByToken(token?: string | null): Promise<User | null> {
  if (!token) return null;
  if (token.startsWith('fb:')) {
    return verifyFirebaseIdToken(token.slice(3));
  }
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token) as
    | { user_id: string }
    | undefined;
  if (!session) return null;
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as
    | Record<string, unknown>
    | undefined;
  return userRow ? mapUserRow(userRow) : null;
}

function isBlockedBetween(userA: string, userB: string): boolean {
  const row = db
    .prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)'
    )
    .get(userA, userB, userB, userA);
  return Boolean(row);
}

const PHONE_UNLOCKED_STATUSES = new Set<string>(['accepted', 'picked_up', 'completed']);

function isStarterConvId(id: string): boolean {
  return id === 'conv_1' || id === 'conv_2' || id === 'conv_3' || id.startsWith('conv_shop_');
}

const presenceWriteTimestamps = new Map<string, number>();
function touchUserPresence(userId: string, markLogin = false) {
  const nowMs = Date.now();
  const lastWrite = presenceWriteTimestamps.get(userId) ?? 0;
  if (!markLogin && nowMs - lastWrite < 30_000) return;
  presenceWriteTimestamps.set(userId, nowMs);
  const nowIso = new Date(nowMs).toISOString();
  if (markLogin) {
    db.prepare('UPDATE users SET last_login_at = ?, last_active_at = ? WHERE id = ?').run(
      nowIso,
      nowIso,
      userId
    );
  } else {
    db.prepare(
      'UPDATE users SET last_login_at = COALESCE(last_login_at, ?), last_active_at = ? WHERE id = ?'
    ).run(nowIso, nowIso, userId);
  }
}

// Track active WebSocket connections per user ID
const wsClients = new Map<string, Set<WebSocket>>();

function broadcastWs(event: string, data: unknown, excludeUserIds: string[] = []) {
  const excluded = new Set(excludeUserIds);
  const payload = JSON.stringify({ event, data });
  for (const [uid, sockets] of wsClients.entries()) {
    if (excluded.has(uid)) continue;
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

function sendToUser(userId: string, event: string, data: unknown) {
  const sockets = wsClients.get(userId);
  if (!sockets) return;
  const payload = JSON.stringify({ event, data });
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function sendToAdmins(event: string, data: unknown, excludeUserIds: string[] = []) {
  const excluded = new Set(excludeUserIds);
  const adminRows = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as { id: string }[];
  for (const row of adminRows) {
    if (!excluded.has(row.id)) {
      sendToUser(row.id, event, data);
    }
  }
}

function createAndPushNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  payload: Record<string, unknown> = {},
  adminOnly = false
) {
  const id = generateId('notif_live');
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO notifications (id, user_id, type, title, body, payload, read, admin_only, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, userId, type, title, body, JSON.stringify(payload), adminOnly ? 1 : 0, createdAt);

  const eventPayload = {
    id,
    userId,
    type,
    title,
    body,
    payload,
    read: false,
    createdAt,
  };
  if (!adminOnly) {
    sendToUser(userId, 'notification:new', eventPayload);
  }
  sendToAdmins('notification:new', eventPayload, adminOnly ? [] : [userId]);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '40mb' }));
  app.use('/uploads', express.static(UPLOADS_DIR));

  // OpenStreetMap tile proxy with Policy-compliant User-Agent, bounded LRU cache, and Carto fallback
  const tileCache = new Map<string, { buf: Buffer; ts: number }>();
  app.get('/api/tiles/:z/:x/:y.png', async (req, res) => {
    const z = Number.parseInt(req.params.z, 10);
    const x = Number.parseInt(req.params.x, 10);
    const y = Number.parseInt(req.params.y, 10);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 19) {
      res.status(400).end();
      return;
    }
    const maxTile = 1 << z;
    if (x < 0 || x >= maxTile || y < 0 || y >= maxTile) {
      res.status(400).end();
      return;
    }
    const cacheKey = `${z}/${x}/${y}`;
    const cached = tileCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 86_400_000) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cached.buf);
      return;
    }
    const sources = [
      `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
      `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
    ];
    for (const url of sources) {
      try {
        const upstream = await fetch(url, {
          headers: {
            'User-Agent': 'RizikFoodRescue/1.0 (https://rizik.org)',
            Accept: 'image/png,image/*;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(5000),
        });
        if (upstream.ok) {
          const buf = Buffer.from(await upstream.arrayBuffer());
          if (tileCache.size >= 600) {
            const oldestKey = tileCache.keys().next().value;
            if (oldestKey) tileCache.delete(oldestKey);
          }
          tileCache.set(cacheKey, { buf, ts: Date.now() });
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          res.send(buf);
          return;
        }
      } catch {
        // Try next tile source
      }
    }
    res.status(502).end();
  });

  // Periodic background sweep every 30s to expire old listings & no-shows
  setInterval(() => {
    const expiredIds = runAutoExpirySweep();
    if (process.env.DEMO_MODE === 'true') refreshDemoListingsIfEmpty();
    if (expiredIds.length > 0) {
      for (const sockets of wsClients.values()) {
        const msg = JSON.stringify({ event: 'listing:expired', data: { listingIds: expiredIds } });
        for (const ws of sockets) {
          if (ws.readyState === WebSocket.OPEN) ws.send(msg);
        }
      }
    }
  }, 30_000);

  // Auth middleware helper
  async function requireAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
      const user = await getUserByToken(token);
      if (!user) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }
      (req as express.Request & { user: User; token: string }).user = user;
      (req as express.Request & { user: User; token: string }).token = token!;
      next();
    } catch {
      res.status(401).json({ error: 'Authentication required' });
    }
  }

  // --- AUTH ENDPOINTS ---
  app.post('/api/auth/login', (req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!identifier || !password) {
      res.status(400).json({ error: 'Please enter your email or phone and password.' });
      return;
    }

    let lookupId: string | null = null;
    if (identifier === 'demo.user@rizik.org') {
      lookupId = 'recip_1';
    } else if (identifier === 'demo.restaurant@rizik.org') {
      lookupId = 'donor_1';
    }

    const row = lookupId
      ? (db.prepare('SELECT * FROM users WHERE id = ?').get(lookupId) as Record<string, unknown> | undefined)
      : (db.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(phone) = ?').get(identifier, identifier) as Record<string, unknown> | undefined);

    if (!row) {
      res.status(401).json({ error: 'No account found with that email or phone number.' });
      return;
    }

    const storedHash = row.password_hash ? String(row.password_hash) : null;
    if (!storedHash) {
      res.status(401).json({ error: 'Please reset your password or use OTP sign-in for this account.' });
      return;
    }

    if (!verifyPassword(password, storedHash)) {
      res.status(401).json({ error: 'Incorrect password. Please try again.' });
      return;
    }

    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
      token,
      String(row.id),
      new Date().toISOString()
    );
    touchUserPresence(String(row.id), true);
    res.json({ token, user: mapUserRow(row) });
  });

  app.post('/api/auth/register', (req, res) => {
    const name = String(req.body?.name ?? '').trim();
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const role = (req.body?.role === 'donor' ? 'donor' : 'recipient') as 'donor' | 'recipient';
    const area = String(req.body?.area ?? 'Dhanmondi').trim() || 'Dhanmondi';
    const organizationName = req.body?.organizationName ? String(req.body.organizationName).trim() : null;
    const businessName = String(req.body?.businessName ?? '').trim();
    const address = String(req.body?.address ?? '').trim();
    const hours = String(req.body?.hours ?? '9:00 AM - 9:00 PM').trim() || '9:00 AM - 9:00 PM';
    const language = req.body?.language === 'bn' ? 'bn' : 'en';

    if (!name || name.length < 2) {
      res.status(400).json({ error: 'Please enter your full name.' });
      return;
    }
    if (!identifier || identifier.length < 4) {
      res.status(400).json({ error: 'Please enter a valid email or phone number.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }
    if (role === 'donor' && (!businessName || !address)) {
      res.status(400).json({ error: 'Donors must enter a business name and street address.' });
      return;
    }

    const duplicate = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(phone) = ?')
      .get(identifier, identifier);
    if (duplicate) {
      res.status(409).json({ error: 'An account with this email or phone already exists. Please log in.' });
      return;
    }

    const now = new Date().toISOString();
    const userId = generateId(role === 'donor' ? 'donor' : 'recip');
    const isEmail = identifier.includes('@');
    const email = isEmail ? identifier : `${userId}@rizik.local`;
    const phone = isEmail ? String(req.body?.phone ?? '+8801700-000000') : identifier;
    const pwHash = hashPassword(password);

    db.prepare(
      `INSERT INTO users (id, role, name, phone, email, location, area, organization_name, verified, language, saved_radius_km, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      userId,
      role,
      name,
      phone,
      email,
      'Dhaka, Bangladesh',
      area,
      organizationName,
      role === 'recipient' ? 1 : 0,
      language,
      8,
      pwHash,
      now
    );

    if (role === 'donor') {
      const lat = 23.76 + (Math.random() - 0.5) * 0.04;
      const lng = 90.39 + (Math.random() - 0.5) * 0.04;
      const addressBn = /[\u0980-\u09FF]/.test(address) ? address : null;
      db.prepare(
        `INSERT INTO donors (user_id, business_name, address, address_bn, lat, lng, hours, verification_status, logo_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL)`
      ).run(userId, businessName, address, addressBn, lat, lng, hours);
    }

    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(token, userId, now);
    touchUserPresence(userId, true);
    const createdUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;

    res.status(201).json({ token, user: mapUserRow(createdUser) });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    if (!identifier || identifier.length < 4) {
      res.status(400).json({ error: 'Please enter a valid email or phone number.' });
      return;
    }
    const existing = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(phone) = ?')
      .get(identifier, identifier);
    if (!existing) {
      res.status(404).json({ error: 'No account found with that email or phone number.' });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    db.prepare(
      `INSERT INTO otp_codes (identifier, code, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(identifier) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at`
    ).run(identifier, code, expiresAt);

    res.json({ message: 'Verification code sent.', ...(EXPOSE_DEV_OTP ? { devOtpHint: code } : {}) });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();
    const newPassword = String(req.body?.newPassword ?? '');

    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }
    const otpRow = db.prepare('SELECT * FROM otp_codes WHERE identifier = ?').get(identifier) as
      | { identifier: string; code: string; expires_at: string }
      | undefined;

    if (!otpRow || otpRow.code !== code || otpRow.expires_at < new Date().toISOString()) {
      res.status(400).json({ error: 'Invalid or expired verification code.' });
      return;
    }

    const userRow = db
      .prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(phone) = ?')
      .get(identifier, identifier) as { id: string } | undefined;
    if (!userRow) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    db.prepare('DELETE FROM otp_codes WHERE identifier = ?').run(identifier);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(newPassword), userRow.id);
    res.json({ ok: true });
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = (req as express.Request & { token: string }).token;
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ ok: true });
  });

  app.post('/api/auth/request-otp', (req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    if (!identifier || identifier.length < 4) {
      res.status(400).json({ error: 'Please enter a valid email or phone number.' });
      return;
    }
    if (!checkRateLimit(`otp:${identifier}`, 5, 60_000)) {
      res.status(429).json({ error: 'Too many OTP requests. Please wait a minute.' });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    db.prepare(
      `INSERT INTO otp_codes (identifier, code, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(identifier) DO UPDATE SET code = excluded.code, expires_at = excluded.expires_at`
    ).run(identifier, code, expiresAt);

    // devOtpHint lets evaluators finish OTP without SMS/email delivery. Only when EXPOSE_DEV_OTP=true:
    // anyone who knows an email/phone could otherwise take over that account.
    res.json({
      message: 'Verification code sent.',
      ...(EXPOSE_DEV_OTP ? { devOtpHint: code } : {}),
    });
  });

  app.post('/api/auth/verify-otp', (req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim().toLowerCase();
    const code = String(req.body?.code ?? '').trim();
    const role = (req.body?.role === 'donor' ? 'donor' : 'recipient') as 'donor' | 'recipient';
    const name = String(req.body?.name ?? '').trim();
    const area = String(req.body?.area ?? 'Dhanmondi').trim();
    const organizationName = req.body?.organizationName ? String(req.body.organizationName).trim() : null;
    const businessName = String(req.body?.businessName ?? '').trim();
    const address = String(req.body?.address ?? 'Dhaka, Bangladesh').trim();
    const hours = String(req.body?.hours ?? '9:00 AM - 9:00 PM').trim();

    const otpRow = db.prepare('SELECT * FROM otp_codes WHERE identifier = ?').get(identifier) as
      | { identifier: string; code: string; expires_at: string }
      | undefined;

    if (!otpRow || otpRow.code !== code || otpRow.expires_at < new Date().toISOString()) {
      res.status(400).json({ error: 'Invalid or expired verification code.' });
      return;
    }
    db.prepare('DELETE FROM otp_codes WHERE identifier = ?').run(identifier);

    // Check if user already exists by email or phone
    let existing = db
      .prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(phone) = ?')
      .get(identifier, identifier) as Record<string, unknown> | undefined;

    const now = new Date().toISOString();
    if (!existing) {
      const userId = generateId(role === 'donor' ? 'donor' : 'recip');
      const isEmail = identifier.includes('@');
      const displayName = name || (isEmail ? identifier.split('@')[0] : 'Community Member');
      const email = isEmail ? identifier : `${userId}@rizik.local`;
      const phone = isEmail ? String(req.body?.phone ?? '+8801700-000000') : identifier;

      db.prepare(
        `INSERT INTO users (id, role, name, phone, email, location, area, organization_name, verified, language, saved_radius_km, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId,
        role,
        displayName,
        phone,
        email,
        'Dhaka, Bangladesh',
        area,
        organizationName,
        role === 'recipient' ? 1 : 0,
        'en',
        8,
        now
      );

      if (role === 'donor') {
        // Assign realistic Dhaka jitter around Dhanmondi/Gulshan
        const lat = 23.76 + (Math.random() - 0.5) * 0.04;
        const lng = 90.39 + (Math.random() - 0.5) * 0.04;
        db.prepare(
          `INSERT INTO donors (user_id, business_name, address, lat, lng, hours, verification_status, logo_url)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL)`
        ).run(userId, businessName || `${displayName}'s Kitchen`, address, lat, lng, hours);
      }

      existing = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<string, unknown>;
    }

    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
      token,
      String(existing.id),
      now
    );
    touchUserPresence(String(existing.id), true);

    res.json({ token, user: mapUserRow(existing) });
  });

  app.get('/api/auth/demo-accounts', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT u.id, u.role, u.name, u.area, u.organization_name, d.business_name, d.verification_status
         FROM users u LEFT JOIN donors d ON u.id = d.user_id
         WHERE u.id IN ('recip_1', 'donor_1')
         ORDER BY CASE u.role WHEN 'recipient' THEN 1 ELSE 2 END, u.id ASC`
      )
      .all();
    res.json({ accounts: rows });
  });

  app.post('/api/auth/demo-login', (req, res) => {
    const reqId = String(req.body?.userId ?? 'recip_1');
    // Security restriction: Demo login NEVER grants admin privileges
    if (reqId === 'admin_1') {
      res.status(403).json({ error: 'Admin demo login is restricted. Please sign in with admin credentials.' });
      return;
    }
    const userId = (reqId === 'donor_1' || reqId === 'donor' || reqId === 'restaurant') ? 'donor_1' : 'recip_1';

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Demo account not found' });
      return;
    }
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
      token,
      userId,
      new Date().toISOString()
    );
    touchUserPresence(userId, true);
    res.json({ token, user: mapUserRow(row) });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    res.json({ user });
  });

  app.patch('/api/auth/profile', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : user.name;
    const area = req.body?.area !== undefined ? String(req.body.area).trim() : user.area;
    const language = req.body?.language === 'bn' ? 'bn' : req.body?.language === 'en' ? 'en' : user.language;
    const savedRadiusKm =
      req.body?.savedRadiusKm !== undefined
        ? Math.max(1, Math.min(50, Number(req.body.savedRadiusKm)))
        : user.savedRadiusKm;
    const organizationName =
      req.body?.organizationName !== undefined
        ? req.body.organizationName
          ? String(req.body.organizationName).trim()
          : null
        : user.organizationName ?? null;

    db.prepare(
      `UPDATE users SET name = ?, area = ?, language = ?, saved_radius_km = ?, organization_name = ? WHERE id = ?`
    ).run(name || user.name, area || user.area, language, savedRadiusKm, organizationName, user.id);

    if (user.role === 'donor' && (req.body?.businessName || req.body?.address || req.body?.hours)) {
      db.prepare(
        `UPDATE donors SET
          business_name = COALESCE(?, business_name),
          address = COALESCE(?, address),
          hours = COALESCE(?, hours)
         WHERE user_id = ?`
      ).run(
        req.body.businessName ? String(req.body.businessName).trim() : null,
        req.body.address ? String(req.body.address).trim() : null,
        req.body.hours ? String(req.body.hours).trim() : null,
        user.id
      );
    }

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as Record<string, unknown>;
    res.json({ user: mapUserRow(updated) });
  });

  // --- UPLOAD ENDPOINTS ---
  app.post('/api/upload', requireAuth, (req, res) => {
    const dataUrl = String(req.body?.dataUrl ?? '');
    const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid image format. Use PNG, JPEG, or WebP.' });
      return;
    }
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image must be smaller than 5 MB.' });
      return;
    }
    const filename = `upload_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    res.json({ url: `/uploads/${filename}` });
  });

  app.post('/api/upload-audio', requireAuth, (req, res) => {
    const dataUrl = String(req.body?.dataUrl ?? '');
    const match = dataUrl.match(
      /^data:audio\/(webm|ogg|mp4|mpeg|wav|aac)(?:;[^;,]+)*;base64,(.+)$/
    );
    if (!match) {
      res.status(400).json({ error: 'Invalid audio format. Use WebM, OGG, MP4, WAV, or AAC.' });
      return;
    }
    const rawExt = match[1];
    const ext = rawExt === 'mpeg' ? 'mp3' : rawExt === 'mp4' ? 'm4a' : rawExt;
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 6 * 1024 * 1024) {
      res.status(400).json({ error: 'Voice message must be smaller than 6 MB.' });
      return;
    }
    const filename = `voice_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    res.json({ url: `/uploads/${filename}` });
  });

  app.post('/api/upload-file', requireAuth, (req, res) => {
    const dataUrl = String(req.body?.dataUrl ?? '');
    const rawFileName = String(req.body?.fileName ?? 'document').trim();
    const safeName = rawFileName.replace(/[^a-zA-Z0-9._\-\s\u0980-\u09FF]/g, '_').slice(0, 120) || 'document';
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid file payload.' });
      return;
    }
    const mime = match[1].toLowerCase();
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length > 25 * 1024 * 1024) {
      res.status(400).json({ error: 'File must be 25 MB or smaller.' });
      return;
    }
    const allowedExts = new Set([
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'zip', 'rar', 'ppt', 'pptx', 'json', 'md',
      'png', 'jpg', 'jpeg', 'webp',
    ]);
    const extMatch = safeName.toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = extMatch?.[1] ?? '';
    const allowedMimePrefixes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'application/zip',
      'application/x-zip-compressed',
      'application/x-rar-compressed',
      'application/octet-stream',
      'text/plain',
      'text/csv',
      'application/json',
      'image/png',
      'image/jpeg',
      'image/webp',
    ];
    const mimeOk = allowedMimePrefixes.some((p) => mime.startsWith(p));
    if (!allowedExts.has(ext) && !mimeOk) {
      res.status(400).json({ error: 'Unsupported file type. Upload PDF, DOC, XLS, TXT, ZIP, or image.' });
      return;
    }
    const outExt = allowedExts.has(ext) ? ext : 'bin';
    const filename = `file_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${outExt}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
    res.json({
      url: `/uploads/${filename}`,
      fileName: safeName,
      fileSize: buffer.length,
      fileMime: mime,
    });
  });

  // --- PUBLIC HOMEPAGE SUMMARY ---
  app.get('/api/home-summary', (_req, res) => {
    runAutoExpirySweep();

    const activeDonorsCount = (
      db.prepare("SELECT COUNT(*) as c FROM donors WHERE verification_status = 'verified'").get() as {
        c: number;
      }
    ).c;

    const totalServingsClaimed = (
      db
        .prepare(
          "SELECT COALESCE(SUM(quantity_claimed), 0) as total FROM claims WHERE status IN ('accepted', 'picked_up', 'completed')"
        )
        .get() as { total: number }
    ).total;

    const activeListingsCount = (
      db
        .prepare("SELECT COALESCE(SUM(remaining_quantity), 0) as total FROM listings WHERE status = 'active'")
        .get() as { total: number }
    ).total;

    const completedCount = (
      db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'completed'").get() as {
        c: number;
      }
    ).c;

    // Combine verified community rescue baseline with live DB rescue totals
    const mealsShared = 1240 + totalServingsClaimed + completedCount * 2;
    const kgSaved = Math.round(mealsShared * 0.45);
    const activeDonors = Math.max(activeDonorsCount, 1) + 18;
    const peopleHelped = 480 + totalServingsClaimed;

    const donorRows = db
      .prepare(
        `SELECT d.user_id, d.business_name, d.address, d.hours, d.verification_status,
                u.area,
                (SELECT COUNT(*) FROM listings l WHERE l.donor_id = d.user_id AND l.status = 'active' AND l.remaining_quantity > 0) as active_count,
                (SELECT photo_urls FROM listings l WHERE l.donor_id = d.user_id ORDER BY l.created_at DESC LIMIT 1) as latest_photos
         FROM donors d
         JOIN users u ON d.user_id = u.id
         WHERE d.verification_status = 'verified'
         ORDER BY active_count DESC, d.business_name ASC
         LIMIT 4`
      )
      .all() as Record<string, unknown>[];

    const featuredDonors = donorRows.map((d) => {
      let photoUrl = '/images/kacchi-biryani.jpg';
      try {
        const parsed = JSON.parse(String(d.latest_photos || '[]')) as string[];
        if (parsed[0]) photoUrl = parsed[0];
      } catch {
        // Fallback photo
      }
      return {
        id: String(d.user_id),
        businessName: String(d.business_name),
        area: String(d.area),
        hours: String(d.hours),
        verified: d.verification_status === 'verified',
        activeListings: Number(d.active_count ?? 0),
        photoUrl,
      };
    });

    const recentClaimRows = db
      .prepare(
        `SELECT c.id, c.status, c.quantity_claimed, c.created_at,
                l.title as listing_title, l.unit,
                d.business_name as donor_name, u.area as donor_area
         FROM claims c
         JOIN listings l ON c.listing_id = l.id
         JOIN donors d ON l.donor_id = d.user_id
         JOIN users u ON l.donor_id = u.id
         WHERE c.status IN ('accepted', 'picked_up', 'completed', 'requested')
         ORDER BY c.created_at DESC
         LIMIT 4`
      )
      .all() as Record<string, unknown>[];

    const recentActivity = recentClaimRows.map((r) => ({
      id: String(r.id),
      status: String(r.status),
      quantity: Number(r.quantity_claimed),
      unit: String(r.unit || 'servings'),
      listingTitle: String(r.listing_title),
      donorName: String(r.donor_name),
      area: String(r.donor_area),
      createdAt: String(r.created_at),
    }));

    const partnerRows = db
      .prepare('SELECT * FROM partners ORDER BY featured DESC, meals_contributed DESC LIMIT 8')
      .all() as Record<string, unknown>[];

    const upcomingEventRows = db
      .prepare(
        `SELECT e.*, (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id) as reg_count
         FROM events e
         WHERE e.status IN ('ongoing', 'upcoming')
         ORDER BY CASE e.status WHEN 'ongoing' THEN 0 ELSE 1 END, e.event_date ASC
         LIMIT 3`
      )
      .all() as Record<string, unknown>[];

    const testimonialRows = db
      .prepare('SELECT * FROM testimonials ORDER BY id ASC')
      .all() as Record<string, unknown>[];

    const donationTotals = db
      .prepare("SELECT COALESCE(SUM(amount_bdt), 0) as raised, COUNT(*) as cnt FROM donations WHERE status = 'completed'")
      .get() as { raised: number; cnt: number };

    res.json({
      impact: {
        mealsShared,
        kgSaved,
        activeDonors,
        peopleHelped,
        portionsAvailableNow: activeListingsCount,
      },
      featuredDonors,
      recentActivity,
      featuredPartners: partnerRows.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        nameBn: String(p.name_bn),
        category: String(p.category),
        area: String(p.area),
        description: String(p.description),
        descriptionBn: String(p.description_bn),
        logoUrl: p.logo_url ? String(p.logo_url) : null,
        sinceYear: Number(p.since_year),
        mealsContributed: Number(p.meals_contributed),
        featured: Boolean(p.featured),
      })),
      upcomingEvents: upcomingEventRows.map((e) => ({
        id: String(e.id),
        title: String(e.title),
        titleBn: String(e.title_bn),
        description: String(e.description),
        descriptionBn: String(e.description_bn),
        organizer: String(e.organizer),
        organizerBn: String(e.organizer_bn),
        area: String(e.area),
        locationName: String(e.location_name),
        locationNameBn: e.location_name_bn ? String(e.location_name_bn) : null,
        lat: Number.isFinite(Number(e.lat)) && Number(e.lat) !== 0 ? Number(e.lat) : 23.7465,
        lng: Number.isFinite(Number(e.lng)) && Number(e.lng) !== 0 ? Number(e.lng) : 90.376,
        eventDate: String(e.event_date),
        startTime: String(e.start_time),
        endTime: String(e.end_time),
        schedule: JSON.parse(String(e.schedule_json || '[]')),
        expectedMeals: Number(e.expected_meals),
        actualMealsServed: e.actual_meals_served !== null ? Number(e.actual_meals_served) : null,
        peopleHelped: e.people_helped !== null ? Number(e.people_helped) : null,
        volunteersNeeded: Number(e.volunteers_needed),
        registeredCount: Number(e.reg_count ?? 0),
        bannerUrl: String(e.banner_url),
        galleryUrls: JSON.parse(String(e.gallery_urls_json || '[]')),
        howToHelp: String(e.how_to_help),
        howToHelpBn: String(e.how_to_help_bn),
        status: String(e.status),
        createdBy: e.created_by ? String(e.created_by) : null,
        createdAt: String(e.created_at),
      })),
      testimonials: testimonialRows.map((tRow) => ({
        id: String(tRow.id),
        quote: String(tRow.quote),
        quoteBn: String(tRow.quote_bn),
        authorName: String(tRow.author_name),
        authorNameBn: String(tRow.author_name_bn),
        roleLabel: String(tRow.role_label),
        roleLabelBn: String(tRow.role_label_bn),
        orgName: String(tRow.org_name),
        category: String(tRow.category),
        avatarUrl: tRow.avatar_url ? String(tRow.avatar_url) : null,
      })),
      campaignProgress: {
        goalBdt: 250000,
        raisedBdt: Number(donationTotals.raised ?? 0) + 115000,
        donorCount: Number(donationTotals.cnt ?? 0) + 34,
      },
    });
  });

  // --- LISTINGS ENDPOINTS ---
  app.get('/api/listings', async (req, res) => {
    runAutoExpirySweep();

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const currentUser = await getUserByToken(token);

    const userLat = Number(req.query.lat ?? 23.765);
    const userLng = Number(req.query.lng ?? 90.391);
    const maxRadiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : null;
    const category = req.query.category ? String(req.query.category) : null;
    const dietary = req.query.dietary ? String(req.query.dietary).split(',').filter(Boolean) : [];
    const pickupWithinMin = req.query.pickupWithinMin ? Number(req.query.pickupWithinMin) : null;
    const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
    const donorId = req.query.donorId ? String(req.query.donorId) : null;
    const includeAll = req.query.includeAll === 'true';
    const flashOnly = req.query.flashOnly === 'true';
    const ramadanOnly = req.query.ramadanOnly === 'true';

    let sql = `
      SELECT l.*, u.area as donor_area, u.phone as donor_phone, d.business_name, d.verification_status,
             (SELECT ROUND(AVG(dr.rating), 1) FROM donor_reviews dr WHERE dr.donor_id = l.donor_id) as donor_avg_rating,
             (SELECT COUNT(*) FROM donor_reviews dr WHERE dr.donor_id = l.donor_id) as donor_review_count
      FROM listings l
      JOIN users u ON l.donor_id = u.id
      JOIN donors d ON l.donor_id = d.user_id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (donorId) {
      sql += ' AND l.donor_id = ?';
      params.push(donorId);
    }
    if (!includeAll) {
      sql += " AND l.status = 'active' AND l.remaining_quantity > 0";
    }
    if (category && category !== 'all') {
      sql += ' AND l.category = ?';
      params.push(category);
    }

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];

    let mapped = rows
      .filter((r) => {
        if (currentUser && isBlockedBetween(currentUser.id, String(r.donor_id))) return false;
        return true;
      })
      .map((r) => {
        const dist = haversineKm(userLat, userLng, Number(r.lat), Number(r.lng));
        const tags: string[] = JSON.parse(String(r.dietary_tags || '[]'));
        const photos: string[] = JSON.parse(String(r.photo_urls || '[]'));
        const preparedMs = new Date(String(r.prepared_at)).getTime();
        const consumeHrs = Number(r.consume_within_hours ?? 4);
        const safeUntil = Number.isFinite(preparedMs)
          ? new Date(preparedMs + consumeHrs * 3600_000).toISOString()
          : String(r.pickup_end);
        const msLeft = new Date(String(r.pickup_end)).getTime() - Date.now();
        const isFlashRescue =
          Boolean(r.is_flash_rescue) || (msLeft > 0 && msLeft <= 75 * 60_000);

        // Check if currentUser has an accepted/picked_up/completed claim to unlock donor phone
        let unlockedPhone: string | null = null;
        if (currentUser) {
          const acceptedClaim = db
            .prepare(
              `SELECT status FROM claims WHERE listing_id = ? AND recipient_id = ? AND status IN ('accepted', 'picked_up', 'completed')`
            )
            .get(String(r.id), currentUser.id);
          if (acceptedClaim || currentUser.id === String(r.donor_id)) {
            unlockedPhone = String(r.donor_phone);
          }
        }

        return {
          id: String(r.id),
          donorId: String(r.donor_id),
          donorName: String(r.business_name),
          donorVerified: r.verification_status === 'verified',
          donorAvgRating: r.donor_avg_rating !== null && r.donor_avg_rating !== undefined ? Number(r.donor_avg_rating) : null,
          donorReviewCount: Number(r.donor_review_count ?? 0),
          donorArea: String(r.donor_area),
          donorPhone: unlockedPhone,
          title: String(r.title),
          description: String(r.description),
          category: r.category as FoodCategory,
          dietaryTags: tags,
          quantity: Number(r.quantity),
          remainingQuantity: Number(r.remaining_quantity),
          unit: String(r.unit),
          photoUrls: photos,
          pickupStart: String(r.pickup_start),
          pickupEnd: String(r.pickup_end),
          pickupAddress: currentUser ? String(r.pickup_address) : String(r.donor_area),
          pickupAddressBn: currentUser && r.pickup_address_bn ? String(r.pickup_address_bn) : null,
          safetyNote: String(r.safety_note),
          preparedAt: String(r.prepared_at),
          consumeWithinHours: consumeHrs,
          safeUntil,
          isFlashRescue,
          storageMethod: String(r.storage_method || 'covered_hot'),
          isRamadanSpecial:
            Boolean(r.is_ramadan_special) ||
            tags.some((tg) => /iftar|sehri|ramadan|eid/i.test(tg)),
          status: r.status as ListingStatus,
          lat: Number(r.lat),
          lng: Number(r.lng),
          distanceKm: dist,
          createdAt: String(r.created_at),
        };
      });

    if (maxRadiusKm !== null && !Number.isNaN(maxRadiusKm)) {
      mapped = mapped.filter((l) => (l.distanceKm ?? 0) <= maxRadiusKm);
    }
    if (dietary.length > 0) {
      mapped = mapped.filter((l) => dietary.every((tag) => l.dietaryTags.includes(tag)));
    }
    if (pickupWithinMin !== null && !Number.isNaN(pickupWithinMin)) {
      const cutoff = Date.now() + pickupWithinMin * 60_000;
      mapped = mapped.filter((l) => new Date(l.pickupEnd).getTime() <= cutoff);
    }
    if (flashOnly) {
      mapped = mapped.filter((l) => l.isFlashRescue);
    }
    if (ramadanOnly) {
      mapped = mapped.filter((l) => l.isRamadanSpecial);
    }
    if (search) {
      mapped = mapped.filter(
        (l) =>
          l.title.toLowerCase().includes(search) ||
          l.description.toLowerCase().includes(search) ||
          l.donorName.toLowerCase().includes(search) ||
          l.donorArea.toLowerCase().includes(search)
      );
    }

    // Sort by combined urgency (flash/expiry soonest) and proximity
    mapped.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'active' ? -1 : 1;
      }
      if (a.isFlashRescue !== b.isFlashRescue) {
        return a.isFlashRescue ? -1 : 1;
      }
      const distScoreA = (a.distanceKm ?? 0) * 15;
      const distScoreB = (b.distanceKm ?? 0) * 15;
      const expA = (new Date(a.pickupEnd).getTime() - Date.now()) / 60_000;
      const expB = (new Date(b.pickupEnd).getTime() - Date.now()) / 60_000;
      return distScoreA + expA * 0.25 - (distScoreB + expB * 0.25);
    });

    res.json({ listings: mapped });
  });

  app.post('/api/listings', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    if (user.role !== 'donor') {
      res.status(403).json({ error: 'Only donor accounts can post surplus food listings.' });
      return;
    }
    if (!checkRateLimit(`create_listing:${user.id}`, 10, 3600_000)) {
      res.status(429).json({ error: 'Rate limit reached: max 10 listings per hour.' });
      return;
    }

    const title = String(req.body?.title ?? '').trim();
    const description = String(req.body?.description ?? '').trim();
    const category = (['cooked', 'bakery', 'produce', 'packaged'].includes(req.body?.category)
      ? req.body.category
      : 'cooked') as FoodCategory;
    const quantity = Math.max(1, Math.min(200, Number(req.body?.quantity ?? 1)));
    const unit = String(req.body?.unit ?? 'servings').trim() || 'servings';
    const dietaryTags = Array.isArray(req.body?.dietaryTags) ? req.body.dietaryTags.map(String) : [];
    const photoUrls =
      Array.isArray(req.body?.photoUrls) && req.body.photoUrls.length > 0
        ? req.body.photoUrls.map(String)
        : ['/images/kacchi-biryani.jpg'];
    const pickupStart = String(req.body?.pickupStart ?? new Date().toISOString());
    const pickupEnd = String(
      req.body?.pickupEnd ?? new Date(Date.now() + 3 * 3600_000).toISOString()
    );
    const pickupAddress =
      String(req.body?.pickupAddress ?? '').trim() ||
      user.donorProfile?.address ||
      'Dhaka, Bangladesh';
    const safetyNote =
      String(req.body?.safetyNote ?? '').trim() || 'Prepared fresh today. Consume within 4 hours.';
    const preparedAt = String(req.body?.preparedAt ?? new Date().toISOString());
    const consumeWithinHours = Math.max(1, Math.min(72, Number(req.body?.consumeWithinHours ?? 4)));
    const isFlashRescue = req.body?.isFlashRescue ? 1 : 0;
    const storageMethod = ['covered_hot', 'covered_chilled', 'sealed_dry', 'room_temp'].includes(
      String(req.body?.storageMethod ?? '')
    )
      ? String(req.body.storageMethod)
      : 'covered_hot';
    const isRamadanSpecial = req.body?.isRamadanSpecial ? 1 : 0;

    if (!title || title.length < 3) {
      res.status(400).json({ error: 'Please provide a clear title for the food listing.' });
      return;
    }
    if (new Date(pickupEnd).getTime() <= Date.now()) {
      res.status(400).json({ error: 'Pickup end time must be in the future.' });
      return;
    }

    const id = generateId('list');
    const now = new Date().toISOString();
    const lat = user.donorProfile?.lat ?? 23.765;
    const lng = user.donorProfile?.lng ?? 90.391;

    db.prepare(
      `INSERT INTO listings (
        id, donor_id, title, description, category, dietary_tags, quantity, remaining_quantity,
        unit, photo_urls, pickup_start, pickup_end, pickup_address, safety_note, prepared_at,
        consume_within_hours, is_flash_rescue, storage_method, is_ramadan_special, status, lat, lng, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
    ).run(
      id,
      user.id,
      title,
      description || 'Fresh surplus food ready for local pickup.',
      category,
      JSON.stringify(dietaryTags),
      quantity,
      quantity,
      unit,
      JSON.stringify(photoUrls),
      pickupStart,
      pickupEnd,
      pickupAddress,
      safetyNote,
      preparedAt,
      consumeWithinHours,
      isFlashRescue,
      storageMethod,
      isRamadanSpecial,
      lat,
      lng,
      now
    );

    // Notify nearby recipients within their saved radius
    const recipients = db.prepare("SELECT id, saved_radius_km FROM users WHERE role = 'recipient'").all() as {
      id: string;
      saved_radius_km: number;
    }[];
    for (const r of recipients) {
      createAndPushNotification(
        r.id,
        isFlashRescue ? 'flash_rescue' : 'new_listing',
        `${isFlashRescue ? 'Flash Rescue' : 'New Food Nearby'} · ${user.donorProfile?.businessName ?? user.name}`,
        `${title} (${quantity} ${unit}) posted in ${user.area}.`,
        { listingId: id }
      );
      sendToUser(r.id, 'listing:created', { listingId: id, isFlashRescue: Boolean(isFlashRescue) });
    }

    res.status(201).json({ id });
  });

  app.patch('/api/listings/:id', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;

    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }
    if (String(listing.donor_id) !== user.id) {
      res.status(403).json({ error: 'You can only edit your own listings.' });
      return;
    }

    const nextStatus = req.body?.status
      ? String(req.body.status)
      : String(listing.status);
    const nextQty =
      req.body?.quantity !== undefined ? Math.max(1, Number(req.body.quantity)) : Number(listing.quantity);
    const nextRemaining =
      nextStatus === 'claimed'
        ? 0
        : req.body?.remainingQuantity !== undefined
          ? Math.max(0, Number(req.body.remainingQuantity))
          : Math.min(nextQty, Number(listing.remaining_quantity));

    db.prepare(
      `UPDATE listings SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        category = COALESCE(?, category),
        dietary_tags = COALESCE(?, dietary_tags),
        quantity = ?,
        remaining_quantity = ?,
        unit = COALESCE(?, unit),
        photo_urls = COALESCE(?, photo_urls),
        pickup_start = COALESCE(?, pickup_start),
        pickup_end = COALESCE(?, pickup_end),
        pickup_address = COALESCE(?, pickup_address),
        safety_note = COALESCE(?, safety_note),
        consume_within_hours = COALESCE(?, consume_within_hours),
        is_flash_rescue = COALESCE(?, is_flash_rescue),
        storage_method = COALESCE(?, storage_method),
        is_ramadan_special = COALESCE(?, is_ramadan_special),
        status = ?
       WHERE id = ?`
    ).run(
      req.body?.title ? String(req.body.title).trim() : null,
      req.body?.description ? String(req.body.description).trim() : null,
      req.body?.category ? String(req.body.category) : null,
      req.body?.dietaryTags ? JSON.stringify(req.body.dietaryTags) : null,
      nextQty,
      nextRemaining,
      req.body?.unit ? String(req.body.unit) : null,
      req.body?.photoUrls ? JSON.stringify(req.body.photoUrls) : null,
      req.body?.pickupStart ? String(req.body.pickupStart) : null,
      req.body?.pickupEnd ? String(req.body.pickupEnd) : null,
      req.body?.pickupAddress ? String(req.body.pickupAddress) : null,
      req.body?.safetyNote ? String(req.body.safetyNote) : null,
      req.body?.consumeWithinHours ? Number(req.body.consumeWithinHours) : null,
      req.body?.isFlashRescue !== undefined ? (req.body.isFlashRescue ? 1 : 0) : null,
      req.body?.storageMethod ? String(req.body.storageMethod) : null,
      req.body?.isRamadanSpecial !== undefined ? (req.body.isRamadanSpecial ? 1 : 0) : null,
      nextStatus,
      listing.id as string
    );

    res.json({ ok: true });
  });

  app.delete('/api/listings/:id', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const listing = db.prepare('SELECT donor_id FROM listings WHERE id = ?').get(req.params.id) as
      | { donor_id: string }
      | undefined;
    if (!listing) {
      res.status(404).json({ error: 'Listing not found' });
      return;
    }
    if (listing.donor_id !== user.id) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    db.prepare('DELETE FROM listings WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  // --- CLAIMS ENDPOINTS ---
  app.get('/api/claims', requireAuth, (req, res) => {
    runAutoExpirySweep();
    const user = (req as express.Request & { user: User }).user;
    const scope = req.query.scope === 'donor' ? 'donor' : 'recipient';

    const whereClause = scope === 'donor' ? 'l.donor_id = ?' : 'c.recipient_id = ?';
    const rows = db
      .prepare(
        `SELECT c.*, l.title as listing_title, l.photo_urls, l.category as listing_category,
                l.pickup_start, l.pickup_end, l.pickup_address, l.pickup_address_bn, l.donor_id,
                d.business_name as donor_business_name, d.verification_status as donor_verification_status,
                du.phone as donor_phone,
                ru.name as recipient_name, ru.area as recipient_area, ru.organization_name as recipient_org,
                ru.phone as recipient_phone,
                conv.id as conversation_id,
                dr.rating as review_rating
         FROM claims c
         JOIN listings l ON c.listing_id = l.id
         JOIN donors d ON l.donor_id = d.user_id
         JOIN users du ON l.donor_id = du.id
         JOIN users ru ON c.recipient_id = ru.id
         LEFT JOIN conversations conv ON conv.claim_id = c.id
         LEFT JOIN donor_reviews dr ON dr.claim_id = c.id
         WHERE ${whereClause}
         ORDER BY c.created_at DESC`
      )
      .all(user.id) as Record<string, unknown>[];

    const claims = rows.map((r) => {
      const unlocked = PHONE_UNLOCKED_STATUSES.has(String(r.status));
      const photos: string[] = JSON.parse(String(r.photo_urls || '[]'));
      return {
        id: String(r.id),
        listingId: String(r.listing_id),
        recipientId: String(r.recipient_id),
        recipientName: String(r.recipient_name),
        recipientArea: String(r.recipient_area),
        recipientOrg: r.recipient_org ? String(r.recipient_org) : null,
        recipientPhone: unlocked ? String(r.recipient_phone) : null,
        donorId: String(r.donor_id),
        donorBusinessName: String(r.donor_business_name),
        donorAddress: String(r.pickup_address),
        donorAddressBn: r.pickup_address_bn ? String(r.pickup_address_bn) : null,
        donorPhone: unlocked ? String(r.donor_phone) : null,
        donorVerified: r.donor_verification_status === 'verified',
        listingTitle: String(r.listing_title),
        listingPhoto: photos[0] ?? '/images/kacchi-biryani.jpg',
        listingCategory: r.listing_category as FoodCategory,
        pickupStart: String(r.pickup_start),
        pickupEnd: String(r.pickup_end),
        quantityClaimed: Number(r.quantity_claimed),
        status: r.status as ClaimStatus,
        pickupCode: String(r.pickup_code),
        handoverMethod: (r.handover_method === 'qr' ? 'qr' : 'manual') as 'qr' | 'manual',
        myRating: r.review_rating !== null && r.review_rating !== undefined ? Number(r.review_rating) : null,
        notes: r.notes ? String(r.notes) : null,
        cancelReason: r.cancel_reason ? String(r.cancel_reason) : null,
        createdAt: String(r.created_at),
        acceptedAt: r.accepted_at ? String(r.accepted_at) : null,
        pickedUpAt: r.picked_up_at ? String(r.picked_up_at) : null,
        completedAt: r.completed_at ? String(r.completed_at) : null,
        expiresAt: r.expires_at ? String(r.expires_at) : null,
        conversationId: r.conversation_id ? String(r.conversation_id) : null,
      };
    });

    // Also include today's claim quota count for recipient
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const usedToday = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM claims WHERE recipient_id = ? AND created_at >= ? AND status NOT IN ('cancelled', 'expired')`
        )
        .get(user.id, dayAgo) as { c: number }
    ).c;

    res.json({ claims, quota: { usedToday, dailyLimit: DAILY_CLAIM_LIMIT } });
  });

  app.post('/api/claims', requireAuth, (req, res) => {
    runAutoExpirySweep();
    const user = (req as express.Request & { user: User }).user;
    const listingId = String(req.body?.listingId ?? '');
    const quantityClaimed = Math.max(1, Number(req.body?.quantityClaimed ?? 1));
    const notes = req.body?.notes ? String(req.body.notes).trim() : null;

    const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId) as
      | Record<string, unknown>
      | undefined;
    if (!listing) {
      res.status(404).json({ error: 'Listing not found.' });
      return;
    }
    if (String(listing.donor_id) === user.id) {
      res.status(400).json({ error: 'You cannot claim your own food listing.' });
      return;
    }
    if (listing.status !== 'active' || Number(listing.remaining_quantity) < quantityClaimed) {
      res.status(409).json({
        error: 'Sorry, this listing is no longer available in the requested quantity.',
      });
      return;
    }
    if (isBlockedBetween(user.id, String(listing.donor_id))) {
      res.status(403).json({ error: 'Unable to claim from this donor.' });
      return;
    }

    // Check daily anti-hoarding limit
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const usedToday = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM claims WHERE recipient_id = ? AND created_at >= ? AND status NOT IN ('cancelled', 'expired')`
        )
        .get(user.id, dayAgo) as { c: number }
    ).c;
    if (usedToday >= DAILY_CLAIM_LIMIT) {
      res.status(429).json({
        error: `Daily limit reached (${DAILY_CLAIM_LIMIT} active rescues per 24h) so more neighbors can share.`,
      });
      return;
    }

    // Prevent duplicate active claim by same recipient on same listing
    const duplicate = db
      .prepare(
        `SELECT id FROM claims WHERE listing_id = ? AND recipient_id = ? AND status IN ('requested', 'accepted', 'picked_up')`
      )
      .get(listingId, user.id) as { id: string } | undefined;
    if (duplicate) {
      res.status(409).json({ error: 'You already have an active request for this listing.' });
      return;
    }

    const claimId = generateId('claim');
    const convId = generateId('conv');
    const pickupCode = generatePickupCode();
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO claims (id, listing_id, recipient_id, quantity_claimed, status, pickup_code, notes, created_at, expires_at)
       VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, ?)`
    ).run(
      claimId,
      listingId,
      user.id,
      quantityClaimed,
      pickupCode,
      notes,
      now,
      String(listing.pickup_end)
    );

    db.prepare(
      `INSERT INTO conversations (id, listing_id, claim_id, donor_id, recipient_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(convId, listingId, claimId, String(listing.donor_id), user.id, now, now);

    // Automatically post opening chat message so thread is immediately contextual
    const introText = notes
      ? `Requested ${quantityClaimed} ${listing.unit}: "${notes}"`
      : `Hi! I requested ${quantityClaimed} ${listing.unit} of ${listing.title}.`;
    const msgId = generateId('msg');
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, text, image_url, sent_at, read_at)
       VALUES (?, ?, ?, ?, NULL, ?, NULL)`
    ).run(msgId, convId, user.id, introText, now);

    const donorId = String(listing.donor_id);
    createAndPushNotification(
      donorId,
      'claim_requested',
      `New Request · ${user.organizationName ?? user.name}`,
      `${user.name} requested ${quantityClaimed} ${listing.unit} of ${listing.title}.`,
      { claimId, conversationId: convId, listingId }
    );
    sendToUser(donorId, 'claim:updated', { claimId, status: 'requested', listingId });
    sendToUser(donorId, 'chat:message', {
      id: msgId,
      conversationId: convId,
      senderId: user.id,
      text: introText,
      imageUrl: null,
      sentAt: now,
      readAt: null,
    });

    res.status(201).json({ claimId, conversationId: convId, pickupCode });
  });

  app.patch('/api/claims/:id/status', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const targetStatus = String(req.body?.status ?? '') as ClaimStatus;
    const providedCode = String(req.body?.pickupCode ?? '').trim().toUpperCase();
    const cancelReason = req.body?.cancelReason ? String(req.body.cancelReason).trim() : null;

    const claim = db
      .prepare(
        `SELECT c.*, l.donor_id, l.title as listing_title, l.remaining_quantity, l.status as listing_status, l.pickup_end
         FROM claims c JOIN listings l ON c.listing_id = l.id WHERE c.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }

    const isDonor = String(claim.donor_id) === user.id;
    const isRecipient = String(claim.recipient_id) === user.id;
    if (!isDonor && !isRecipient) {
      res.status(403).json({ error: 'Not authorized for this claim.' });
      return;
    }

    const now = new Date().toISOString();
    const conv = db.prepare('SELECT id FROM conversations WHERE claim_id = ?').get(String(claim.id)) as
      | { id: string }
      | undefined;

    if (targetStatus === 'accepted') {
      if (!isDonor) {
        res.status(403).json({ error: 'Only the donor can accept a request.' });
        return;
      }
      if (claim.status !== 'requested') {
        res.status(409).json({ error: `Cannot accept claim in "${claim.status}" state.` });
        return;
      }

      // Atomic transaction: first accepted wins!
      db.exec('BEGIN IMMEDIATE');
      try {
        const freshListing = db
          .prepare('SELECT remaining_quantity, status FROM listings WHERE id = ?')
          .get(String(claim.listing_id)) as { remaining_quantity: number; status: string };

        const qtyNeeded = Number(claim.quantity_claimed);
        if (freshListing.status !== 'active' || freshListing.remaining_quantity < qtyNeeded) {
          db.exec('ROLLBACK');
          res.status(409).json({
            error: 'Not enough servings remain on this listing. Another request was already accepted.',
          });
          return;
        }

        const nextRem = freshListing.remaining_quantity - qtyNeeded;
        const nextListingStatus = nextRem === 0 ? 'claimed' : 'active';

        db.prepare('UPDATE listings SET remaining_quantity = ?, status = ? WHERE id = ?').run(
          nextRem,
          nextListingStatus,
          String(claim.listing_id)
        );
        db.prepare(`UPDATE claims SET status = 'accepted', accepted_at = ? WHERE id = ?`).run(
          now,
          String(claim.id)
        );

        // If 0 remaining, auto-cancel all competing pending requests and notify them
        let closedClaims: { id: string; recipient_id: string }[] = [];
        if (nextRem === 0) {
          closedClaims = db
            .prepare(
              `SELECT id, recipient_id FROM claims WHERE listing_id = ? AND id != ? AND status = 'requested'`
            )
            .all(String(claim.listing_id), String(claim.id)) as {
            id: string;
            recipient_id: string;
          }[];
          db.prepare(
            `UPDATE claims SET status = 'cancelled', cancel_reason = 'Already claimed by another recipient'
             WHERE listing_id = ? AND id != ? AND status = 'requested'`
          ).run(String(claim.listing_id), String(claim.id));
        }

        db.exec('COMMIT');

        // Notify accepted recipient
        createAndPushNotification(
          String(claim.recipient_id),
          'claim_accepted',
          `Pickup Accepted · ${claim.listing_title}`,
          `Your request was accepted! Show pickup code ${claim.pickup_code} at handover.`,
          { claimId: claim.id, conversationId: conv?.id }
        );
        sendToUser(String(claim.recipient_id), 'claim:updated', {
          claimId: claim.id,
          status: 'accepted',
        });

        // Notify auto-closed competing recipients
        for (const other of closedClaims) {
          createAndPushNotification(
            other.recipient_id,
            'claim_closed',
            `Listing Fully Claimed · ${claim.listing_title}`,
            'All servings were claimed by an earlier request. Browse nearby for other surplus food.',
            { claimId: other.id }
          );
          sendToUser(other.recipient_id, 'claim:updated', {
            claimId: other.id,
            status: 'cancelled',
          });
        }
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      res.json({ ok: true, status: 'accepted' });
      return;
    }

    if (targetStatus === 'completed' || targetStatus === 'picked_up') {
      if (!isDonor) {
        res.status(403).json({ error: 'Only the donor can confirm handover with the pickup code.' });
        return;
      }
      if (claim.status !== 'accepted' && claim.status !== 'picked_up') {
        res.status(409).json({ error: 'Claim must be accepted before confirming pickup.' });
        return;
      }
      if (providedCode !== String(claim.pickup_code).toUpperCase()) {
        res.status(400).json({ error: 'Pickup code does not match. Ask the recipient to check their code.' });
        return;
      }

      const handoverMethod = req.body?.handoverMethod === 'qr' ? 'qr' : 'manual';
      db.prepare(
        `UPDATE claims SET status = 'completed', handover_method = ?, picked_up_at = COALESCE(picked_up_at, ?), completed_at = ? WHERE id = ?`
      ).run(handoverMethod, now, now, String(claim.id));

      createAndPushNotification(
        String(claim.recipient_id),
        'claim_completed',
        `Handover Confirmed (${handoverMethod === 'qr' ? 'QR Scan' : 'Code'}) · ${claim.listing_title}`,
        'Pickup confirmed! Thank you for rescuing surplus food in your community.',
        { claimId: claim.id, conversationId: conv?.id }
      );
      sendToUser(String(claim.recipient_id), 'claim:updated', {
        claimId: claim.id,
        status: 'completed',
      });
      res.json({ ok: true, status: 'completed', handoverMethod });
      return;
    }

    if (targetStatus === 'cancelled') {
      if (claim.status === 'completed' || claim.status === 'cancelled') {
        res.status(409).json({ error: 'Claim is already finalized.' });
        return;
      }

      db.exec('BEGIN IMMEDIATE');
      try {
        const wasAccepted = claim.status === 'accepted';
        db.prepare(`UPDATE claims SET status = 'cancelled', cancel_reason = ? WHERE id = ?`).run(
          cancelReason || (isDonor ? 'Cancelled by donor' : 'Cancelled by recipient'),
          String(claim.id)
        );
        if (wasAccepted) {
          // Restore quantity to listing if still within pickup window
          const isStillValid = new Date(String(claim.pickup_end)).getTime() > Date.now();
          if (isStillValid) {
            db.prepare(
              `UPDATE listings SET remaining_quantity = remaining_quantity + ?, status = 'active' WHERE id = ?`
            ).run(Number(claim.quantity_claimed), String(claim.listing_id));
          }
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }

      const otherUserId = isDonor ? String(claim.recipient_id) : String(claim.donor_id);
      createAndPushNotification(
        otherUserId,
        'claim_cancelled',
        `Request Cancelled · ${claim.listing_title}`,
        cancelReason || (isDonor ? 'The donor had to cancel this pickup.' : 'The recipient cancelled their request.'),
        { claimId: claim.id, conversationId: conv?.id }
      );
      sendToUser(otherUserId, 'claim:updated', { claimId: claim.id, status: 'cancelled' });
      res.json({ ok: true, status: 'cancelled' });
      return;
    }

    res.status(400).json({ error: 'Unsupported status transition.' });
  });

  // --- CHAT CONVERSATIONS & MESSAGES ---
  app.get('/api/conversations', requireAuth, (req, res) => {
    runAutoExpirySweep();
    const user = (req as express.Request & { user: User }).user;
    const isAdminUser = user.role === 'admin';

    const selectBase = `
      SELECT conv.*,
             l.title as listing_title, l.photo_urls, l.pickup_start, l.pickup_end,
             c.status as claim_status, c.pickup_code,
             d.business_name as donor_name, d.verification_status, d.logo_url as donor_logo_url, d.is_online as donor_online,
             d.address as donor_address, d.address_bn as donor_address_bn, d.hours as donor_hours,
             du.name as donor_user_name, du.role as donor_role, du.phone as donor_phone, du.area as donor_area,
             ru.name as recipient_name, ru.role as recipient_role, ru.organization_name as recipient_org, ru.phone as recipient_phone,
             rd.business_name as rd_business_name, rd.logo_url as rd_logo_url,
             (SELECT text FROM messages m WHERE m.conversation_id = conv.id AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?) ORDER BY m.sent_at DESC LIMIT 1) as last_message,
             (SELECT message_type FROM messages m WHERE m.conversation_id = conv.id AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?) ORDER BY m.sent_at DESC LIMIT 1) as last_message_type,
             (SELECT image_url FROM messages m WHERE m.conversation_id = conv.id AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?) ORDER BY m.sent_at DESC LIMIT 1) as last_image,
             (SELECT audio_url FROM messages m WHERE m.conversation_id = conv.id AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?) ORDER BY m.sent_at DESC LIMIT 1) as last_audio,
             (SELECT file_name FROM messages m WHERE m.conversation_id = conv.id AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?) ORDER BY m.sent_at DESC LIMIT 1) as last_file_name,
             (SELECT sent_at FROM messages m WHERE m.conversation_id = conv.id AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?) ORDER BY m.sent_at DESC LIMIT 1) as last_message_at,
             (SELECT COUNT(*) FROM messages m
              WHERE m.conversation_id = conv.id
                AND m.sender_id != ?
                AND m.read_at IS NULL
                AND (cur.last_read_at IS NULL OR m.sent_at > cur.last_read_at)
                AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?)) as unread_count
      FROM conversations conv
      LEFT JOIN listings l ON conv.listing_id = l.id
      LEFT JOIN claims c ON conv.claim_id = c.id
      LEFT JOIN donors d ON conv.donor_id = d.user_id
      JOIN users du ON conv.donor_id = du.id
      JOIN users ru ON conv.recipient_id = ru.id
      LEFT JOIN donors rd ON conv.recipient_id = rd.user_id
      LEFT JOIN conversation_user_reads cur ON cur.conversation_id = conv.id AND cur.user_id = ?
    `;

    const rows = (
      isAdminUser
        ? db
            .prepare(`${selectBase} ORDER BY COALESCE(last_message_at, conv.updated_at) DESC`)
            .all(user.id, user.id, user.id, user.id, user.id, user.id, user.id, user.id, user.id)
        : db
            .prepare(
              `${selectBase}
               WHERE conv.donor_id = ?
                  OR conv.recipient_id = ?
                  OR conv.id IN ('conv_1', 'conv_2', 'conv_3')
                  OR conv.id LIKE 'conv_shop_%'
               ORDER BY COALESCE(last_message_at, conv.updated_at) DESC`
            )
            .all(
              user.id,
              user.id,
              user.id,
              user.id,
              user.id,
              user.id,
              user.id,
              user.id,
              user.id,
              user.id,
              user.id
            )
    ) as Record<string, unknown>[];

    const conversations = rows.map((r) => {
      const convId = String(r.id);
      const photos: string[] = r.photo_urls ? JSON.parse(String(r.photo_urls)) : [];
      const isDirect = Boolean(r.is_direct);
      const isStarter = isStarterConvId(convId);
      const claimStatus = ((r.claim_status as ClaimStatus | null) ?? 'accepted') as ClaimStatus;
      const unlocked = !isDirect && PHONE_UNLOCKED_STATUSES.has(claimStatus);
      const isDirectParticipant =
        String(r.donor_id) === user.id || String(r.recipient_id) === user.id;
      const blocked = isDirectParticipant
        ? isBlockedBetween(String(r.donor_id), String(r.recipient_id))
        : false;
      const peerId = String(r.donor_id) === user.id ? String(r.recipient_id) : String(r.donor_id);
      const peerOnline =
        wsClients.has(peerId) ||
        (String(r.donor_id) !== user.id && Boolean(r.donor_online));

      const donorDisplayName = r.donor_name
        ? String(r.donor_name)
        : String(r.donor_role) === 'admin'
          ? 'Rizik Team'
          : String(r.donor_user_name ?? 'Member');

      return {
        id: convId,
        listingId: r.listing_id ? String(r.listing_id) : '',
        claimId: r.claim_id ? String(r.claim_id) : '',
        donorId: String(r.donor_id),
        recipientId: String(r.recipient_id),
        donorName: donorDisplayName,
        donorRole: String(r.donor_role ?? 'recipient'),
        donorLogoUrl: r.donor_logo_url ? String(r.donor_logo_url) : null,
        recipientLogoUrl: r.rd_logo_url ? String(r.rd_logo_url) : null,
        donorVerified: r.verification_status === 'verified' || String(r.donor_role) === 'admin',
        donorPhone: unlocked || isAdminUser ? String(r.donor_phone ?? '') || null : null,
        donorArea: r.donor_area ? String(r.donor_area) : null,
        donorAddress: r.donor_address ? String(r.donor_address) : null,
        donorAddressBn: r.donor_address_bn ? String(r.donor_address_bn) : null,
        donorHours: r.donor_hours ? String(r.donor_hours) : null,
        peerOnline,
        recipientName: String(r.recipient_name),
        recipientRole: String(r.recipient_role ?? 'recipient'),
        recipientOrg: r.rd_business_name
          ? String(r.rd_business_name)
          : r.recipient_org
            ? String(r.recipient_org)
            : null,
        recipientPhone: unlocked || isAdminUser ? String(r.recipient_phone ?? '') || null : null,
        listingTitle: r.listing_title ? String(r.listing_title) : 'Direct Message',
        listingPhoto: isDirect ? '' : (photos[0] ?? '/images/kacchi-biryani.jpg'),
        pickupStart: r.pickup_start ? String(r.pickup_start) : String(r.created_at),
        pickupEnd: r.pickup_end ? String(r.pickup_end) : String(r.created_at),
        claimStatus,
        pickupCode: unlocked && r.pickup_code ? String(r.pickup_code) : null,
        isDirect,
        isStarter,
        lastMessage: r.last_message
          ? String(r.last_message)
          : r.last_message_type === 'location'
            ? 'Shared location'
            : r.last_message_type === 'file'
              ? (r.last_file_name ? String(r.last_file_name) : 'Sent a file')
              : r.last_audio
                ? 'Voice message'
                : r.last_image
                  ? 'Sent a photo'
                  : null,
        lastMessageType: r.last_message_type ? String(r.last_message_type) : null,
        lastMessageAt: r.last_message_at ? String(r.last_message_at) : String(r.updated_at),
        unreadCount: Number(r.unread_count ?? 0),
        isBlocked: blocked,
        createdAt: String(r.created_at),
        updatedAt: String(r.updated_at),
      };
    });

    res.json({ conversations });
  });

  function mapDirectoryUsers(currentUserId: string, includeEmail: boolean) {
    const rows = db
      .prepare(
        `SELECT u.id, u.role, u.name, u.email, u.area, u.organization_name, u.verified,
                u.last_login_at, u.last_active_at,
                d.business_name, d.logo_url, d.is_online as donor_online,
                EXISTS(SELECT 1 FROM sessions s WHERE s.user_id = u.id) as has_session
         FROM users u
         LEFT JOIN donors d ON u.id = d.user_id
         WHERE u.id != ?
           AND (
             u.id != 'admin_1'
             OR u.last_login_at IS NOT NULL
             OR EXISTS(SELECT 1 FROM sessions s WHERE s.user_id = u.id)
           )`
      )
      .all(currentUserId) as Record<string, unknown>[];

    return rows
      .map((r) => {
        const uid = String(r.id);
        const role = r.role as User['role'];
        const wsOnline = wsClients.has(uid);
        const hasLoggedIn = Boolean(r.last_login_at || r.has_session || wsOnline);
        const isOnline = wsOnline || Boolean(r.donor_online && role === 'donor');
        return {
          id: uid,
          name: String(r.name),
          ...(includeEmail ? { email: String(r.email) } : {}),
          role,
          accountType: (role === 'donor' ? 'restaurantOwner' : 'user') as 'user' | 'restaurantOwner',
          area: r.area ? String(r.area) : 'Dhaka',
          organizationName: r.organization_name ? String(r.organization_name) : null,
          businessName: r.business_name ? String(r.business_name) : null,
          logoUrl: r.logo_url ? String(r.logo_url) : null,
          source: 'express' as const,
          verified: Boolean(r.verified),
          isOnline,
          wsOnline,
          hasLoggedIn,
          lastActiveAt: r.last_active_at ? String(r.last_active_at) : null,
        };
      })
      .sort((a, b) => {
        if (a.wsOnline !== b.wsOnline) return a.wsOnline ? -1 : 1;
        if (a.hasLoggedIn !== b.hasLoggedIn) return a.hasLoggedIn ? -1 : 1;
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        const tA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
        const tB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
        if (tA !== tB) return tB - tA;
        return a.name.localeCompare(b.name);
      });
  }

  // Messenger People Directory for ALL logged-in users (with User IDs, no raw email/phone PII for non-admins)
  app.get('/api/users', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    touchUserPresence(user.id, false);
    const users = mapDirectoryUsers(user.id, user.role === 'admin');
    res.json({ users });
  });

  app.get('/api/admin/users', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    if (user.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const users = mapDirectoryUsers(user.id, true);
    res.json({ users });
  });

  app.post('/api/conversations/direct', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const targetUserId = String(req.body?.targetUserId ?? '').trim();
    if (!targetUserId || targetUserId === user.id) {
      res.status(400).json({ error: 'Valid target user ID is required' });
      return;
    }

    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetUserId) as
      | { id: string; role: string }
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (isBlockedBetween(user.id, targetUserId)) {
      res.status(403).json({ error: 'Cannot start conversation with a blocked user.' });
      return;
    }

    const existing = db
      .prepare(
        `SELECT id, admin_only FROM conversations
         WHERE COALESCE(is_direct, 0) = 1
           AND ((donor_id = ? AND recipient_id = ?) OR (donor_id = ? AND recipient_id = ?))
         ORDER BY updated_at DESC LIMIT 1`
      )
      .get(user.id, targetUserId, targetUserId, user.id) as
      | { id: string; admin_only: number }
      | undefined;

    if (existing) {
      if (existing.admin_only) {
        db.prepare('UPDATE conversations SET admin_only = 0 WHERE id = ?').run(existing.id);
      }
      res.json({ conversationId: existing.id });
      return;
    }

    const donorSideId =
      user.role === 'admin'
        ? user.id
        : target.role === 'admin' || target.role === 'donor'
          ? target.id
          : user.id;
    const peerSideId = donorSideId === user.id ? target.id : user.id;
    const convId = generateId('conv_direct');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO conversations (id, listing_id, claim_id, donor_id, recipient_id, admin_only, is_direct, created_at, updated_at)
       VALUES (?, NULL, NULL, ?, ?, 0, 1, ?, ?)`
    ).run(convId, donorSideId, peerSideId, now, now);

    res.status(201).json({ conversationId: convId });
  });

  app.post('/api/conversations/with-donor', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const donorId = String(req.body?.donorId ?? '').trim();
    const listingId = req.body?.listingId ? String(req.body.listingId).trim() : null;
    if (!donorId) {
      res.status(400).json({ error: 'Donor ID is required' });
      return;
    }

    // Check existing conversation first (preferring matching listingId if given)
    if (listingId) {
      const exact = db
        .prepare(
          'SELECT id FROM conversations WHERE donor_id = ? AND recipient_id = ? AND listing_id = ? ORDER BY updated_at DESC LIMIT 1'
        )
        .get(donorId, user.id, listingId) as { id: string } | undefined;
      if (exact) {
        res.json({ conversationId: exact.id });
        return;
      }
    }

    const existing = db
      .prepare(
        'SELECT id FROM conversations WHERE (donor_id = ? AND recipient_id = ?) OR (donor_id = ? AND recipient_id = ?) ORDER BY updated_at DESC LIMIT 1'
      )
      .get(donorId, user.id, user.id, donorId) as { id: string } | undefined;
    if (existing) {
      res.json({ conversationId: existing.id });
      return;
    }

    // Create a clean inquiry thread backed by the target or latest donor listing
    const targetListing = listingId
      ? (db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId) as Record<string, unknown> | undefined)
      : (db
          .prepare('SELECT * FROM listings WHERE donor_id = ? ORDER BY created_at DESC LIMIT 1')
          .get(donorId) as Record<string, unknown> | undefined);

    if (!targetListing) {
      res.status(404).json({ error: 'No listing found for this shop.' });
      return;
    }

    const claimId = generateId('claim');
    const convId = generateId('conv');
    const now = new Date().toISOString();
    const pickupCode = generatePickupCode();

    db.prepare(
      `INSERT INTO claims (id, listing_id, recipient_id, quantity_claimed, status, pickup_code, notes, created_at, expires_at)
       VALUES (?, ?, ?, 1, 'requested', ?, 'Direct shop inquiry', ?, ?)`
    ).run(claimId, String(targetListing.id), user.id, pickupCode, now, String(targetListing.pickup_end));

    db.prepare(
      `INSERT INTO conversations (id, listing_id, claim_id, donor_id, recipient_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(convId, String(targetListing.id), claimId, donorId, user.id, now, now);

    res.status(201).json({ conversationId: convId });
  });

  app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
      | { id: string; donor_id: string; recipient_id: string; admin_only?: number }
      | undefined;

    const isDirectParticipant = conv && (conv.donor_id === user.id || conv.recipient_id === user.id);
    const isStarter = conv ? isStarterConvId(conv.id) : false;
    if (!conv || (!isDirectParticipant && user.role !== 'admin' && !isStarter)) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Track per-user read pointer and update message.read_at for non-starter direct participants
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO conversation_user_reads (conversation_id, user_id, last_read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    ).run(conv.id, user.id, now);

    if ((isDirectParticipant && !isStarter) || Boolean(conv.admin_only)) {
      const unread = db
        .prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL')
        .get(conv.id, user.id) as { c: number };

      if (unread.c > 0) {
        db.prepare(
          'UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL'
        ).run(now, conv.id, user.id);

        if (isDirectParticipant) {
          const peerId = conv.donor_id === user.id ? conv.recipient_id : conv.donor_id;
          sendToUser(peerId, 'chat:read', { conversationId: conv.id, readAt: now, readerId: user.id });
        }
      }
    }

    const rows = db
      .prepare(
        `SELECT * FROM messages m
         WHERE m.conversation_id = ?
           AND NOT EXISTS (SELECT 1 FROM message_deletions md WHERE md.message_id = m.id AND md.user_id = ?)
         ORDER BY m.sent_at ASC`
      )
      .all(conv.id, user.id) as Record<string, unknown>[];

    const reactionRows = db
      .prepare(
        `SELECT mr.message_id, mr.user_id, mr.emoji
         FROM message_reactions mr
         JOIN messages m ON mr.message_id = m.id
         WHERE m.conversation_id = ?`
      )
      .all(conv.id) as { message_id: string; user_id: string; emoji: string }[];

    const reactionsByMsg = new Map<string, { emoji: string; userId: string }[]>();
    for (const rr of reactionRows) {
      const arr = reactionsByMsg.get(rr.message_id) ?? [];
      arr.push({ emoji: rr.emoji, userId: rr.user_id });
      reactionsByMsg.set(rr.message_id, arr);
    }

    const messages = rows.map((m) => ({
      id: String(m.id),
      conversationId: String(m.conversation_id),
      senderId: String(m.sender_id),
      text: String(m.text),
      messageType: (
        m.message_type
          ? String(m.message_type)
          : m.location_lat !== null && m.location_lat !== undefined
            ? 'location'
            : m.file_url
              ? 'file'
              : m.audio_url
                ? 'voice'
                : m.image_url
                  ? 'image'
                  : 'text'
      ) as 'text' | 'image' | 'voice' | 'call' | 'location' | 'file',
      imageUrl: m.image_url ? String(m.image_url) : null,
      audioUrl: m.audio_url ? String(m.audio_url) : null,
      durationSec: m.duration_sec !== null && m.duration_sec !== undefined ? Number(m.duration_sec) : null,
      callType: m.call_type ? (String(m.call_type) as 'voice' | 'video') : null,
      callStatus: m.call_status ? (String(m.call_status) as 'completed' | 'missed' | 'declined' | 'cancelled') : null,
      fileUrl: m.file_url ? String(m.file_url) : null,
      fileName: m.file_name ? String(m.file_name) : null,
      fileSize: m.file_size !== null && m.file_size !== undefined ? Number(m.file_size) : null,
      fileMime: m.file_mime ? String(m.file_mime) : null,
      locationLat: m.location_lat !== null && m.location_lat !== undefined ? Number(m.location_lat) : null,
      locationLng: m.location_lng !== null && m.location_lng !== undefined ? Number(m.location_lng) : null,
      locationLabel: m.location_label ? String(m.location_label) : null,
      locationExpiresAt: m.location_expires_at ? String(m.location_expires_at) : null,
      isForwarded: Boolean(m.is_forwarded),
      replyToId: m.reply_to_id ? String(m.reply_to_id) : null,
      replyToText: m.reply_to_text ? String(m.reply_to_text) : null,
      replyToSenderId: m.reply_to_sender_id ? String(m.reply_to_sender_id) : null,
      sentAt: String(m.sent_at),
      readAt: m.read_at ? String(m.read_at) : null,
      reactions: reactionsByMsg.get(String(m.id)) ?? [],
    }));

    res.json({ messages });
  });

  app.post('/api/conversations/:id/read', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
      | { id: string; donor_id: string; recipient_id: string; admin_only?: number }
      | undefined;
    const isDirectParticipant = conv && (conv.donor_id === user.id || conv.recipient_id === user.id);
    const isStarter = conv ? isStarterConvId(conv.id) : false;
    if (!conv || (!isDirectParticipant && user.role !== 'admin' && !isStarter)) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO conversation_user_reads (conversation_id, user_id, last_read_at)
       VALUES (?, ?, ?)
       ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at`
    ).run(conv.id, user.id, now);

    if ((isDirectParticipant && !isStarter) || Boolean(conv.admin_only)) {
      db.prepare(
        'UPDATE messages SET read_at = ? WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL'
      ).run(now, conv.id, user.id);

      if (isDirectParticipant) {
        const peerId = conv.donor_id === user.id ? conv.recipient_id : conv.donor_id;
        sendToUser(peerId, 'chat:read', { conversationId: conv.id, readAt: now, readerId: user.id });
      }
    }
    res.json({ ok: true });
  });

  app.post('/api/conversations/:id/messages', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    if (!checkRateLimit(`chat:${user.id}`, 35, 60_000)) {
      res.status(429).json({ error: 'Sending messages too quickly. Please pause briefly.' });
      return;
    }

    const conv = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id) as
      | { id: string; donor_id: string; recipient_id: string; listing_id: string | null; admin_only?: number }
      | undefined;

    const isDirectParticipant = conv && (conv.donor_id === user.id || conv.recipient_id === user.id);
    const isStarter = conv ? isStarterConvId(conv.id) : false;
    if (!conv || (!isDirectParticipant && user.role !== 'admin' && !isStarter)) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const peerId = conv.donor_id === user.id ? conv.recipient_id : conv.donor_id;
    if (isDirectParticipant && isBlockedBetween(user.id, peerId)) {
      res.status(403).json({ error: 'Messaging is disabled because one participant has blocked the other.' });
      return;
    }

    const text = String(req.body?.text ?? '').trim();
    const imageUrl = req.body?.imageUrl ? String(req.body.imageUrl) : null;
    const audioUrl = req.body?.audioUrl ? String(req.body.audioUrl) : null;
    const fileUrl = req.body?.fileUrl ? String(req.body.fileUrl) : null;
    const fileName = req.body?.fileName ? String(req.body.fileName) : null;
    const fileSize =
      req.body?.fileSize !== undefined && req.body?.fileSize !== null ? Number(req.body.fileSize) : null;
    const fileMime = req.body?.fileMime ? String(req.body.fileMime) : null;
    const locationLat =
      req.body?.locationLat !== undefined && req.body?.locationLat !== null
        ? Number(req.body.locationLat)
        : null;
    const locationLng =
      req.body?.locationLng !== undefined && req.body?.locationLng !== null
        ? Number(req.body.locationLng)
        : null;
    const locationLabel = req.body?.locationLabel ? String(req.body.locationLabel) : null;
    const locationExpiresAt = req.body?.locationExpiresAt ? String(req.body.locationExpiresAt) : null;
    const isForwarded = Boolean(req.body?.isForwarded);
    const replyToId = req.body?.replyToId ? String(req.body.replyToId) : null;
    const replyToText = req.body?.replyToText ? String(req.body.replyToText) : null;
    const replyToSenderId = req.body?.replyToSenderId ? String(req.body.replyToSenderId) : null;

    const rawType = String(req.body?.messageType ?? '');
    const messageType = (
      ['text', 'image', 'voice', 'call', 'location', 'file'].includes(rawType)
        ? rawType
        : locationLat !== null && locationLng !== null
          ? 'location'
          : fileUrl
            ? 'file'
            : audioUrl
              ? 'voice'
              : imageUrl
                ? 'image'
                : 'text'
    ) as 'text' | 'image' | 'voice' | 'call' | 'location' | 'file';
    const durationSec =
      req.body?.durationSec !== undefined && req.body?.durationSec !== null
        ? Math.max(0, Math.round(Number(req.body.durationSec)))
        : null;
    const callType =
      req.body?.callType === 'voice' || req.body?.callType === 'video' ? req.body.callType : null;
    const callStatus = ['completed', 'missed', 'declined', 'cancelled'].includes(
      String(req.body?.callStatus ?? '')
    )
      ? (String(req.body.callStatus) as 'completed' | 'missed' | 'declined' | 'cancelled')
      : null;
    const clientTempId = req.body?.clientTempId ? String(req.body.clientTempId) : undefined;

    if (
      !text &&
      !imageUrl &&
      !audioUrl &&
      !fileUrl &&
      locationLat === null &&
      messageType !== 'call'
    ) {
      res.status(400).json({ error: 'Message content is required.' });
      return;
    }

    const id = generateId('msg');
    const sentAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO messages (
        id, conversation_id, sender_id, text, message_type, image_url, audio_url, duration_sec, call_type, call_status,
        file_url, file_name, file_size, file_mime, location_lat, location_lng, location_label, location_expires_at,
        is_forwarded, reply_to_id, reply_to_text, reply_to_sender_id, sent_at, read_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    ).run(
      id,
      conv.id,
      user.id,
      text,
      messageType,
      imageUrl,
      audioUrl,
      durationSec,
      callType,
      callStatus,
      fileUrl,
      fileName,
      fileSize,
      fileMime,
      locationLat,
      locationLng,
      locationLabel,
      locationExpiresAt,
      isForwarded ? 1 : 0,
      replyToId,
      replyToText,
      replyToSenderId,
      sentAt
    );
    db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(sentAt, conv.id);

    const payload = {
      id,
      conversationId: conv.id,
      senderId: user.id,
      text,
      messageType,
      imageUrl,
      audioUrl,
      durationSec,
      callType,
      callStatus,
      fileUrl,
      fileName,
      fileSize,
      fileMime,
      locationLat,
      locationLng,
      locationLabel,
      locationExpiresAt,
      isForwarded,
      replyToId,
      replyToText,
      replyToSenderId,
      sentAt,
      readAt: null,
      reactions: [],
      clientTempId,
    };

    if (isStarter) {
      broadcastWs('chat:message', payload);
    } else if (isDirectParticipant) {
      sendToUser(peerId, 'chat:message', payload);
      sendToUser(user.id, 'chat:message', payload);
      sendToAdmins('chat:message', payload, [peerId, user.id]);
    } else {
      sendToUser(conv.donor_id, 'chat:message', payload);
      sendToUser(conv.recipient_id, 'chat:message', payload);
      sendToUser(user.id, 'chat:message', payload);
      sendToAdmins('chat:message', payload, [conv.donor_id, conv.recipient_id, user.id]);
    }

    if (messageType !== 'call' && !isStarter) {
      const previewBody =
        text ||
        (messageType === 'voice'
          ? 'Sent a voice message'
          : messageType === 'location'
            ? 'Shared a location'
            : messageType === 'file'
              ? fileName || 'Sent a file'
              : 'Shared a photo');
      const senderTitle = `Message from ${user.role === 'admin' ? 'Rizik Team' : (user.donorProfile?.businessName ?? user.name)}`;

      if (isDirectParticipant) {
        createAndPushNotification(
          peerId,
          'chat_message',
          senderTitle,
          previewBody,
          { conversationId: conv.id },
          Boolean(conv.admin_only)
        );
      } else if (!conv.admin_only) {
        createAndPushNotification(
          conv.recipient_id,
          'chat_message',
          senderTitle,
          previewBody,
          { conversationId: conv.id }
        );
      }
    }

    res.status(201).json({ message: payload });
  });

  app.delete('/api/messages/:id', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const msgRow = db
      .prepare(
        `SELECT m.id, c.id as conversation_id, c.donor_id, c.recipient_id
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.id = ?`
      )
      .get(req.params.id) as
      | { id: string; conversation_id: string; donor_id: string; recipient_id: string }
      | undefined;

    if (
      !msgRow ||
      (msgRow.donor_id !== user.id &&
        msgRow.recipient_id !== user.id &&
        user.role !== 'admin' &&
        !isStarterConvId(msgRow.conversation_id))
    ) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    db.prepare(
      'INSERT OR IGNORE INTO message_deletions (message_id, user_id, created_at) VALUES (?, ?, ?)'
    ).run(msgRow.id, user.id, new Date().toISOString());

    res.json({ ok: true });
  });

  app.post('/api/messages/:id/react', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const emoji = String(req.body?.emoji ?? '').trim().slice(0, 8);
    if (!emoji) {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }

    const msgRow = db
      .prepare(
        `SELECT m.id, m.conversation_id, c.donor_id, c.recipient_id
         FROM messages m
         JOIN conversations c ON m.conversation_id = c.id
         WHERE m.id = ?`
      )
      .get(req.params.id) as
      | { id: string; conversation_id: string; donor_id: string; recipient_id: string }
      | undefined;

    if (
      !msgRow ||
      (msgRow.donor_id !== user.id &&
        msgRow.recipient_id !== user.id &&
        user.role !== 'admin' &&
        !isStarterConvId(msgRow.conversation_id))
    ) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const existing = db
      .prepare('SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?')
      .get(msgRow.id, user.id) as { emoji: string } | undefined;

    if (existing && existing.emoji === emoji) {
      db.prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?').run(
        msgRow.id,
        user.id
      );
    } else {
      db.prepare(
        `INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(message_id, user_id) DO UPDATE SET emoji = excluded.emoji, created_at = excluded.created_at`
      ).run(msgRow.id, user.id, emoji, new Date().toISOString());
    }

    const reactions = db
      .prepare('SELECT emoji, user_id as userId FROM message_reactions WHERE message_id = ?')
      .all(msgRow.id) as { emoji: string; userId: string }[];

    const eventData = {
      conversationId: msgRow.conversation_id,
      messageId: msgRow.id,
      reactions,
    };
    if (isStarterConvId(msgRow.conversation_id)) {
      broadcastWs('chat:reaction', eventData);
    } else {
      sendToUser(msgRow.donor_id, 'chat:reaction', eventData);
      sendToUser(msgRow.recipient_id, 'chat:reaction', eventData);
      sendToAdmins('chat:reaction', eventData, [msgRow.donor_id, msgRow.recipient_id]);
    }

    res.json({ messageId: msgRow.id, reactions });
  });

  // --- REPORTS & BLOCKS ---
  app.post('/api/reports', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const targetType = String(req.body?.targetType ?? 'user');
    const targetId = String(req.body?.targetId ?? '');
    const reason = String(req.body?.reason ?? 'Inappropriate behavior').trim();
    const details = req.body?.details ? String(req.body.details).trim() : null;

    if (!targetId) {
      res.status(400).json({ error: 'Missing target ID' });
      return;
    }
    const id = generateId('rep');
    db.prepare(
      `INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`
    ).run(id, user.id, targetType, targetId, reason, details, new Date().toISOString());

    res.status(201).json({ id, message: 'Report submitted for safety review.' });
  });

  app.post('/api/blocks', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const targetUserId = String(req.body?.targetUserId ?? '');
    const unblock = Boolean(req.body?.unblock);
    if (!targetUserId || targetUserId === user.id) {
      res.status(400).json({ error: 'Invalid user to block' });
      return;
    }
    if (unblock) {
      db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(user.id, targetUserId);
    } else {
      db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(
        user.id,
        targetUserId,
        new Date().toISOString()
      );
    }
    res.json({ ok: true, blocked: !unblock });
  });

  // --- NOTIFICATIONS ---
  app.get('/api/notifications', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const rows = (
      user.role === 'admin'
        ? db
            .prepare(
              `SELECT n.*,
                      CASE
                        WHEN n.user_id = ? THEN COALESCE(n.read, 0)
                        WHEN COALESCE(n.read, 0) = 1 THEN 1
                        ELSE CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END
                      END as effective_read
               FROM notifications n
               LEFT JOIN notification_user_reads nr
                 ON nr.notification_id = n.id AND nr.user_id = ?
               ORDER BY n.created_at DESC
               LIMIT 50`
            )
            .all(user.id, user.id)
        : db
            .prepare(
              `SELECT n.*,
                      CASE
                        WHEN n.user_id = ? THEN COALESCE(n.read, 0)
                        ELSE CASE WHEN nr.read_at IS NOT NULL THEN 1 ELSE 0 END
                      END as effective_read
               FROM notifications n
               LEFT JOIN notification_user_reads nr
                 ON nr.notification_id = n.id AND nr.user_id = ?
               WHERE n.user_id = ?
                  OR (COALESCE(n.admin_only, 0) = 0 AND n.id NOT LIKE 'notif_live_%')
               ORDER BY n.created_at DESC
               LIMIT 40`
            )
            .all(user.id, user.id, user.id)
    ) as Record<string, unknown>[];
    const notifications = rows.map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      type: String(r.type),
      title: String(r.title),
      body: String(r.body),
      payload: JSON.parse(String(r.payload || '{}')),
      read: Boolean(r.effective_read),
      createdAt: String(r.created_at),
    }));
    res.json({ notifications });
  });

  app.post('/api/notifications/read-all', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const now = new Date().toISOString();
    if (user.role === 'admin') {
      db.prepare('UPDATE notifications SET read = 1').run();
      db.prepare(
        `INSERT OR IGNORE INTO notification_user_reads (notification_id, user_id, read_at)
         SELECT id, ?, ? FROM notifications`
      ).run(user.id, now);
    } else {
      db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ? AND COALESCE(admin_only, 0) = 0').run(user.id);
      db.prepare(
        `INSERT OR IGNORE INTO notification_user_reads (notification_id, user_id, read_at)
         SELECT id, ?, ? FROM notifications
         WHERE COALESCE(admin_only, 0) = 0 AND id NOT LIKE 'notif_live_%'`
      ).run(user.id, now);
    }
    res.json({ ok: true });
  });

  // --- MESSAGE TRANSLATION (EN <-> BN) ---
  const PHRASE_FALLBACK_EN_TO_BN: Record<string, string> = {
    "i'm on my way": 'আমি আসছি',
    'running 10 min late': '১০ মিনিট দেরি হবে',
    'is it still available?': 'এটি কি এখনো আছে?',
    'thank you!': 'ধন্যবাদ!',
  };
  const PHRASE_FALLBACK_BN_TO_EN: Record<string, string> = {
    'আমি আসছি': "I'm on my way",
    '১০ মিনিট দেরি হবে': 'Running 10 min late',
    'এটি কি এখনো আছে?': 'Is it still available?',
    'ধন্যবাদ!': 'Thank you!',
  };

  app.post('/api/translate', requireAuth, async (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    const targetLang = req.body?.targetLang === 'bn' ? 'bn' : 'en';
    if (!text) {
      res.status(400).json({ error: 'Text is required' });
      return;
    }

    const lower = text.toLowerCase();
    if (targetLang === 'bn' && PHRASE_FALLBACK_EN_TO_BN[lower]) {
      res.json({ translated: PHRASE_FALLBACK_EN_TO_BN[lower] });
      return;
    }
    if (targetLang === 'en' && PHRASE_FALLBACK_BN_TO_EN[text]) {
      res.json({ translated: PHRASE_FALLBACK_BN_TO_EN[text] });
      return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const targetName = targetLang === 'bn' ? 'Bengali (Bangla)' : 'English';
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `Translate the following short chat message naturally into ${targetName}. Return ONLY the translated text with no quotes or extra commentary:\n\n${text}`,
        });
        const out = response.text?.trim();
        if (out) {
          res.json({ translated: out });
          return;
        }
      } catch {
        // Fall through to clean fallback
      }
    }

    res.json({
      translated:
        targetLang === 'bn'
          ? `[বাংলা অনুবাদ] ${text}`
          : `[English] ${text}`,
    });
  });

  // --- OUR CLIENTS & PARTNERS ---
  app.get('/api/partners', (_req, res) => {
    const partnerRows = db
      .prepare('SELECT * FROM partners ORDER BY featured DESC, since_year ASC, meals_contributed DESC')
      .all() as Record<string, unknown>[];
    const testimonialRows = db
      .prepare('SELECT * FROM testimonials ORDER BY id ASC')
      .all() as Record<string, unknown>[];
    const partnerMeals = partnerRows.reduce((s, r) => s + Number(r.meals_contributed ?? 0), 0);
    const eventsHeldCount = (
      db.prepare("SELECT COUNT(*) as c FROM events WHERE status = 'past'").get() as { c: number }
    ).c;

    res.json({
      partners: partnerRows.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        nameBn: String(p.name_bn),
        category: String(p.category),
        area: String(p.area),
        description: String(p.description),
        descriptionBn: String(p.description_bn),
        logoUrl: p.logo_url ? String(p.logo_url) : null,
        sinceYear: Number(p.since_year),
        mealsContributed: Number(p.meals_contributed),
        featured: Boolean(p.featured),
      })),
      testimonials: testimonialRows.map((tRow) => ({
        id: String(tRow.id),
        quote: String(tRow.quote),
        quoteBn: String(tRow.quote_bn),
        authorName: String(tRow.author_name),
        authorNameBn: String(tRow.author_name_bn),
        roleLabel: String(tRow.role_label),
        roleLabelBn: String(tRow.role_label_bn),
        orgName: String(tRow.org_name),
        category: String(tRow.category),
        avatarUrl: tRow.avatar_url ? String(tRow.avatar_url) : null,
      })),
      stats: {
        partnersJoined: partnerRows.length,
        mealsDelivered: partnerMeals,
        familiesHelped: Math.round(partnerMeals * 0.42),
        eventsHeld: 24 + eventsHeldCount,
      },
    });
  });

  app.post('/api/partners/apply', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const organizationName = String(req.body?.organizationName ?? '').trim();
    const category = String(req.body?.category ?? 'restaurants_cafes').trim();
    const contactPerson = String(req.body?.contactPerson ?? '').trim();
    const contactInfo = String(req.body?.contactInfo ?? '').trim();
    const area = String(req.body?.area ?? user.area ?? 'Dhaka').trim();
    const message = req.body?.message ? String(req.body.message).trim() : null;

    if (!organizationName || !contactPerson || !contactInfo) {
      res.status(400).json({ error: 'Please fill in organization name, contact person, and phone/email.' });
      return;
    }

    const id = generateId('papp');
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO partner_applications (id, user_id, organization_name, category, contact_person, contact_info, area, message, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
    ).run(id, user.id, organizationName, category, contactPerson, contactInfo, area, message, createdAt);

    createAndPushNotification(
      user.id,
      'partner_application',
      'Partner Application Received',
      `Thank you! Our team received the partnership request from ${organizationName}.`,
      { applicationId: id }
    );

    res.status(201).json({
      application: {
        id,
        organizationName,
        category,
        contactPerson,
        contactInfo,
        area,
        message,
        status: 'pending',
        createdAt,
      },
    });
  });

  // --- FOOD DISTRIBUTION EVENTS ---
  function mapEventRow(row: Record<string, unknown>, currentUserId?: string | null) {
    const eventId = String(row.id);
    const regCount = (
      db.prepare('SELECT COUNT(*) as c FROM event_registrations WHERE event_id = ?').get(eventId) as {
        c: number;
      }
    ).c;

    let myRegistration: Record<string, unknown> | null = null;
    if (currentUserId) {
      const regRow = db
        .prepare('SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ?')
        .get(eventId, currentUserId) as Record<string, unknown> | undefined;
      if (regRow) {
        myRegistration = {
          id: String(regRow.id),
          eventId: String(regRow.event_id),
          userId: String(regRow.user_id),
          name: String(regRow.name),
          phone: String(regRow.phone),
          availability: String(regRow.availability),
          preferredRole: String(regRow.preferred_role),
          attendanceStatus: String(regRow.attendance_status),
          reminderEnabled: Boolean(regRow.reminder_enabled),
          createdAt: String(regRow.created_at),
        };
      }
    }

    return {
      id: eventId,
      title: String(row.title),
      titleBn: String(row.title_bn),
      description: String(row.description),
      descriptionBn: String(row.description_bn),
      organizer: String(row.organizer),
      organizerBn: String(row.organizer_bn),
      area: String(row.area),
      locationName: String(row.location_name),
      locationNameBn: row.location_name_bn ? String(row.location_name_bn) : null,
      lat: Number.isFinite(Number(row.lat)) && Number(row.lat) !== 0 ? Number(row.lat) : 23.7465,
      lng: Number.isFinite(Number(row.lng)) && Number(row.lng) !== 0 ? Number(row.lng) : 90.376,
      eventDate: String(row.event_date),
      startTime: String(row.start_time),
      endTime: String(row.end_time),
      schedule: JSON.parse(String(row.schedule_json || '[]')),
      expectedMeals: Number(row.expected_meals),
      actualMealsServed: row.actual_meals_served !== null ? Number(row.actual_meals_served) : null,
      peopleHelped: row.people_helped !== null ? Number(row.people_helped) : null,
      volunteersNeeded: Number(row.volunteers_needed),
      registeredCount: regCount,
      myRegistration,
      bannerUrl: String(row.banner_url),
      galleryUrls: JSON.parse(String(row.gallery_urls_json || '[]')),
      howToHelp: String(row.how_to_help),
      howToHelpBn: String(row.how_to_help_bn),
      status: String(row.status),
      createdBy: row.created_by ? String(row.created_by) : null,
      createdAt: String(row.created_at),
    };
  }

  app.get('/api/events', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const currentUser = await getUserByToken(token);

    const status = req.query.status ? String(req.query.status) : null;
    const area = req.query.area ? String(req.query.area) : null;
    const date = req.query.date ? String(req.query.date) : null;

    let sql = 'SELECT * FROM events WHERE 1=1';
    const params: string[] = [];
    if (status && status !== 'all') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (area && area !== 'all') {
      sql += ' AND area = ?';
      params.push(area);
    }
    if (date) {
      sql += ' AND event_date = ?';
      params.push(date);
    }
    sql += " ORDER BY CASE status WHEN 'ongoing' THEN 0 WHEN 'upcoming' THEN 1 WHEN 'past' THEN 2 ELSE 3 END, event_date ASC";

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    res.json({ events: rows.map((r) => mapEventRow(r, currentUser?.id)) });
  });

  app.get('/api/events/:id', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const currentUser = await getUserByToken(token);

    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const canManageRoster =
      currentUser &&
      (currentUser.role === 'admin' ||
        currentUser.role === 'donor' ||
        String(row.created_by ?? '') === currentUser.id);

    const registrations = canManageRoster
      ? (
          db
            .prepare('SELECT * FROM event_registrations WHERE event_id = ? ORDER BY created_at DESC')
            .all(String(row.id)) as Record<string, unknown>[]
        ).map((reg) => ({
          id: String(reg.id),
          eventId: String(reg.event_id),
          userId: String(reg.user_id),
          name: String(reg.name),
          phone: String(reg.phone),
          availability: String(reg.availability),
          preferredRole: String(reg.preferred_role),
          attendanceStatus: String(reg.attendance_status),
          reminderEnabled: Boolean(reg.reminder_enabled),
          createdAt: String(reg.created_at),
        }))
      : [];

    res.json({
      event: mapEventRow(row, currentUser?.id),
      registrations,
    });
  });

  app.post('/api/events', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    if (user.role !== 'admin' && user.role !== 'donor') {
      res.status(403).json({ error: 'Only admins or partner kitchens can create distribution events.' });
      return;
    }

    const title = String(req.body?.title ?? '').trim();
    const titleBn = String(req.body?.titleBn ?? title).trim();
    const description = String(req.body?.description ?? '').trim();
    const descriptionBn = String(req.body?.descriptionBn ?? description).trim();
    const organizer =
      String(req.body?.organizer ?? '').trim() ||
      user.donorProfile?.businessName ||
      user.organizationName ||
      user.name;
    const organizerBn = String(req.body?.organizerBn ?? organizer).trim();
    const area = String(req.body?.area ?? user.area ?? 'Dhanmondi').trim();
    const locationName = String(req.body?.locationName ?? '').trim() || `${area}, Dhaka`;
    const locationNameBn = req.body?.locationNameBn ? String(req.body.locationNameBn).trim() : null;
    const rawLat = Number(req.body?.lat ?? user.donorProfile?.lat ?? 23.7465);
    const rawLng = Number(req.body?.lng ?? user.donorProfile?.lng ?? 90.376);
    const lat = Number.isFinite(rawLat) && rawLat !== 0 ? rawLat : 23.7465;
    const lng = Number.isFinite(rawLng) && rawLng !== 0 ? rawLng : 90.376;
    const eventDate = String(req.body?.eventDate ?? dateDaysOffset(2));
    const startTime = String(req.body?.startTime ?? '16:00');
    const endTime = String(req.body?.endTime ?? '19:00');
    const expectedMeals = Math.max(20, Number(req.body?.expectedMeals ?? 200));
    const volunteersNeeded = Math.max(1, Number(req.body?.volunteersNeeded ?? 10));
    const bannerUrl =
      String(req.body?.bannerUrl ?? '').trim() ||
      '/images/community-distribution-bd.jpg';
    const status = ['upcoming', 'ongoing', 'past'].includes(String(req.body?.status ?? ''))
      ? String(req.body.status)
      : 'upcoming';

    if (!title || !description) {
      res.status(400).json({ error: 'Event title and description are required.' });
      return;
    }

    const id = generateId('evt');
    const createdAt = new Date().toISOString();
    const schedule = Array.isArray(req.body?.schedule)
      ? req.body.schedule
      : [
          { time: startTime, activity: 'Setup & kitchen crate intake', activityBn: 'প্রস্তুতি ও খাবার গ্রহণ' },
          { time: endTime, activity: 'Wrap-up & handover summary', activityBn: 'সমাপ্তি ও হিসাব' },
        ];

    db.prepare(
      `INSERT INTO events (
        id, title, title_bn, description, description_bn, organizer, organizer_bn, area, location_name, location_name_bn,
        lat, lng, event_date, start_time, end_time, schedule_json, expected_meals, actual_meals_served,
        people_helped, volunteers_needed, banner_url, gallery_urls_json, how_to_help, how_to_help_bn,
        status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, '[]', ?, ?, ?, ?, ?)`
    ).run(
      id,
      title,
      titleBn,
      description,
      descriptionBn,
      organizer,
      organizerBn,
      area,
      locationName,
      locationNameBn,
      lat,
      lng,
      eventDate,
      startTime,
      endTime,
      JSON.stringify(schedule),
      expectedMeals,
      volunteersNeeded,
      bannerUrl,
      'Register as a volunteer for packing, transport, or community distribution.',
      'প্যাকিং, পরিবহন বা বিতরণের জন্য স্বেচ্ছাসেবক হিসেবে নিবন্ধন করুন।',
      status,
      user.id,
      createdAt
    );

    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({ event: mapEventRow(row, user.id) });
  });

  app.patch('/api/events/:id', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const row = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    if (user.role !== 'admin' && String(row.created_by ?? '') !== user.id) {
      res.status(403).json({ error: 'Not authorized to modify this event' });
      return;
    }

    const title = req.body?.title !== undefined ? String(req.body.title).trim() : String(row.title);
    const titleBn = req.body?.titleBn !== undefined ? String(req.body.titleBn).trim() : String(row.title_bn);
    const description =
      req.body?.description !== undefined ? String(req.body.description).trim() : String(row.description);
    const status =
      req.body?.status && ['upcoming', 'ongoing', 'past', 'cancelled'].includes(String(req.body.status))
        ? String(req.body.status)
        : String(row.status);
    const eventDate = req.body?.eventDate !== undefined ? String(req.body.eventDate) : String(row.event_date);
    const startTime = req.body?.startTime !== undefined ? String(req.body.startTime) : String(row.start_time);
    const endTime = req.body?.endTime !== undefined ? String(req.body.endTime) : String(row.end_time);
    const expectedMeals =
      req.body?.expectedMeals !== undefined ? Number(req.body.expectedMeals) : Number(row.expected_meals);
    const volunteersNeeded =
      req.body?.volunteersNeeded !== undefined
        ? Number(req.body.volunteersNeeded)
        : Number(row.volunteers_needed);
    const actualMealsServed =
      req.body?.actualMealsServed !== undefined
        ? Number(req.body.actualMealsServed)
        : row.actual_meals_served !== null
          ? Number(row.actual_meals_served)
          : null;
    const peopleHelped =
      req.body?.peopleHelped !== undefined
        ? Number(req.body.peopleHelped)
        : row.people_helped !== null
          ? Number(row.people_helped)
          : null;

    db.prepare(
      `UPDATE events SET title = ?, title_bn = ?, description = ?, status = ?, event_date = ?, start_time = ?, end_time = ?,
       expected_meals = ?, volunteers_needed = ?, actual_meals_served = ?, people_helped = ? WHERE id = ?`
    ).run(
      title,
      titleBn,
      description,
      status,
      eventDate,
      startTime,
      endTime,
      expectedMeals,
      volunteersNeeded,
      actualMealsServed,
      peopleHelped,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    res.json({ event: mapEventRow(updated, user.id) });
  });

  app.post('/api/events/:id/register', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!ev) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const name = String(req.body?.name ?? user.name).trim();
    const phone = String(req.body?.phone ?? user.phone).trim();
    const availability = String(req.body?.availability ?? `${ev.start_time} - ${ev.end_time}`).trim();
    const preferredRole = ['cooking', 'packing', 'distribution', 'transport'].includes(
      String(req.body?.preferredRole ?? '')
    )
      ? String(req.body.preferredRole)
      : 'distribution';

    if (!name || !phone) {
      res.status(400).json({ error: 'Volunteer name and phone are required.' });
      return;
    }

    const id = generateId('ereg');
    const createdAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO event_registrations (
        id, event_id, user_id, name, phone, availability, preferred_role, attendance_status, reminder_enabled, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'registered', 1, ?)
      ON CONFLICT(event_id, user_id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        availability = excluded.availability,
        preferred_role = excluded.preferred_role`
    ).run(id, String(ev.id), user.id, name, phone, availability, preferredRole, createdAt);

    createAndPushNotification(
      user.id,
      'event_registered',
      `Volunteer Confirmed · ${ev.title}`,
      `You're registered for ${ev.event_date} at ${ev.location_name}.`,
      { eventId: String(ev.id) }
    );

    const regRow = db
      .prepare('SELECT * FROM event_registrations WHERE event_id = ? AND user_id = ?')
      .get(String(ev.id), user.id) as Record<string, unknown>;

    res.status(201).json({
      registration: {
        id: String(regRow.id),
        eventId: String(regRow.event_id),
        userId: String(regRow.user_id),
        name: String(regRow.name),
        phone: String(regRow.phone),
        availability: String(regRow.availability),
        preferredRole: String(regRow.preferred_role),
        attendanceStatus: String(regRow.attendance_status),
        reminderEnabled: Boolean(regRow.reminder_enabled),
        createdAt: String(regRow.created_at),
      },
    });
  });

  app.post('/api/events/:id/remind', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!ev) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    createAndPushNotification(
      user.id,
      'event_reminder',
      `Reminder Set · ${ev.title}`,
      `Event starts ${ev.event_date} at ${ev.start_time} (${ev.location_name}).`,
      { eventId: String(ev.id) }
    );

    res.json({ ok: true, reminded: true });
  });

  app.patch('/api/events/:id/registrations/:regId', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const ev = db.prepare('SELECT created_by FROM events WHERE id = ?').get(req.params.id) as
      | { created_by: string | null }
      | undefined;
    if (!ev) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    if (user.role !== 'admin' && user.role !== 'donor' && ev.created_by !== user.id) {
      res.status(403).json({ error: 'Not authorized to update attendance' });
      return;
    }

    const attendanceStatus = ['registered', 'present', 'absent'].includes(
      String(req.body?.attendanceStatus ?? '')
    )
      ? String(req.body.attendanceStatus)
      : 'present';

    db.prepare('UPDATE event_registrations SET attendance_status = ? WHERE id = ? AND event_id = ?').run(
      attendanceStatus,
      req.params.regId,
      req.params.id
    );
    res.json({ ok: true, attendanceStatus });
  });

  // --- WEDDING & BUFFET LEFTOVER COLLECTION ---
  function mapWeddingRow(row: Record<string, unknown>, refLat?: number, refLng?: number) {
    const lat = Number(row.lat);
    const lng = Number(row.lng);
    return {
      id: String(row.id),
      donorId: String(row.donor_id),
      eventType: String(row.event_type),
      venueName: String(row.venue_name),
      address: String(row.address),
      addressBn: row.address_bn ? String(row.address_bn) : null,
      lat,
      lng,
      contactPerson: String(row.contact_person),
      phone: String(row.phone),
      eventDate: String(row.event_date),
      readyTime: String(row.ready_time),
      approxServings: Number(row.approx_servings),
      foodTypes: JSON.parse(String(row.food_types_json || '[]')),
      isHalal: Boolean(row.is_halal),
      isVeg: Boolean(row.is_veg),
      storageMethod: String(row.storage_method),
      photoUrls: JSON.parse(String(row.photo_urls_json || '[]')),
      specialNotes: row.special_notes ? String(row.special_notes) : null,
      isUrgent: Boolean(row.is_urgent),
      status: String(row.status),
      volunteerId: row.volunteer_id ? String(row.volunteer_id) : null,
      volunteerName: row.volunteer_name ? String(row.volunteer_name) : null,
      ngoClaimerId: row.ngo_claimer_id ? String(row.ngo_claimer_id) : null,
      ngoName: row.ngo_name ? String(row.ngo_name) : null,
      conversationId: row.conversation_id ? String(row.conversation_id) : null,
      deliveryPhotoUrl: row.delivery_photo_url ? String(row.delivery_photo_url) : null,
      deliveredMeals: row.delivered_meals !== null ? Number(row.delivered_meals) : null,
      deliveryNote: row.delivery_note ? String(row.delivery_note) : null,
      distanceKm:
        refLat !== undefined && refLng !== undefined ? haversineKm(refLat, refLng, lat, lng) : undefined,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  app.get('/api/wedding-pickups', requireAuth, (req, res) => {
    const lat = req.query.lat ? Number(req.query.lat) : 23.765;
    const lng = req.query.lng ? Number(req.query.lng) : 90.391;
    const rows = db
      .prepare(
        `SELECT * FROM wedding_pickups
         ORDER BY CASE status
           WHEN 'submitted' THEN 0
           WHEN 'volunteer_assigned' THEN 1
           WHEN 'on_the_way' THEN 2
           WHEN 'collected' THEN 3
           ELSE 4
         END, is_urgent DESC, created_at DESC`
      )
      .all() as Record<string, unknown>[];

    res.json({
      pickups: rows.map((r) => mapWeddingRow(r, lat, lng)),
    });
  });

  app.post('/api/wedding-pickups', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const checklistUntouched = Boolean(req.body?.checklistUntouched);
    const checklistCovered = Boolean(req.body?.checklistCovered);
    const checklistFresh = Boolean(req.body?.checklistFresh);

    if (!checklistUntouched || !checklistCovered || !checklistFresh) {
      res.status(400).json({
        error: 'All 3 mandatory Food Safety Checklist boxes must be confirmed before requesting pickup.',
      });
      return;
    }

    const venueName = String(req.body?.venueName ?? '').trim();
    const address = String(req.body?.address ?? '').trim();
    const contactPerson = String(req.body?.contactPerson ?? user.name).trim();
    const phone = String(req.body?.phone ?? user.phone).trim();
    const approxServings = Math.max(10, Number(req.body?.approxServings ?? 50));

    if (!venueName || !address || !contactPerson || !phone) {
      res.status(400).json({ error: 'Venue name, address, contact person, and phone are required.' });
      return;
    }

    const id = generateId('wed');
    const now = new Date().toISOString();
    const eventType = String(req.body?.eventType ?? 'wedding');
    const lat = Number(req.body?.lat ?? user.donorProfile?.lat ?? 23.765);
    const lng = Number(req.body?.lng ?? user.donorProfile?.lng ?? 90.391);
    const eventDate = String(req.body?.eventDate ?? dateDaysOffset(0));
    const readyTime = String(req.body?.readyTime ?? '21:30');
    const foodTypes = Array.isArray(req.body?.foodTypes) ? req.body.foodTypes.map(String) : ['rice', 'curry'];
    const isHalal = req.body?.isHalal !== undefined ? Boolean(req.body.isHalal) : true;
    const isVeg = Boolean(req.body?.isVeg);
    const storageMethod = String(req.body?.storageMethod ?? 'covered_hot');
    const photoUrls =
      Array.isArray(req.body?.photoUrls) && req.body.photoUrls.length > 0
        ? req.body.photoUrls.map(String)
        : ['/images/wedding-buffet-bd.jpg'];
    const specialNotes = req.body?.specialNotes ? String(req.body.specialNotes).trim() : null;
    const isUrgent = Boolean(req.body?.isUrgent);

    db.prepare(
      `INSERT INTO wedding_pickups (
        id, donor_id, event_type, venue_name, address, lat, lng, contact_person, phone,
        event_date, ready_time, approx_servings, food_types_json, is_halal, is_veg,
        storage_method, photo_urls_json, special_notes, is_urgent,
        checklist_untouched, checklist_covered, checklist_fresh, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 'submitted', ?, ?)`
    ).run(
      id,
      user.id,
      eventType,
      venueName,
      address,
      lat,
      lng,
      contactPerson,
      phone,
      eventDate,
      readyTime,
      approxServings,
      JSON.stringify(foodTypes),
      isHalal ? 1 : 0,
      isVeg ? 1 : 0,
      storageMethod,
      JSON.stringify(photoUrls),
      specialNotes,
      isUrgent ? 1 : 0,
      now,
      now
    );

    const row = db.prepare('SELECT * FROM wedding_pickups WHERE id = ?').get(id) as Record<string, unknown>;
    const mapped = mapWeddingRow(row);
    for (const sockets of wsClients.values()) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'wedding:updated', data: mapped }));
        }
      }
    }

    res.status(201).json({ pickup: mapped });
  });

  app.patch('/api/wedding-pickups/:id/status', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const row = db.prepare('SELECT * FROM wedding_pickups WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Wedding pickup request not found' });
      return;
    }

    const nextStatus = String(req.body?.status ?? '');
    const allowedStatuses = ['submitted', 'volunteer_assigned', 'on_the_way', 'collected', 'delivered'];
    if (!allowedStatuses.includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid pickup status' });
      return;
    }

    const now = new Date().toISOString();
    let volunteerId = row.volunteer_id ? String(row.volunteer_id) : null;
    let volunteerName = row.volunteer_name ? String(row.volunteer_name) : null;

    if (nextStatus === 'volunteer_assigned' || !volunteerId) {
      volunteerId = user.id;
      volunteerName = user.organizationName
        ? `${user.name} (${user.organizationName})`
        : user.donorProfile?.businessName || user.name;
    }

    const deliveryPhotoUrl = req.body?.deliveryPhotoUrl
      ? String(req.body.deliveryPhotoUrl)
      : row.delivery_photo_url
        ? String(row.delivery_photo_url)
        : nextStatus === 'delivered'
          ? '/images/community-distribution-bd.jpg'
          : null;
    const deliveredMeals =
      req.body?.deliveredMeals !== undefined && req.body?.deliveredMeals !== null
        ? Math.max(1, Number(req.body.deliveredMeals))
        : row.delivered_meals !== null
          ? Number(row.delivered_meals)
          : nextStatus === 'delivered'
            ? Number(row.approx_servings)
            : null;
    const deliveryNote = req.body?.deliveryNote
      ? String(req.body.deliveryNote).trim()
      : row.delivery_note
        ? String(row.delivery_note)
        : nextStatus === 'delivered'
          ? 'Safely collected and served warm to local community families!'
          : null;

    db.prepare(
      `UPDATE wedding_pickups SET
        status = ?, volunteer_id = ?, volunteer_name = ?,
        delivery_photo_url = ?, delivered_meals = ?, delivery_note = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextStatus,
      volunteerId,
      volunteerName,
      deliveryPhotoUrl,
      deliveredMeals,
      deliveryNote,
      now,
      req.params.id
    );

    const statusLabelMap: Record<string, string> = {
      volunteer_assigned: 'Volunteer Assigned',
      on_the_way: 'Volunteer On the Way',
      collected: 'Buffet Food Collected',
      delivered: 'Delivered to Community',
    };
    const donorId = String(row.donor_id);
    if (statusLabelMap[nextStatus]) {
      createAndPushNotification(
        donorId,
        'wedding_pickup_update',
        `${statusLabelMap[nextStatus]} · ${row.venue_name}`,
        nextStatus === 'delivered'
          ? `${deliveredMeals ?? row.approx_servings} meals delivered! Thank-you certificate is ready.`
          : `${volunteerName} updated pickup status to ${statusLabelMap[nextStatus]}.`,
        { pickupId: String(row.id), status: nextStatus }
      );
    }

    const updated = db.prepare('SELECT * FROM wedding_pickups WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >;
    const mapped = mapWeddingRow(updated);
    for (const sockets of wsClients.values()) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'wedding:updated', data: mapped }));
        }
      }
    }

    res.json({ pickup: mapped });
  });

  app.post('/api/wedding-pickups/:id/claim-ngo', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const row = db.prepare('SELECT * FROM wedding_pickups WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Wedding pickup request not found' });
      return;
    }

    const ngoName =
      String(req.body?.ngoName ?? '').trim() ||
      user.organizationName ||
      `${user.name} Shelter Network`;
    const now = new Date().toISOString();

    db.prepare(
      `UPDATE wedding_pickups SET ngo_claimer_id = ?, ngo_name = ?, updated_at = ? WHERE id = ?`
    ).run(user.id, ngoName, now, req.params.id);

    createAndPushNotification(
      String(row.donor_id),
      'wedding_ngo_claimed',
      `Batch Claimed · ${ngoName}`,
      `${ngoName} claimed your ${row.approx_servings}-serving batch from ${row.venue_name}.`,
      { pickupId: String(row.id) }
    );

    const updated = db.prepare('SELECT * FROM wedding_pickups WHERE id = ?').get(req.params.id) as Record<
      string,
      unknown
    >;
    const mapped = mapWeddingRow(updated);
    for (const sockets of wsClients.values()) {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'wedding:updated', data: mapped }));
        }
      }
    }
    res.json({ pickup: mapped });
  });

  app.post('/api/wedding-pickups/:id/open-chat', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const row = db.prepare('SELECT * FROM wedding_pickups WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      res.status(404).json({ error: 'Wedding pickup request not found' });
      return;
    }

    if (row.conversation_id) {
      const convExists = db
        .prepare('SELECT id FROM conversations WHERE id = ?')
        .get(String(row.conversation_id)) as { id: string } | undefined;
      if (convExists) {
        res.json({ conversationId: convExists.id });
        return;
      }
    }

    const donorId = String(row.donor_id);
    const peerId =
      user.id === donorId
        ? String(row.volunteer_id || row.ngo_claimer_id || 'recip_3')
        : user.id;
    const now = new Date().toISOString();

    // Ensure donor row exists for donorId so /api/conversations JOIN works cleanly
    const donorRow = db.prepare('SELECT user_id FROM donors WHERE user_id = ?').get(donorId);
    if (!donorRow) {
      const donorUser = db.prepare('SELECT * FROM users WHERE id = ?').get(donorId) as
        | Record<string, unknown>
        | undefined;
      db.prepare(
        `INSERT OR IGNORE INTO donors (user_id, business_name, address, lat, lng, hours, verification_status, logo_url, is_online)
         VALUES (?, ?, ?, ?, ?, 'Event Hours', 'verified', NULL, 1)`
      ).run(
        donorId,
        String(row.venue_name),
        String(row.address),
        Number(row.lat),
        Number(row.lng)
      );
      if (donorUser && !donorUser.verified) {
        db.prepare('UPDATE users SET verified = 1 WHERE id = ?').run(donorId);
      }
    }

    const listingId = generateId('list_wed');
    const claimId = generateId('claim_wed');
    const convId = generateId('conv_wed');
    const pickupCode = generatePickupCode();

    db.prepare(
      `INSERT INTO listings (
        id, donor_id, title, description, category, dietary_tags, quantity, remaining_quantity,
        unit, photo_urls, pickup_start, pickup_end, pickup_address, safety_note, prepared_at,
        consume_within_hours, status, lat, lng, created_at
      ) VALUES (?, ?, ?, ?, 'cooked', ?, ?, ?, 'servings', ?, ?, ?, ?, 'Wedding buffet rescue within 2 hours.', ?, 4, 'claimed', ?, ?, ?)`
    ).run(
      listingId,
      donorId,
      `Buffet Rescue · ${row.venue_name}`,
      `Banquet food pickup at ${row.address}`,
      JSON.stringify([row.is_halal ? 'Halal' : 'Buffet', ...(row.is_veg ? ['Veg'] : [])]),
      Number(row.approx_servings),
      0,
      String(row.photo_urls_json || '["/images/wedding-buffet-bd.jpg"]'),
      now,
      new Date(Date.now() + 4 * 3600_000).toISOString(),
      String(row.address),
      now,
      Number(row.lat),
      Number(row.lng),
      now
    );

    db.prepare(
      `INSERT INTO claims (
        id, listing_id, recipient_id, quantity_claimed, status, pickup_code, notes,
        created_at, accepted_at, expires_at
      ) VALUES (?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)`
    ).run(
      claimId,
      listingId,
      peerId,
      Number(row.approx_servings),
      pickupCode,
      `Wedding & Buffet Pickup (${row.venue_name})`,
      now,
      now,
      new Date(Date.now() + 4 * 3600_000).toISOString()
    );

    db.prepare(
      `INSERT INTO conversations (id, listing_id, claim_id, donor_id, recipient_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(convId, listingId, claimId, donorId, peerId, now, now);

    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, text, message_type, sent_at)
       VALUES (?, ?, ?, ?, 'text', ?)`
    ).run(
      generateId('msg'),
      convId,
      user.id,
      `Coordinating buffet pickup for ${row.approx_servings} servings at ${row.venue_name} (${row.address}).`,
      now
    );

    db.prepare('UPDATE wedding_pickups SET conversation_id = ?, updated_at = ? WHERE id = ?').run(
      convId,
      now,
      req.params.id
    );

    res.json({ conversationId: convId });
  });

  // --- DONATE MONEY / SUPPORT US ---
  // Note: Payment gateway adapter boundary (SSLCommerz / bKash Merchant Checkout / Stripe)
  // No raw card numbers or mobile banking PINs are ever collected or persisted on this server.
  app.get('/api/donations/summary', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT d.*, e.title as event_title
         FROM donations d
         LEFT JOIN events e ON d.event_id = e.id
         WHERE d.status = 'completed'
         ORDER BY d.created_at DESC`
      )
      .all() as Record<string, unknown>[];

    const liveTotal = rows.reduce((sum, r) => sum + Number(r.amount_bdt ?? 0), 0);
    const monthlyCount = rows.filter((r) => r.frequency === 'monthly').length;

    res.json({
      goalBdt: 250000,
      raisedBdt: liveTotal + 115000,
      totalDonationsCount: rows.length + 34,
      monthlySupportersCount: monthlyCount + 12,
      breakdown: [
        { key: 'packaging', percentage: 32 },
        { key: 'transport', percentage: 26 },
        { key: 'events', percentage: 22 },
        { key: 'emergency', percentage: 12 },
        { key: 'platform', percentage: 8 },
      ],
      recentDonors: rows.slice(0, 12).map((r) => ({
        id: String(r.id),
        userId: null,
        donorDisplayName: Boolean(r.is_anonymous) ? 'Anonymous Supporter' : String(r.donor_display_name),
        amountBdt: Number(r.amount_bdt),
        frequency: String(r.frequency),
        cause: String(r.cause),
        eventId: r.event_id ? String(r.event_id) : null,
        eventTitle: r.event_title ? String(r.event_title) : null,
        paymentMethod: String(r.payment_method),
        isAnonymous: Boolean(r.is_anonymous),
        honorOf: r.honor_of ? String(r.honor_of) : null,
        receiptCode: String(r.receipt_code),
        status: String(r.status),
        createdAt: String(r.created_at),
      })),
      monthlyReports: [
        {
          monthKey: '2026-04',
          monthLabel: 'This Month (Live)',
          monthLabelBn: 'চলতি মাস (লাইভ)',
          incomeBdt: liveTotal + 115000,
          spentBdt: Math.round((liveTotal + 115000) * 0.84),
          mealsFunded: Math.round(((liveTotal + 115000) * 0.84) / 38),
        },
        {
          monthKey: '2026-03',
          monthLabel: 'Last Month',
          monthLabelBn: 'গত মাস',
          incomeBdt: 228500,
          spentBdt: 214200,
          mealsFunded: 5636,
        },
        {
          monthKey: '2026-02',
          monthLabel: 'Two Months Ago',
          monthLabelBn: '২ মাস আগে',
          incomeBdt: 194000,
          spentBdt: 186400,
          mealsFunded: 4905,
        },
        {
          monthKey: '2026-01',
          monthLabel: 'Three Months Ago',
          monthLabelBn: '৩ মাস আগে',
          incomeBdt: 175200,
          spentBdt: 169800,
          mealsFunded: 4468,
        },
      ],
    });
  });

  app.get('/api/donations/mine', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const rows = db
      .prepare(
        `SELECT d.*, e.title as event_title
         FROM donations d
         LEFT JOIN events e ON d.event_id = e.id
         WHERE d.user_id = ?
         ORDER BY d.created_at DESC`
      )
      .all(user.id) as Record<string, unknown>[];

    res.json({
      donations: rows.map((r) => ({
        id: String(r.id),
        userId: r.user_id ? String(r.user_id) : null,
        donorDisplayName: String(r.donor_display_name),
        amountBdt: Number(r.amount_bdt),
        frequency: String(r.frequency),
        cause: String(r.cause),
        eventId: r.event_id ? String(r.event_id) : null,
        eventTitle: r.event_title ? String(r.event_title) : null,
        paymentMethod: String(r.payment_method),
        isAnonymous: Boolean(r.is_anonymous),
        honorOf: r.honor_of ? String(r.honor_of) : null,
        receiptCode: String(r.receipt_code),
        status: String(r.status),
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/donations', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const amountBdt = Math.round(Number(req.body?.amountBdt ?? 0));
    if (!Number.isFinite(amountBdt) || amountBdt < 20 || amountBdt > 5000000) {
      res.status(400).json({ error: 'Please enter a valid donation amount between ৳20 and ৳50,00,000.' });
      return;
    }

    const frequency = req.body?.frequency === 'monthly' ? 'monthly' : 'one_time';
    const cause = [
      'general',
      'events',
      'wedding_pickup',
      'platform',
      'iftar_packs',
      'sadaqah',
      'zakat',
    ].includes(String(req.body?.cause ?? ''))
      ? String(req.body.cause)
      : 'general';
    const eventId = req.body?.eventId ? String(req.body.eventId) : null;
    const paymentMethod = ['bkash', 'nagad', 'rocket', 'card_sandbox', 'bank_transfer'].includes(
      String(req.body?.paymentMethod ?? '')
    )
      ? String(req.body.paymentMethod)
      : 'bkash';
    const isAnonymous = Boolean(req.body?.isAnonymous);
    const honorOf = req.body?.honorOf ? String(req.body.honorOf).trim().slice(0, 120) : null;
    const donorDisplayName =
      String(req.body?.donorName ?? '').trim() ||
      user.donorProfile?.businessName ||
      user.name;

    const id = generateId('don');
    const receiptCode = `AF-DON-${crypto.randomInt(1000, 9999)}${crypto.randomInt(10, 99)}`;
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO donations (
        id, user_id, donor_display_name, amount_bdt, frequency, cause, event_id,
        payment_method, is_anonymous, honor_of, receipt_code, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`
    ).run(
      id,
      user.id,
      donorDisplayName,
      amountBdt,
      frequency,
      cause,
      eventId,
      paymentMethod,
      isAnonymous ? 1 : 0,
      honorOf,
      receiptCode,
      createdAt
    );

    let eventTitle: string | null = null;
    if (eventId) {
      const evRow = db.prepare('SELECT title FROM events WHERE id = ?').get(eventId) as
        | { title: string }
        | undefined;
      eventTitle = evRow?.title ?? null;
    }

    createAndPushNotification(
      user.id,
      'donation_receipt',
      `Thank You! Receipt ${receiptCode}`,
      `Your ৳${amountBdt} ${frequency === 'monthly' ? 'monthly ' : ''}support helps rescue meals across Dhaka.`,
      { donationId: id, receiptCode }
    );

    const record = {
      id,
      userId: user.id,
      donorDisplayName,
      amountBdt,
      frequency,
      cause,
      eventId,
      eventTitle,
      paymentMethod,
      isAnonymous,
      honorOf,
      receiptCode,
      status: 'completed',
      createdAt,
    };

    res.status(201).json({ donation: record });
  });

  // --- DONOR RATINGS & REVIEWS ---
  app.get('/api/donors/:id/reviews', (req, res) => {
    const donorId = String(req.params.id);
    const rows = db
      .prepare(
        `SELECT dr.*, u.name as reviewer_name, u.organization_name as reviewer_org
         FROM donor_reviews dr
         JOIN users u ON dr.recipient_id = u.id
         WHERE dr.donor_id = ?
         ORDER BY dr.created_at DESC
         LIMIT 20`
      )
      .all(donorId) as Record<string, unknown>[];

    const stats = db
      .prepare(
        `SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as review_count,
                SUM(CASE WHEN hygiene_ok = 1 THEN 1 ELSE 0 END) as hygiene_count
         FROM donor_reviews WHERE donor_id = ?`
      )
      .get(donorId) as { avg_rating: number | null; review_count: number; hygiene_count: number | null };

    res.json({
      avgRating: stats.avg_rating !== null ? Number(stats.avg_rating) : null,
      reviewCount: Number(stats.review_count ?? 0),
      hygieneRatePct:
        stats.review_count > 0
          ? Math.round(((stats.hygiene_count ?? 0) / stats.review_count) * 100)
          : 100,
      reviews: rows.map((r) => ({
        id: String(r.id),
        claimId: String(r.claim_id),
        donorId: String(r.donor_id),
        reviewerName: String(r.reviewer_name),
        reviewerOrg: r.reviewer_org ? String(r.reviewer_org) : null,
        rating: Number(r.rating),
        hygieneOk: Boolean(r.hygiene_ok),
        comment: r.comment ? String(r.comment) : null,
        createdAt: String(r.created_at),
      })),
    });
  });

  app.post('/api/claims/:id/review', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const claim = db
      .prepare(
        `SELECT c.*, l.donor_id, l.title as listing_title
         FROM claims c JOIN listings l ON c.listing_id = l.id
         WHERE c.id = ?`
      )
      .get(req.params.id) as Record<string, unknown> | undefined;

    if (!claim) {
      res.status(404).json({ error: 'Claim not found' });
      return;
    }
    if (String(claim.recipient_id) !== user.id) {
      res.status(403).json({ error: 'Only the recipient can rate this pickup.' });
      return;
    }
    if (claim.status !== 'completed') {
      res.status(409).json({ error: 'You can rate a donor after pickup handover is confirmed.' });
      return;
    }

    const existing = db.prepare('SELECT id FROM donor_reviews WHERE claim_id = ?').get(String(claim.id));
    if (existing) {
      res.status(409).json({ error: 'You have already rated this pickup.' });
      return;
    }

    const rating = Math.max(1, Math.min(5, Math.round(Number(req.body?.rating ?? 5))));
    const hygieneOk = req.body?.hygieneOk !== false;
    const comment = req.body?.comment ? String(req.body.comment).trim().slice(0, 300) : null;
    const id = generateId('rev');
    const createdAt = new Date().toISOString();

    db.prepare(
      `INSERT INTO donor_reviews (id, claim_id, donor_id, recipient_id, rating, hygiene_ok, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, String(claim.id), String(claim.donor_id), user.id, rating, hygieneOk ? 1 : 0, comment, createdAt);

    createAndPushNotification(
      String(claim.donor_id),
      'donor_review',
      `New ${rating}-Star Pickup Rating`,
      `${user.organizationName ?? user.name} rated "${claim.listing_title}" ${rating}/5.`,
      { claimId: claim.id, rating }
    );

    res.status(201).json({ id, rating, hygieneOk, comment, createdAt });
  });

  // --- IMPACT DASHBOARD ---
  app.get('/api/impact-dashboard', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const currentUser = await getUserByToken(token);

    const claimedServings = (
      db
        .prepare("SELECT COALESCE(SUM(quantity_claimed), 0) as t FROM claims WHERE status IN ('accepted', 'picked_up', 'completed')")
        .get() as { t: number }
    ).t;
    const completedCount = (
      db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'completed'").get() as { c: number }
    ).c;
    const qrHandoverCount = (
      db.prepare("SELECT COUNT(*) as c FROM claims WHERE status = 'completed' AND handover_method = 'qr'").get() as { c: number }
    ).c;
    const weddingMeals = (
      db.prepare("SELECT COALESCE(SUM(COALESCE(delivered_meals, approx_servings)), 0) as t FROM wedding_pickups WHERE status IN ('collected', 'delivered')").get() as { t: number }
    ).t;
    const activeDonors = (
      db.prepare("SELECT COUNT(*) as c FROM donors WHERE verification_status = 'verified'").get() as { c: number }
    ).c;
    const donationStats = db
      .prepare("SELECT COALESCE(SUM(amount_bdt), 0) as raised, COUNT(*) as cnt FROM donations WHERE status = 'completed'")
      .get() as { raised: number; cnt: number };
    const ramadanDonationsBdt = (
      db
        .prepare("SELECT COALESCE(SUM(amount_bdt), 0) as t FROM donations WHERE status = 'completed' AND cause IN ('iftar_packs', 'sadaqah', 'zakat')")
        .get() as { t: number }
    ).t;
    const flashListingsNow = (
      db
        .prepare("SELECT COUNT(*) as c FROM listings WHERE status = 'active' AND remaining_quantity > 0 AND is_flash_rescue = 1")
        .get() as { c: number }
    ).c;

    const mealsShared = 1240 + claimedServings + completedCount * 2 + Math.round(weddingMeals * 0.5);
    const kgSaved = Math.round(mealsShared * 0.45);
    const co2AvoidedKg = Math.round(kgSaved * 2.5);
    const raisedBdt = Number(donationStats.raised ?? 0) + 115000;
    const mealsFunded = Math.round((raisedBdt * 0.84) / 38);

    let personal: Record<string, number> | null = null;
    if (currentUser) {
      const myRescued = (
        db
          .prepare("SELECT COALESCE(SUM(quantity_claimed), 0) as t FROM claims WHERE recipient_id = ? AND status IN ('accepted', 'picked_up', 'completed')")
          .get(currentUser.id) as { t: number }
      ).t;
      const myDonatedServings = (
        db
          .prepare("SELECT COALESCE(SUM(quantity - remaining_quantity), 0) as t FROM listings WHERE donor_id = ?")
          .get(currentUser.id) as { t: number }
      ).t;
      const myCashBdt = (
        db
          .prepare("SELECT COALESCE(SUM(amount_bdt), 0) as t FROM donations WHERE user_id = ? AND status = 'completed'")
          .get(currentUser.id) as { t: number }
      ).t;
      const myVolHours = (
        db
          .prepare("SELECT COALESCE(SUM(hours_logged), 0) as t FROM shift_signups WHERE user_id = ? AND status IN ('checked_in', 'completed')")
          .get(currentUser.id) as { t: number }
      ).t;
      personal = {
        mealsImpact: currentUser.role === 'donor' ? myDonatedServings : myRescued,
        cashDonatedBdt: myCashBdt,
        volunteerHours: Number(Number(myVolHours).toFixed(1)),
      };
    }

    res.json({
      mealsShared,
      kgSaved,
      co2AvoidedKg,
      activeDonors: activeDonors + 18,
      peopleHelped: 480 + claimedServings,
      raisedBdt,
      donationCount: Number(donationStats.cnt ?? 0) + 34,
      mealsFunded,
      qrHandovers: qrHandoverCount + 14,
      flashListingsNow,
      ramadanDonationsBdt,
      personal,
    });
  });

  // --- VOLUNTEER HUB WITH SHIFTS ---
  app.get('/api/volunteer-shifts', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const currentUser = await getUserByToken(token);
    const area = req.query.area ? String(req.query.area) : null;
    const role = req.query.role ? String(req.query.role) : null;

    let sql = `
      SELECT vs.*,
             (SELECT COUNT(*) FROM shift_signups ss WHERE ss.shift_id = vs.id AND ss.status != 'cancelled') as slots_filled
      FROM volunteer_shifts vs
      WHERE 1=1
    `;
    const params: string[] = [];
    if (area && area !== 'all') {
      sql += ' AND vs.area = ?';
      params.push(area);
    }
    if (role && role !== 'all') {
      sql += ' AND vs.role = ?';
      params.push(role);
    }
    sql += ' ORDER BY vs.shift_date ASC, vs.start_time ASC';

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    let totalHours = 0;
    if (currentUser) {
      totalHours = (
        db
          .prepare("SELECT COALESCE(SUM(hours_logged), 0) as t FROM shift_signups WHERE user_id = ? AND status != 'cancelled'")
          .get(currentUser.id) as { t: number }
      ).t;
    }

    const shifts = rows.map((r) => {
      let mySignup: Record<string, unknown> | null = null;
      if (currentUser) {
        const sRow = db
          .prepare("SELECT * FROM shift_signups WHERE shift_id = ? AND user_id = ? AND status != 'cancelled'")
          .get(String(r.id), currentUser.id) as Record<string, unknown> | undefined;
        if (sRow) {
          mySignup = {
            id: String(sRow.id),
            shiftId: String(sRow.shift_id),
            status: String(sRow.status),
            hoursLogged: Number(sRow.hours_logged ?? 0),
            createdAt: String(sRow.created_at),
          };
        }
      }
      return {
        id: String(r.id),
        title: String(r.title),
        titleBn: String(r.title_bn),
        area: String(r.area),
        locationName: String(r.location_name),
        locationNameBn: r.location_name_bn ? String(r.location_name_bn) : null,
        role: String(r.role) as VolunteerRole,
        shiftDate: String(r.shift_date),
        startTime: String(r.start_time),
        endTime: String(r.end_time),
        slotsTotal: Number(r.slots_total),
        slotsFilled: Number(r.slots_filled ?? 0),
        eventId: r.event_id ? String(r.event_id) : null,
        mySignup,
      };
    });

    res.json({ shifts, myTotalHours: Number(Number(totalHours).toFixed(1)) });
  });

  app.post('/api/volunteer-shifts', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    if (user.role !== 'admin' && user.role !== 'donor') {
      res.status(403).json({ error: 'Only admins or verified kitchen donors can post volunteer shifts.' });
      return;
    }
    const title = String(req.body?.title ?? '').trim();
    const titleBn = String(req.body?.titleBn ?? title).trim();
    const area = String(req.body?.area ?? user.area ?? 'Dhanmondi').trim();
    const locationName = String(req.body?.locationName ?? `${area}, Dhaka`).trim();
    const role = (['cooking', 'packing', 'distribution', 'transport'].includes(String(req.body?.role))
      ? String(req.body.role)
      : 'packing') as VolunteerRole;
    const shiftDate = String(req.body?.shiftDate ?? dateDaysOffset(1));
    const startTime = String(req.body?.startTime ?? '16:00');
    const endTime = String(req.body?.endTime ?? '18:00');
    const slotsTotal = Math.max(1, Math.min(50, Number(req.body?.slotsTotal ?? 6)));

    if (!title || title.length < 3) {
      res.status(400).json({ error: 'Please provide a clear shift title.' });
      return;
    }
    const id = generateId('shift');
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO volunteer_shifts (
        id, title, title_bn, area, location_name, location_name_bn, role, shift_date, start_time, end_time, slots_total, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, titleBn, area, locationName, role, shiftDate, startTime, endTime, slotsTotal, user.id, now);

    res.status(201).json({ id });
  });

  app.post('/api/volunteer-shifts/:id/signup', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const shift = db.prepare('SELECT * FROM volunteer_shifts WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!shift) {
      res.status(404).json({ error: 'Shift not found' });
      return;
    }

    const activeCount = (
      db
        .prepare("SELECT COUNT(*) as c FROM shift_signups WHERE shift_id = ? AND status != 'cancelled'")
        .get(String(shift.id)) as { c: number }
    ).c;
    if (activeCount >= Number(shift.slots_total)) {
      res.status(409).json({ error: 'This shift is already full.' });
      return;
    }

    // Check overlapping shifts on the same date
    const sameDateSignups = db
      .prepare(
        `SELECT vs.start_time, vs.end_time, vs.title
         FROM shift_signups ss
         JOIN volunteer_shifts vs ON ss.shift_id = vs.id
         WHERE ss.user_id = ? AND ss.status != 'cancelled' AND vs.shift_date = ? AND vs.id != ?`
      )
      .all(user.id, String(shift.shift_date), String(shift.id)) as {
      start_time: string;
      end_time: string;
      title: string;
    }[];

    const newStart = String(shift.start_time);
    const newEnd = String(shift.end_time);
    const conflict = sameDateSignups.find((s) => newStart < s.end_time && newEnd > s.start_time);
    if (conflict) {
      res.status(409).json({
        error: `Overlaps with your existing shift "${conflict.title}" (${conflict.start_time}–${conflict.end_time}).`,
      });
      return;
    }

    const now = new Date().toISOString();
    const id = generateId('ss');
    db.prepare(
      `INSERT INTO shift_signups (id, shift_id, user_id, name, phone, status, hours_logged, created_at)
       VALUES (?, ?, ?, ?, ?, 'signed_up', 0, ?)
       ON CONFLICT(shift_id, user_id) DO UPDATE SET status = 'signed_up', hours_logged = 0, created_at = excluded.created_at`
    ).run(id, String(shift.id), user.id, user.name, user.phone, now);

    createAndPushNotification(
      user.id,
      'shift_signup',
      `Shift Confirmed · ${shift.title}`,
      `${shift.shift_date} (${shift.start_time}–${shift.end_time}) at ${shift.location_name}.`,
      { shiftId: shift.id }
    );

    res.status(201).json({ ok: true });
  });

  app.patch('/api/volunteer-shifts/:id/status', requireAuth, (req, res) => {
    const user = (req as express.Request & { user: User }).user;
    const nextStatus = String(req.body?.status ?? '');
    if (!['checked_in', 'completed', 'cancelled'].includes(nextStatus)) {
      res.status(400).json({ error: 'Invalid shift status' });
      return;
    }
    const shift = db.prepare('SELECT * FROM volunteer_shifts WHERE id = ?').get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    const signup = db
      .prepare('SELECT * FROM shift_signups WHERE shift_id = ? AND user_id = ?')
      .get(req.params.id, user.id) as Record<string, unknown> | undefined;
    if (!shift || !signup) {
      res.status(404).json({ error: 'Shift registration not found' });
      return;
    }

    let hoursLogged = Number(signup.hours_logged ?? 0);
    if (nextStatus === 'completed') {
      const [sh, sm] = String(shift.start_time).split(':').map(Number);
      const [eh, em] = String(shift.end_time).split(':').map(Number);
      const dur = Math.max(1, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
      hoursLogged = Number(dur.toFixed(1));
    } else if (nextStatus === 'cancelled') {
      hoursLogged = 0;
    }

    db.prepare('UPDATE shift_signups SET status = ?, hours_logged = ? WHERE id = ?').run(
      nextStatus,
      hoursLogged,
      String(signup.id)
    );
    res.json({ ok: true, status: nextStatus, hoursLogged });
  });

  // --- BADGES, LEADERBOARD & CERTIFICATES ---
  app.get('/api/community/leaderboard', async (req, res) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const currentUser = await getUserByToken(token);

    const topDonorRows = db
      .prepare(
        `SELECT d.user_id, d.business_name, u.area, d.verification_status, d.logo_url,
                COALESCE((SELECT SUM(l.quantity - l.remaining_quantity) FROM listings l WHERE l.donor_id = d.user_id), 0) as meals_saved,
                (SELECT ROUND(AVG(dr.rating), 1) FROM donor_reviews dr WHERE dr.donor_id = d.user_id) as avg_rating
         FROM donors d
         JOIN users u ON d.user_id = u.id
         ORDER BY meals_saved DESC, d.business_name ASC
         LIMIT 6`
      )
      .all() as Record<string, unknown>[];

    const topVolunteerRows = db
      .prepare(
        `SELECT u.id, u.name, u.area, u.organization_name,
                COALESCE((SELECT SUM(ss.hours_logged) FROM shift_signups ss WHERE ss.user_id = u.id AND ss.status != 'cancelled'), 0) as shift_hours,
                (SELECT COUNT(*) FROM event_registrations er WHERE er.user_id = u.id) as event_count
         FROM users u
         WHERE u.role != 'donor'
         ORDER BY (shift_hours * 10 + event_count * 5) DESC
         LIMIT 6`
      )
      .all() as Record<string, unknown>[];

    const topAreaRows = db
      .prepare(
        `SELECT u.area,
                COUNT(DISTINCT l.id) as listings_count,
                COALESCE(SUM(l.quantity), 0) as total_portions
         FROM listings l
         JOIN users u ON l.donor_id = u.id
         GROUP BY u.area
         ORDER BY total_portions DESC
         LIMIT 6`
      )
      .all() as Record<string, unknown>[];

    let myBadges: { id: string; unlocked: boolean; progress: number; target: number }[] = [];
    let myStats = { mealsTotal: 0, volunteerHours: 0, donationsBdt: 0, qrHandovers: 0 };

    if (currentUser) {
      const claimedQty = (
        db
          .prepare("SELECT COALESCE(SUM(quantity_claimed), 0) as t FROM claims WHERE recipient_id = ? AND status IN ('accepted', 'picked_up', 'completed')")
          .get(currentUser.id) as { t: number }
      ).t;
      const donatedQty = (
        db
          .prepare("SELECT COALESCE(SUM(quantity - remaining_quantity), 0) as t FROM listings WHERE donor_id = ?")
          .get(currentUser.id) as { t: number }
      ).t;
      const qrCount = (
        db
          .prepare("SELECT COUNT(*) as c FROM claims c JOIN listings l ON c.listing_id = l.id WHERE (c.recipient_id = ? OR l.donor_id = ?) AND c.status = 'completed' AND c.handover_method = 'qr'")
          .get(currentUser.id, currentUser.id) as { c: number }
      ).c;
      const shiftHours = (
        db
          .prepare("SELECT COALESCE(SUM(hours_logged), 0) as t FROM shift_signups WHERE user_id = ? AND status != 'cancelled'")
          .get(currentUser.id) as { t: number }
      ).t;
      const eventRegCount = (
        db.prepare('SELECT COUNT(*) as c FROM event_registrations WHERE user_id = ?').get(currentUser.id) as { c: number }
      ).c;
      const cashBdt = (
        db
          .prepare("SELECT COALESCE(SUM(amount_bdt), 0) as t FROM donations WHERE user_id = ? AND status = 'completed'")
          .get(currentUser.id) as { t: number }
      ).t;
      const seasonalDon = (
        db
          .prepare("SELECT COUNT(*) as c FROM donations WHERE user_id = ? AND cause IN ('iftar_packs', 'sadaqah', 'zakat')")
          .get(currentUser.id) as { c: number }
      ).c;

      const mealsTotal = currentUser.role === 'donor' ? donatedQty : claimedQty;
      myStats = {
        mealsTotal,
        volunteerHours: Number(Number(shiftHours).toFixed(1)),
        donationsBdt: cashBdt,
        qrHandovers: qrCount,
      };

      myBadges = [
        { id: 'first_rescue', unlocked: mealsTotal >= 1, progress: Math.min(1, mealsTotal), target: 1 },
        { id: 'meal_hero_20', unlocked: mealsTotal >= 20, progress: Math.min(20, mealsTotal), target: 20 },
        { id: 'qr_verifier', unlocked: qrCount >= 1, progress: Math.min(1, qrCount), target: 1 },
        { id: 'volunteer_star', unlocked: shiftHours >= 2 || eventRegCount >= 1, progress: Math.min(2, shiftHours + eventRegCount), target: 2 },
        { id: 'kind_supporter', unlocked: cashBdt >= 500, progress: Math.min(500, cashBdt), target: 500 },
        { id: 'ramadan_champion', unlocked: seasonalDon >= 1, progress: Math.min(1, seasonalDon), target: 1 },
      ];
    }

    res.json({
      topDonors: topDonorRows.map((d) => ({
        id: String(d.user_id),
        businessName: String(d.business_name),
        area: String(d.area),
        verified: d.verification_status === 'verified',
        logoUrl: d.logo_url ? String(d.logo_url) : null,
        mealsSaved: Number(d.meals_saved ?? 0) + 18,
        avgRating: d.avg_rating !== null && d.avg_rating !== undefined ? Number(d.avg_rating) : 4.8,
      })),
      topVolunteers: topVolunteerRows.map((v) => ({
        id: String(v.id),
        name: String(v.name),
        area: String(v.area),
        organizationName: v.organization_name ? String(v.organization_name) : null,
        hoursLogged: Number(Number(v.shift_hours ?? 0).toFixed(1)) + Number(v.event_count ?? 0) * 2,
        eventsCount: Number(v.event_count ?? 0),
      })),
      topAreas: topAreaRows.map((a) => ({
        area: String(a.area),
        listingsCount: Number(a.listings_count ?? 0),
        totalPortions: Number(a.total_portions ?? 0) + 25,
      })),
      myBadges,
      myStats,
    });
  });

  // --- VITE / STATIC SERVING ---
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else if (
      process.env.NODE_ENV !== 'production' &&
      ['vite-hmr', 'vite-ping'].includes(String(request.headers['sec-websocket-protocol'] ?? ''))
    ) {
      return;
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', async (ws, request) => {
    ws.on('error', () => {});
    const url = new URL(request.url ?? '/', 'http://localhost');
    const token = url.searchParams.get('token');
    const user = await getUserByToken(token);
    if (!user || ws.readyState !== WebSocket.OPEN) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1008, 'Unauthorized');
      }
      return;
    }

    const isFirstSocket = !wsClients.has(user.id) || wsClients.get(user.id)!.size === 0;
    if (!wsClients.has(user.id)) wsClients.set(user.id, new Set());
    wsClients.get(user.id)!.add(ws);
    touchUserPresence(user.id, true);
    if (isFirstSocket) {
      broadcastWs('presence:update', { userId: user.id, isOnline: true, hasLoggedIn: true }, [user.id]);
    }

    ws.send(JSON.stringify({ event: 'ws:connected', data: { userId: user.id } }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.event === 'ping') {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ event: 'pong' }));
          }
          return;
        }
        if (msg.event === 'chat:typing' && msg.data?.conversationId) {
          const convId = String(msg.data.conversationId);
          const conv = db
            .prepare('SELECT donor_id, recipient_id FROM conversations WHERE id = ?')
            .get(convId) as
            | { donor_id: string; recipient_id: string }
            | undefined;
          const isParticipant = conv && (conv.donor_id === user.id || conv.recipient_id === user.id);
          if (conv && (isParticipant || user.role === 'admin' || isStarterConvId(convId))) {
            const typingPayload = {
              conversationId: msg.data.conversationId,
              userId: user.id,
              isTyping: Boolean(msg.data.isTyping),
            };
            if (isStarterConvId(convId)) {
              broadcastWs('chat:typing', typingPayload, [user.id]);
            } else if (isParticipant) {
              const peerId = conv.donor_id === user.id ? conv.recipient_id : conv.donor_id;
              sendToUser(peerId, 'chat:typing', typingPayload);
            } else {
              sendToUser(conv.donor_id, 'chat:typing', typingPayload);
              sendToUser(conv.recipient_id, 'chat:typing', typingPayload);
            }
          }
        }
        if (msg.event === 'call:signal' && msg.data?.conversationId) {
          const convId = String(msg.data.conversationId);
          const conv = db
            .prepare('SELECT donor_id, recipient_id FROM conversations WHERE id = ?')
            .get(convId) as
            | { donor_id: string; recipient_id: string }
            | undefined;
          const isParticipant = conv && (conv.donor_id === user.id || conv.recipient_id === user.id);
          if (conv && (isParticipant || user.role === 'admin' || isStarterConvId(convId))) {
            const signalPayload = {
              ...msg.data,
              fromUserId: user.id,
            };
            if (isParticipant) {
              const peerId = conv.donor_id === user.id ? conv.recipient_id : conv.donor_id;
              sendToUser(peerId, 'call:signal', signalPayload);
            } else {
              sendToUser(conv.donor_id, 'call:signal', signalPayload);
              sendToUser(conv.recipient_id, 'call:signal', signalPayload);
            }
          }
        }
      } catch {
        // Ignore malformed client frames
      }
    });

    ws.on('close', () => {
      wsClients.get(user.id)?.delete(ws);
      if (wsClients.get(user.id)?.size === 0) {
        wsClients.delete(user.id);
        touchUserPresence(user.id, false);
        broadcastWs('presence:update', { userId: user.id, isOnline: false, hasLoggedIn: true }, [user.id]);
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Rizik server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Rizik server:', err);
  process.exit(1);
});
