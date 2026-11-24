import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';

// DATA_DIR holds the SQLite DB and uploads; point it at a persistent volume when hosted.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || process.cwd());
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const LEGACY_DB_PATH = path.join(DATA_DIR, 'nourishloop.db');
const DB_PATH = path.join(DATA_DIR, 'aharforall.db');

if (fs.existsSync(LEGACY_DB_PATH) && !fs.existsSync(DB_PATH)) {
  fs.renameSync(LEGACY_DB_PATH, DB_PATH);
  for (const suffix of ['-wal', '-shm']) {
    if (fs.existsSync(`${LEGACY_DB_PATH}${suffix}`)) {
      fs.renameSync(`${LEGACY_DB_PATH}${suffix}`, `${DB_PATH}${suffix}`);
    }
  }
}

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK(role IN ('donor', 'recipient', 'admin')),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT NOT NULL,
      location TEXT NOT NULL,
      area TEXT NOT NULL,
      organization_name TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      language TEXT NOT NULL DEFAULT 'en',
      saved_radius_km REAL NOT NULL DEFAULT 8,
      password_hash TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donors (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      business_name TEXT NOT NULL,
      address TEXT NOT NULL,
      address_bn TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      hours TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      logo_url TEXT,
      is_online INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      identifier TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('cooked', 'bakery', 'produce', 'packaged')),
      dietary_tags TEXT NOT NULL DEFAULT '[]',
      quantity INTEGER NOT NULL,
      remaining_quantity INTEGER NOT NULL,
      unit TEXT NOT NULL DEFAULT 'servings',
      photo_urls TEXT NOT NULL DEFAULT '[]',
      pickup_start TEXT NOT NULL,
      pickup_end TEXT NOT NULL,
      pickup_address TEXT NOT NULL,
      pickup_address_bn TEXT,
      safety_note TEXT NOT NULL,
      prepared_at TEXT NOT NULL,
      consume_within_hours INTEGER NOT NULL DEFAULT 4,
      is_flash_rescue INTEGER NOT NULL DEFAULT 0,
      storage_method TEXT NOT NULL DEFAULT 'covered_hot',
      is_ramadan_special INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK(status IN ('active', 'paused', 'claimed', 'expired')),
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quantity_claimed INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('requested', 'accepted', 'picked_up', 'completed', 'cancelled', 'expired')),
      pickup_code TEXT NOT NULL,
      handover_method TEXT DEFAULT 'manual',
      notes TEXT,
      cancel_reason TEXT,
      created_at TEXT NOT NULL,
      accepted_at TEXT,
      picked_up_at TEXT,
      completed_at TEXT,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
      claim_id TEXT REFERENCES claims(id) ON DELETE CASCADE,
      donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      admin_only INTEGER NOT NULL DEFAULT 0,
      is_direct INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      image_url TEXT,
      audio_url TEXT,
      duration_sec INTEGER,
      call_type TEXT,
      call_status TEXT,
      file_url TEXT,
      file_name TEXT,
      file_size INTEGER,
      file_mime TEXT,
      location_lat REAL,
      location_lng REAL,
      location_label TEXT,
      location_expires_at TEXT,
      is_forwarded INTEGER NOT NULL DEFAULT 0,
      reply_to_id TEXT,
      reply_to_text TEXT,
      reply_to_sender_id TEXT,
      sent_at TEXT NOT NULL,
      read_at TEXT
    );

    CREATE TABLE IF NOT EXISTS message_deletions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (message_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocks (
      blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (blocker_id, blocked_id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      read INTEGER NOT NULL DEFAULT 0,
      admin_only INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_bn TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN (
        'restaurants_cafes',
        'wedding_venues',
        'hotels_catering',
        'ngos_charities',
        'orphanages_shelters',
        'community_groups',
        'individual_families'
      )),
      area TEXT NOT NULL,
      description TEXT NOT NULL,
      description_bn TEXT NOT NULL,
      logo_url TEXT,
      since_year INTEGER NOT NULL,
      meals_contributed INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS partner_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      organization_name TEXT NOT NULL,
      category TEXT NOT NULL,
      contact_person TEXT NOT NULL,
      contact_info TEXT NOT NULL,
      area TEXT NOT NULL,
      message TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS testimonials (
      id TEXT PRIMARY KEY,
      quote TEXT NOT NULL,
      quote_bn TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_name_bn TEXT NOT NULL,
      role_label TEXT NOT NULL,
      role_label_bn TEXT NOT NULL,
      org_name TEXT NOT NULL,
      category TEXT NOT NULL,
      avatar_url TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_bn TEXT NOT NULL,
      description TEXT NOT NULL,
      description_bn TEXT NOT NULL,
      organizer TEXT NOT NULL,
      organizer_bn TEXT NOT NULL,
      area TEXT NOT NULL,
      location_name TEXT NOT NULL,
      location_name_bn TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      event_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      schedule_json TEXT NOT NULL DEFAULT '[]',
      expected_meals INTEGER NOT NULL DEFAULT 100,
      actual_meals_served INTEGER,
      people_helped INTEGER,
      volunteers_needed INTEGER NOT NULL DEFAULT 10,
      banner_url TEXT NOT NULL,
      gallery_urls_json TEXT NOT NULL DEFAULT '[]',
      how_to_help TEXT NOT NULL,
      how_to_help_bn TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('upcoming', 'ongoing', 'past', 'cancelled')),
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_registrations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      availability TEXT NOT NULL,
      preferred_role TEXT NOT NULL CHECK(preferred_role IN ('cooking', 'packing', 'distribution', 'transport')),
      attendance_status TEXT NOT NULL DEFAULT 'registered' CHECK(attendance_status IN ('registered', 'present', 'absent')),
      reminder_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(event_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS wedding_pickups (
      id TEXT PRIMARY KEY,
      donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      address TEXT NOT NULL,
      address_bn TEXT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      contact_person TEXT NOT NULL,
      phone TEXT NOT NULL,
      event_date TEXT NOT NULL,
      ready_time TEXT NOT NULL,
      approx_servings INTEGER NOT NULL,
      food_types_json TEXT NOT NULL DEFAULT '[]',
      is_halal INTEGER NOT NULL DEFAULT 1,
      is_veg INTEGER NOT NULL DEFAULT 0,
      storage_method TEXT NOT NULL,
      photo_urls_json TEXT NOT NULL DEFAULT '[]',
      special_notes TEXT,
      is_urgent INTEGER NOT NULL DEFAULT 0,
      checklist_untouched INTEGER NOT NULL DEFAULT 1,
      checklist_covered INTEGER NOT NULL DEFAULT 1,
      checklist_fresh INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL CHECK(status IN ('submitted', 'volunteer_assigned', 'on_the_way', 'collected', 'delivered')),
      volunteer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      volunteer_name TEXT,
      ngo_claimer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      ngo_name TEXT,
      conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      delivery_photo_url TEXT,
      delivered_meals INTEGER,
      delivery_note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donations (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      donor_display_name TEXT NOT NULL,
      amount_bdt INTEGER NOT NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('one_time', 'monthly')),
      cause TEXT NOT NULL CHECK(cause IN ('general', 'events', 'wedding_pickup', 'platform', 'iftar_packs', 'sadaqah', 'zakat')),
      event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      payment_method TEXT NOT NULL CHECK(payment_method IN ('bkash', 'nagad', 'rocket', 'card_sandbox', 'bank_transfer')),
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      honor_of TEXT,
      receipt_code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'completed',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS donor_reviews (
      id TEXT PRIMARY KEY,
      claim_id TEXT UNIQUE NOT NULL,
      donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      hygiene_ok INTEGER NOT NULL DEFAULT 1,
      comment TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS volunteer_shifts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      title_bn TEXT NOT NULL,
      area TEXT NOT NULL,
      location_name TEXT NOT NULL,
      location_name_bn TEXT,
      role TEXT NOT NULL CHECK(role IN ('cooking', 'packing', 'distribution', 'transport')),
      shift_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      slots_total INTEGER NOT NULL DEFAULT 6,
      event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS shift_signups (
      id TEXT PRIMARY KEY,
      shift_id TEXT NOT NULL REFERENCES volunteer_shifts(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'signed_up' CHECK(status IN ('signed_up', 'checked_in', 'completed', 'cancelled')),
      hours_logged REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(shift_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS conversation_user_reads (
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      last_read_at TEXT NOT NULL,
      PRIMARY KEY (conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS notification_user_reads (
      notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      read_at TEXT NOT NULL,
      PRIMARY KEY (notification_id, user_id)
    );
  `);

  // Safe migration for pre-existing DBs lacking users.password_hash / presence timestamps
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'password_hash')) {
    db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT;');
  }
  if (!userCols.some((c) => c.name === 'last_login_at')) {
    db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT;');
  }
  if (!userCols.some((c) => c.name === 'last_active_at')) {
    db.exec('ALTER TABLE users ADD COLUMN last_active_at TEXT;');
  }

  db.exec(`
    UPDATE users
    SET last_login_at = COALESCE(
          last_login_at,
          (SELECT MAX(created_at) FROM sessions WHERE sessions.user_id = users.id)
        ),
        last_active_at = COALESCE(
          last_active_at,
          (SELECT MAX(created_at) FROM sessions WHERE sessions.user_id = users.id)
        )
    WHERE last_login_at IS NULL
      AND EXISTS (SELECT 1 FROM sessions WHERE sessions.user_id = users.id);
  `);

  // Safe migration for pre-existing DBs lacking donors.is_online / address_bn
  const donorCols = db.prepare('PRAGMA table_info(donors)').all() as { name: string }[];
  if (!donorCols.some((c) => c.name === 'is_online')) {
    db.exec('ALTER TABLE donors ADD COLUMN is_online INTEGER NOT NULL DEFAULT 1;');
  }
  if (!donorCols.some((c) => c.name === 'address_bn')) {
    db.exec('ALTER TABLE donors ADD COLUMN address_bn TEXT;');
  }

  const listingCols = db.prepare('PRAGMA table_info(listings)').all() as { name: string }[];
  if (!listingCols.some((c) => c.name === 'pickup_address_bn')) {
    db.exec('ALTER TABLE listings ADD COLUMN pickup_address_bn TEXT;');
  }
  if (!listingCols.some((c) => c.name === 'is_flash_rescue')) {
    db.exec('ALTER TABLE listings ADD COLUMN is_flash_rescue INTEGER NOT NULL DEFAULT 0;');
  }
  if (!listingCols.some((c) => c.name === 'storage_method')) {
    db.exec("ALTER TABLE listings ADD COLUMN storage_method TEXT NOT NULL DEFAULT 'covered_hot';");
  }
  if (!listingCols.some((c) => c.name === 'is_ramadan_special')) {
    db.exec('ALTER TABLE listings ADD COLUMN is_ramadan_special INTEGER NOT NULL DEFAULT 0;');
  }

  const claimCols = db.prepare('PRAGMA table_info(claims)').all() as { name: string }[];
  if (!claimCols.some((c) => c.name === 'handover_method')) {
    db.exec("ALTER TABLE claims ADD COLUMN handover_method TEXT DEFAULT 'manual';");
  }

  // Safe migration for pre-existing DBs whose donations table lacks seasonal causes
  const donSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'donations'")
    .get() as { sql?: string } | undefined;
  if (donSchema?.sql && !donSchema.sql.includes('zakat')) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE donations_v2 (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        donor_display_name TEXT NOT NULL,
        amount_bdt INTEGER NOT NULL,
        frequency TEXT NOT NULL CHECK(frequency IN ('one_time', 'monthly')),
        cause TEXT NOT NULL CHECK(cause IN ('general', 'events', 'wedding_pickup', 'platform', 'iftar_packs', 'sadaqah', 'zakat')),
        event_id TEXT REFERENCES events(id) ON DELETE SET NULL,
        payment_method TEXT NOT NULL CHECK(payment_method IN ('bkash', 'nagad', 'rocket', 'card_sandbox', 'bank_transfer')),
        is_anonymous INTEGER NOT NULL DEFAULT 0,
        honor_of TEXT,
        receipt_code TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL
      );
      INSERT INTO donations_v2 SELECT * FROM donations;
      DROP TABLE donations;
      ALTER TABLE donations_v2 RENAME TO donations;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
  }

  const eventCols = db.prepare('PRAGMA table_info(events)').all() as { name: string }[];
  if (!eventCols.some((c) => c.name === 'location_name_bn')) {
    db.exec('ALTER TABLE events ADD COLUMN location_name_bn TEXT;');
  }

  const weddingCols = db.prepare('PRAGMA table_info(wedding_pickups)').all() as { name: string }[];
  if (!weddingCols.some((c) => c.name === 'address_bn')) {
    db.exec('ALTER TABLE wedding_pickups ADD COLUMN address_bn TEXT;');
  }

  const testimonialCols = db.prepare('PRAGMA table_info(testimonials)').all() as { name: string }[];
  if (!testimonialCols.some((c) => c.name === 'avatar_url')) {
    db.exec('ALTER TABLE testimonials ADD COLUMN avatar_url TEXT;');
  }

  // Safe migration for pre-existing DBs lacking voice/call/file/location/forward/reply message columns
  const msgCols = db.prepare('PRAGMA table_info(messages)').all() as { name: string }[];
  const addMsgCol = (colName: string, defSql: string) => {
    if (!msgCols.some((c) => c.name === colName)) {
      db.exec(`ALTER TABLE messages ADD COLUMN ${colName} ${defSql};`);
    }
  };
  addMsgCol('message_type', "TEXT NOT NULL DEFAULT 'text'");
  addMsgCol('audio_url', 'TEXT');
  addMsgCol('duration_sec', 'INTEGER');
  addMsgCol('call_type', 'TEXT');
  addMsgCol('call_status', 'TEXT');
  addMsgCol('file_url', 'TEXT');
  addMsgCol('file_name', 'TEXT');
  addMsgCol('file_size', 'INTEGER');
  addMsgCol('file_mime', 'TEXT');
  addMsgCol('location_lat', 'REAL');
  addMsgCol('location_lng', 'REAL');
  addMsgCol('location_label', 'TEXT');
  addMsgCol('location_expires_at', 'TEXT');
  addMsgCol('is_forwarded', 'INTEGER NOT NULL DEFAULT 0');
  addMsgCol('reply_to_id', 'TEXT');
  addMsgCol('reply_to_text', 'TEXT');
  addMsgCol('reply_to_sender_id', 'TEXT');

  // Safe migration for conversations (nullable listing_id/claim_id + admin_only + is_direct)
  const convCols = db.prepare('PRAGMA table_info(conversations)').all() as {
    name: string;
    notnull: number;
  }[];
  const needsConvMigration =
    convCols.some((c) => (c.name === 'listing_id' || c.name === 'claim_id') && c.notnull === 1) ||
    !convCols.some((c) => c.name === 'admin_only') ||
    !convCols.some((c) => c.name === 'is_direct');
  if (needsConvMigration) {
    const hasAdminOnlyCol = convCols.some((c) => c.name === 'admin_only');
    const hasIsDirectCol = convCols.some((c) => c.name === 'is_direct');
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE conversations_v2 (
        id TEXT PRIMARY KEY,
        listing_id TEXT REFERENCES listings(id) ON DELETE CASCADE,
        claim_id TEXT REFERENCES claims(id) ON DELETE CASCADE,
        donor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        admin_only INTEGER NOT NULL DEFAULT 0,
        is_direct INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO conversations_v2 (id, listing_id, claim_id, donor_id, recipient_id, admin_only, is_direct, created_at, updated_at)
      SELECT id, listing_id, claim_id, donor_id, recipient_id,
             ${hasAdminOnlyCol ? 'admin_only' : '0'},
             ${hasIsDirectCol ? 'is_direct' : '0'},
             created_at, updated_at
      FROM conversations;
      DROP TABLE conversations;
      ALTER TABLE conversations_v2 RENAME TO conversations;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
  }

  // Safe migration for notifications.admin_only
  const notifCols = db.prepare('PRAGMA table_info(notifications)').all() as { name: string }[];
  if (!notifCols.some((c) => c.name === 'admin_only')) {
    db.exec('ALTER TABLE notifications ADD COLUMN admin_only INTEGER NOT NULL DEFAULT 0;');
  }

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount === 0) {
    seedDatabase();
  }
  ensureExtendedShopData();
  ensureExtendedCommunityData();

  // Keep seeded demo listings fresh across restarts if all demo batches expired from an earlier session
  const nowIso = new Date().toISOString();
  const activeListingCount = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM listings WHERE status = 'active' AND remaining_quantity > 0 AND pickup_end > ?`
      )
      .get(nowIso) as { c: number }
  ).c;
  if (activeListingCount === 0) {
    db.prepare(
      `UPDATE listings
       SET status = 'active',
           remaining_quantity = CASE WHEN remaining_quantity > 0 THEN remaining_quantity ELSE quantity END,
           pickup_start = ?,
           pickup_end = ?,
           prepared_at = ?
       WHERE id LIKE 'list_%'`
    ).run(isoOffset(-15), isoOffset(240), isoOffset(-60));
  }
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

function isoOffset(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

const PHOTO_COOKED = '/images/kacchi-biryani.jpg';
const PHOTO_BAKERY = '/images/dhaka-bakery-bread.jpg';
const PHOTO_PRODUCE = '/images/dhaka-vegetables.jpg';
const PHOTO_PACKAGED = '/images/singara-snacks.jpg';

const EXTENDED_SHOPS = [
  {
    id: 'donor_1',
    name: 'Arif Chowdhury',
    phone: '+8801711-223344',
    email: 'saffron@aharforall.org',
    area: 'Dhanmondi',
    businessName: 'Saffron Kitchen',
    address: 'House 42, Road 27, Dhanmondi, Dhaka',
    addressBn: 'বাড়ি ৪২, রোড ২৭, ধানমন্ডি, ঢাকা',
    lat: 23.7511,
    lng: 90.3765,
    hours: '10:00 AM - 10:30 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/haji-biriyani-boxes.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_2',
    name: 'Maya Sultana',
    phone: '+8801712-445566',
    email: 'gulshanbakery@aharforall.org',
    area: 'Gulshan 2',
    businessName: 'Gulshan Fresh Bakery',
    address: 'Plot 18, Road 71, Gulshan 2, Dhaka',
    addressBn: 'প্লট ১৮, রোড ৭১, গুলশান ২, ঢাকা',
    lat: 23.7925,
    lng: 90.4078,
    hours: '7:00 AM - 9:00 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/dhaka-bakery-bread.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_3',
    name: 'Kamrul Islam',
    phone: '+8801819-667788',
    email: 'krishibazar@aharforall.org',
    area: 'Banani',
    businessName: 'Krishi Fresh Co-op',
    address: 'Road 11, Block F, Banani, Dhaka',
    addressBn: 'রোড ১১, ব্লক এফ, বনানী, ঢাকা',
    lat: 23.7937,
    lng: 90.4066,
    hours: '8:00 AM - 9:30 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/dhaka-vegetables.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_4',
    name: 'Samira Karim',
    phone: '+8801911-889900',
    email: 'uttaracafe@aharforall.org',
    area: 'Uttara',
    businessName: 'Uttara Cha & Snacks Café',
    address: 'Sector 7, Lake Drive Road, Uttara, Dhaka',
    addressBn: 'সেক্টর ৭, লেক ড্রাইভ রোড, উত্তরা, ঢাকা',
    lat: 23.8682,
    lng: 90.3987,
    hours: '9:00 AM - 11:00 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/cha-tea-stall.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_5',
    name: 'Rezaul Karim',
    phone: '+8801611-334455',
    email: 'heritage@aharforall.org',
    area: 'Motijheel',
    businessName: 'Heritage Biryani House',
    address: '12 Dilkusha C/A, Motijheel, Dhaka',
    addressBn: '১২ দিলকুশা বা/এ, মতিঝিল, ঢাকা',
    lat: 23.7279,
    lng: 90.4184,
    hours: '11:30 AM - 10:00 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/tehari-plate.jpg',
    isOnline: 0,
  },
  {
    id: 'donor_6',
    name: 'Tanvir Hossain',
    phone: '+8801755-998877',
    email: 'mirpurfresh@aharforall.org',
    area: 'Mirpur 10',
    businessName: 'Mirpur Fresh Kitchen',
    address: 'Begum Rokeya Sarani, Mirpur 10, Dhaka',
    addressBn: 'বেগম রোকেয়া সরণি, মিরপুর ১০, ঢাকা',
    lat: 23.8069,
    lng: 90.3687,
    hours: '8:30 AM - 9:30 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/nihari-ruti.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_7',
    name: 'Faisal Rahman',
    phone: '+8801733-554422',
    email: 'dhakakabab@aharforall.org',
    area: 'Banani',
    businessName: 'Old Dhaka Kabab & Paratha',
    address: 'House 28, Road 17, Banani, Dhaka',
    addressBn: 'বাড়ি ২৮, রোড ১৭, বনানী, ঢাকা',
    lat: 23.7949,
    lng: 90.4041,
    hours: '12:00 PM - 11:30 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/seekh-kabab.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_8',
    name: 'Mita Dey',
    phone: '+8801844-112233',
    email: 'roshogolla@aharforall.org',
    area: 'Dhanmondi',
    businessName: 'Roshogolla Sweet House',
    address: 'Satmasjid Road, Dhanmondi 15, Dhaka',
    addressBn: 'সাতমসজিদ রোড, ধানমন্ডি ১৫, ঢাকা',
    lat: 23.7438,
    lng: 90.3724,
    hours: '8:00 AM - 10:00 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/roshogolla-sweets.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_9',
    name: 'Nabil Siddiqui',
    phone: '+8801977-331199',
    email: 'mohammadpurgrill@aharforall.org',
    area: 'Mohammadpur',
    businessName: 'Mohammadpur Kabab & Grill',
    address: 'Tajmahal Road, Block C, Mohammadpur, Dhaka',
    addressBn: 'তাজমহল রোড, ব্লক সি, মোহাম্মদপুর, ঢাকা',
    lat: 23.7654,
    lng: 90.3621,
    hours: '11:00 AM - 11:00 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/paratha-curry.jpg',
    isOnline: 0,
  },
  {
    id: 'donor_10',
    name: 'Chef Imran Kabir',
    phone: '+8801715-660011',
    email: 'sonargaon@aharforall.org',
    area: 'Karwan Bazar',
    businessName: 'Sonargaon Grand Kitchen',
    address: '107 Kazi Nazrul Islam Ave, Dhaka',
    addressBn: '১০৭ কাজী নজরুল ইসলাম এভিনিউ, কারওয়ান বাজার, ঢাকা',
    lat: 23.7495,
    lng: 90.3941,
    hours: '6:30 AM - 11:30 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/kitchen-packing-bd.jpg',
    isOnline: 1,
  },
  {
    id: 'donor_11',
    name: 'Habib Mia',
    phone: '+8801688-776655',
    email: 'chaicha@aharforall.org',
    area: 'Farmgate',
    businessName: 'Chai & Cha Tea Stall',
    address: 'Green Road Corner, Farmgate, Dhaka',
    addressBn: 'গ্রিন রোড কর্নার, ফার্মগেট, ঢাকা',
    lat: 23.7561,
    lng: 90.3881,
    hours: '6:00 AM - 10:00 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/singara-snacks.jpg',
    isOnline: 0,
  },
  {
    id: 'donor_12',
    name: 'Zara Chowdhury',
    phone: '+8801799-887744',
    email: 'crescent@aharforall.org',
    area: 'Gulshan 1',
    businessName: 'Crescent Event Caterers',
    address: 'Road 23, Gulshan 1, Dhaka',
    addressBn: 'রোড ২৩, গুলশান ১, ঢাকা',
    lat: 23.7808,
    lng: 90.4167,
    hours: '9:00 AM - 10:00 PM',
    verificationStatus: 'verified',
    logoUrl: '/images/rice-dal-bhorta.jpg',
    isOnline: 1,
  },
];

function seedDatabase() {
  const now = new Date().toISOString();

  const insertUser = db.prepare(`
    INSERT INTO users (id, role, name, phone, email, location, area, organization_name, verified, language, saved_radius_km, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDonor = db.prepare(`
    INSERT INTO donors (user_id, business_name, address, lat, lng, hours, verification_status, logo_url, is_online)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const d of EXTENDED_SHOPS) {
    insertUser.run(
      d.id,
      'donor',
      d.name,
      d.phone,
      d.email,
      'Dhaka, Bangladesh',
      d.area,
      d.businessName,
      d.verificationStatus === 'verified' ? 1 : 0,
      'en',
      10,
      now
    );
    insertDonor.run(
      d.id,
      d.businessName,
      d.address,
      d.lat,
      d.lng,
      d.hours,
      d.verificationStatus,
      d.logoUrl,
      d.isOnline
    );
  }

  // 5 Sample Recipients
  const recipients = [
    {
      id: 'recip_1',
      name: 'Nadia Rahman',
      phone: '+8801722-102030',
      email: 'nadia@aharforall.org',
      area: 'Dhanmondi',
      org: null,
    },
    {
      id: 'recip_2',
      name: 'Rafiqul Islam',
      phone: '+8801822-203040',
      email: 'alo@aharforall.org',
      area: 'Mohammadpur',
      org: 'Alo Community Shelter',
    },
    {
      id: 'recip_3',
      name: 'Tariq Hasan',
      phone: '+8801922-304050',
      email: 'tariq@aharforall.org',
      area: 'Banani',
      org: 'Dhaka Food Volunteers',
    },
    {
      id: 'recip_4',
      name: 'Farhana Yasmin',
      phone: '+8801622-405060',
      email: 'farhana@aharforall.org',
      area: 'Uttara',
      org: null,
    },
    {
      id: 'recip_5',
      name: 'Sajib Ahmed',
      phone: '+8801522-506070',
      email: 'sajib@aharforall.org',
      area: 'Mirpur',
      org: 'Mirpur Youth Aid',
    },
  ];

  for (const r of recipients) {
    insertUser.run(
      r.id,
      'recipient',
      r.name,
      r.phone,
      r.email,
      'Dhaka, Bangladesh',
      r.area,
      r.org,
      1,
      'en',
      8,
      now
    );
  }

  // Seeded Admin account
  insertUser.run(
    'admin_1',
    'admin',
    'Rizik Moderator',
    '+8801700-000001',
    'admin@aharforall.org',
    'Dhaka, Bangladesh',
    'Dhaka Central',
    'Rizik Operations',
    1,
    'en',
    25,
    now
  );

  // Sample Listings
  const insertListing = db.prepare(`
    INSERT INTO listings (
      id, donor_id, title, description, category, dietary_tags, quantity, remaining_quantity,
      unit, photo_urls, pickup_start, pickup_end, pickup_address, safety_note, prepared_at,
      consume_within_hours, status, lat, lng, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const listings = [
    {
      id: 'list_1',
      donorId: 'donor_1',
      title: 'Old Dhaka Kacchi Biryani & Roast Boxes',
      description: 'Freshly cooked lunchtime surplus boxes with aromatic chinigura rice, tender mutton kacchi, and boiled egg.',
      category: 'cooked',
      tags: ['Halal', 'Nut-Free'],
      qty: 12,
      rem: 10,
      unit: 'boxes',
      photo: '/images/kacchi-biryani.jpg',
      startMin: -30,
      endMin: 110,
      address: 'House 42, Road 27, Dhanmondi, Dhaka',
      safety: 'Kept hot above 65°C. Reheat thoroughly and consume within 4 hours of pickup.',
      prepMin: -90,
      consumeHrs: 4,
      status: 'active',
      lat: 23.7511,
      lng: 90.3765,
    },
    {
      id: 'list_2',
      donorId: 'donor_2',
      title: 'Freshly Baked Milk Buns, Pattice & Tea Loaves',
      description: 'Warm butter milk buns, flaky chicken pattice, and sliced tea loaves baked fresh early morning.',
      category: 'bakery',
      tags: ['Halal'],
      qty: 10,
      rem: 8,
      unit: 'bags',
      photo: '/images/dhaka-bakery-bread.jpg',
      startMin: -15,
      endMin: 180,
      address: 'Plot 18, Road 71, Gulshan 2, Dhaka',
      safety: 'Baked today at 6:00 AM. Best enjoyed within 24 hours; store in an airtight bag.',
      prepMin: -240,
      consumeHrs: 24,
      status: 'active',
      lat: 23.7925,
      lng: 90.4078,
    },
    {
      id: 'list_3',
      donorId: 'donor_3',
      title: 'Fresh Local Vegetables & Rajshahi Mangoes',
      description: 'Surplus morning harvest of brinjal, cauliflower, tomatoes, green chilies, and sweet seasonal mangoes.',
      category: 'produce',
      tags: ['Vegan', 'Veg', 'Gluten-Free', 'Nut-Free', 'Halal'],
      qty: 6,
      rem: 5,
      unit: 'crates',
      photo: '/images/dhaka-vegetables.jpg',
      startMin: -20,
      endMin: 240,
      address: 'Road 11, Block F, Banani, Dhaka',
      safety: 'Unwashed farm-fresh produce. Rinse thoroughly before preparation.',
      prepMin: -180,
      consumeHrs: 48,
      status: 'active',
      lat: 23.7937,
      lng: 90.4066,
    },
    {
      id: 'list_4',
      donorId: 'donor_4',
      title: 'Chicken Tehari & Egg Polao Lunch Boxes',
      description: 'Sealed food-grade boxes of spiced chicken tehari, roasted chicken, and cucumber salad.',
      category: 'packaged',
      tags: ['Halal'],
      qty: 14,
      rem: 14,
      unit: 'packs',
      photo: '/images/morog-polao.jpg',
      startMin: 0,
      endMin: 95,
      address: 'Sector 7, Lake Drive Road, Uttara, Dhaka',
      safety: 'Prepared fresh in sealed takeaway containers. Reheat and consume within 5 hours.',
      prepMin: -120,
      consumeHrs: 5,
      status: 'active',
      lat: 23.8682,
      lng: 90.3987,
    },
    {
      id: 'list_5',
      donorId: 'donor_5',
      title: 'Old Dhaka Beef Tehari & Dal Curry Packs',
      description: 'Aromatic mustard-oil beef tehari paired with slow-simmered thick masoor dal in sealed food-grade containers.',
      category: 'cooked',
      tags: ['Halal', 'Nut-Free'],
      qty: 15,
      rem: 15,
      unit: 'packs',
      photo: '/images/tehari-plate.jpg',
      startMin: -10,
      endMin: 155,
      address: '12 Dilkusha C/A, Motijheel, Dhaka',
      safety: 'Prepared fresh for corporate lunch service. Consume within 3 hours.',
      prepMin: -75,
      consumeHrs: 3,
      status: 'active',
      lat: 23.7279,
      lng: 90.4184,
    },
    {
      id: 'list_6',
      donorId: 'donor_6',
      title: 'Whole-Wheat Ruti, Bakery Buns & Plain Cake',
      description: 'Soft baked ruti packs, plain sponge cake slices, and sesame buns remaining from morning counter service.',
      category: 'bakery',
      tags: ['Veg', 'Halal'],
      qty: 8,
      rem: 8,
      unit: 'packs',
      photo: '/images/dhaka-bakery-bread.jpg',
      startMin: 15,
      endMin: 210,
      address: 'Begum Rokeya Sarani, Mirpur 10, Dhaka',
      safety: 'Store in airtight bag and consume within 24 hours.',
      prepMin: -160,
      consumeHrs: 24,
      status: 'active',
      lat: 23.8069,
      lng: 90.3687,
    },
    {
      id: 'list_7',
      donorId: 'donor_1',
      title: 'Bhuna Khichuri, Egg & Begun Bhaja Trays',
      description: 'Wholesome moong dal bhuna khichuri with crispy begun bhaja and achaar — ideal for community kitchens.',
      category: 'cooked',
      tags: ['Veg', 'Halal', 'Gluten-Free'],
      qty: 10,
      rem: 10,
      unit: 'servings',
      photo: '/images/bhuna-khichuri.jpg',
      startMin: 0,
      endMin: 150,
      address: 'House 42, Road 27, Dhanmondi, Dhaka',
      safety: 'Cooked fresh in sealed steel trays. Consume within 4 hours of pickup.',
      prepMin: -45,
      consumeHrs: 4,
      status: 'active',
      lat: 23.7511,
      lng: 90.3765,
    },
    {
      id: 'list_8',
      donorId: 'donor_2',
      title: 'Hot Singara, Piyaju & Crispy Jilapi Boxes',
      description: 'Evening snack boxes of crispy potato singaras, lentil piyaju, and golden jilapi packed warm.',
      category: 'bakery',
      tags: ['Veg', 'Halal'],
      qty: 7,
      rem: 7,
      unit: 'boxes',
      photo: '/images/chawkbazar-chop.jpg',
      startMin: -5,
      endMin: 130,
      address: 'Plot 18, Road 71, Gulshan 2, Dhaka',
      safety: 'Freshly fried this afternoon. Best enjoyed warm today.',
      prepMin: -120,
      consumeHrs: 12,
      status: 'active',
      lat: 23.7925,
      lng: 90.4078,
    },
    {
      id: 'list_9',
      donorId: 'donor_3',
      title: 'Seasonal Green Mangoes & Fresh Bhorta Greens',
      description: 'Hand-picked raw green mangoes, red spinach, lau, and coriander bundled cleanly in 1.5kg bags.',
      category: 'produce',
      tags: ['Vegan', 'Veg', 'Gluten-Free', 'Dairy-Free', 'Nut-Free'],
      qty: 9,
      rem: 9,
      unit: 'bags',
      photo: '/images/dhaka-mangoes.jpg',
      startMin: -20,
      endMin: 300,
      address: 'Road 11, Block F, Banani, Dhaka',
      safety: 'Fresh market produce. Wash thoroughly before eating or cooking.',
      prepMin: -240,
      consumeHrs: 36,
      status: 'active',
      lat: 23.7937,
      lng: 90.4066,
    },
    {
      id: 'list_10',
      donorId: 'donor_4',
      title: 'Traditional Clay-Pot Mishti Doi & Jilapi Cups',
      description: 'Chilled Bogura-style mishti doi clay cups and golden jilapi packs kept cool at the counter.',
      category: 'packaged',
      tags: ['Veg', 'Halal'],
      qty: 11,
      rem: 11,
      unit: 'cups',
      photo: '/images/mishti-doi.jpg',
      startMin: 0,
      endMin: 165,
      address: 'Sector 7, Lake Drive Road, Uttara, Dhaka',
      safety: 'Cold-chain maintained at 4°C. Keep chilled until consumed.',
      prepMin: -90,
      consumeHrs: 12,
      status: 'active',
      lat: 23.8682,
      lng: 90.3987,
    },
    {
      id: 'list_11',
      donorId: 'donor_5',
      title: 'Steamed Rice, Shorshe Ilish & Dal Platter',
      description: 'Complete Bangladeshi lunch meal boxes with steamed rice, mustard ilish curry, bhorta, and thick dal.',
      category: 'cooked',
      tags: ['Halal', 'Gluten-Free', 'Dairy-Free', 'Nut-Free'],
      qty: 8,
      rem: 8,
      unit: 'bowls',
      photo: '/images/ilish-curry.jpg',
      startMin: 10,
      endMin: 195,
      address: '12 Dilkusha C/A, Motijheel, Dhaka',
      safety: 'Cooked at 11:30 AM. Consume within 4 hours.',
      prepMin: -60,
      consumeHrs: 4,
      status: 'active',
      lat: 23.7279,
      lng: 90.4184,
    },
    {
      id: 'list_12',
      donorId: 'donor_6',
      title: 'Flaky Paratha & Slow-Cooked Beef Nihari Packs',
      description: 'Individually packed warm paratha rolls and slow-simmered beef nihari portions from evening service.',
      category: 'packaged',
      tags: ['Halal', 'Nut-Free'],
      qty: 6,
      rem: 6,
      unit: 'packs',
      photo: '/images/nihari-ruti.jpg',
      startMin: -15,
      endMin: 180,
      address: 'Begum Rokeya Sarani, Mirpur 10, Dhaka',
      safety: 'Packed cleanly 2 hours ago. Reheat thoroughly before eating.',
      prepMin: -120,
      consumeHrs: 5,
      status: 'active',
      lat: 23.8069,
      lng: 90.3687,
    },
  ];

  for (const l of listings) {
    insertListing.run(
      l.id,
      l.donorId,
      l.title,
      l.description,
      l.category,
      JSON.stringify(l.tags),
      l.qty,
      l.rem,
      l.unit,
      JSON.stringify([l.photo]),
      isoOffset(l.startMin),
      isoOffset(l.endMin),
      l.address,
      l.safety,
      isoOffset(l.prepMin),
      l.consumeHrs,
      l.status,
      l.lat,
      l.lng,
      now
    );
  }

  // Initial claims + conversations
  const insertClaim = db.prepare(`
    INSERT INTO claims (
      id, listing_id, recipient_id, quantity_claimed, status, pickup_code, notes,
      created_at, accepted_at, picked_up_at, completed_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertConv = db.prepare(`
    INSERT INTO conversations (id, listing_id, claim_id, donor_id, recipient_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMsg = db.prepare(`
    INSERT INTO messages (id, conversation_id, sender_id, text, image_url, sent_at, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertClaim.run(
    'claim_1',
    'list_2',
    'recip_1',
    2,
    'accepted',
    'GFB492',
    'Picking up for two elderly neighbors on Road 8.',
    isoOffset(-45),
    isoOffset(-35),
    null,
    null,
    isoOffset(180)
  );
  insertConv.run('conv_1', 'list_2', 'claim_1', 'donor_2', 'recip_1', isoOffset(-45), isoOffset(-3));
  insertMsg.run(
    'msg_1',
    'conv_1',
    'recip_1',
    'Assalamu Alaikum! I requested 2 bags of milk buns & pattice for two elderly neighbors nearby.',
    null,
    isoOffset(-44),
    isoOffset(-38)
  );
  insertMsg.run(
    'msg_2',
    'conv_1',
    'donor_2',
    'Accepted! Come to the side bakery counter before 6 PM and show code GFB492.',
    null,
    isoOffset(-35),
    isoOffset(-20)
  );
  insertMsg.run(
    'msg_3',
    'conv_1',
    'donor_2',
    'We also tucked in two extra warm tea loaves for them!',
    null,
    isoOffset(-3),
    null
  );

  insertClaim.run(
    'claim_2',
    'list_1',
    'recip_2',
    2,
    'requested',
    'SFK814',
    'Collecting for Alo evening youth meal.',
    isoOffset(-18),
    null,
    null,
    null,
    isoOffset(110)
  );
  insertConv.run('conv_2', 'list_1', 'claim_2', 'donor_1', 'recip_2', isoOffset(-18), isoOffset(-15));
  insertMsg.run(
    'msg_4',
    'conv_2',
    'recip_2',
    'Hello Saffron Kitchen! Is this still available for pickup in 25 minutes?',
    null,
    isoOffset(-18),
    isoOffset(-16)
  );
  insertMsg.run(
    'msg_5',
    'conv_2',
    'donor_1',
    'Yes, we are packing the kacchi biryani trays now — confirming your request shortly.',
    null,
    isoOffset(-15),
    null
  );

  insertClaim.run(
    'claim_3',
    'list_3',
    'recip_3',
    1,
    'completed',
    'KFC209',
    'Volunteer bike pickup for Banani community fridge.',
    isoOffset(-190),
    isoOffset(-180),
    isoOffset(-130),
    isoOffset(-125),
    isoOffset(240)
  );
  insertConv.run('conv_3', 'list_3', 'claim_3', 'donor_3', 'recip_3', isoOffset(-190), isoOffset(-120));
  insertMsg.run(
    'msg_6',
    'conv_3',
    'recip_3',
    "I'm on my way on cargo bike, arriving in 10 minutes!",
    null,
    isoOffset(-145),
    isoOffset(-140)
  );
  insertMsg.run(
    'msg_7',
    'conv_3',
    'donor_3',
    'Vegetable & mango crate is ready at the front loading bay.',
    null,
    isoOffset(-138),
    isoOffset(-135)
  );
  insertMsg.run(
    'msg_8',
    'conv_3',
    'recip_3',
    'Thank you! Handover confirmed and delivered safely.',
    null,
    isoOffset(-120),
    isoOffset(-115)
  );

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, body, payload, read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertNotif.run(
    'notif_1',
    'recip_1',
    'claim_accepted',
    'Pickup Accepted · Gulshan Fresh Bakery',
    'Your request for Freshly Baked Milk Buns, Pattice & Tea Loaves was accepted. Pickup code: GFB492.',
    JSON.stringify({ claimId: 'claim_1', conversationId: 'conv_1' }),
    0,
    isoOffset(-35)
  );
  insertNotif.run(
    'notif_2',
    'donor_1',
    'claim_requested',
    'New Rescue Request · Saffron Kitchen',
    'Alo Community Shelter requested 2 boxes of Old Dhaka Kacchi Biryani & Roast Boxes.',
    JSON.stringify({ claimId: 'claim_2', conversationId: 'conv_2' }),
    0,
    isoOffset(-18)
  );

  db.prepare('INSERT OR IGNORE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    'demo-recipient-nadia',
    'recip_1',
    now
  );
  db.prepare('INSERT OR IGNORE INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    'demo-donor-saffron',
    'donor_1',
    now
  );
}

interface ShopConvoTemplate {
  key: string;
  donorId: string;
  listingId: string;
  listingTitle: string;
  listingDesc: string;
  category: 'cooked' | 'bakery' | 'produce' | 'packaged';
  tags: string[];
  unit: string;
  photo: string;
  claimStatus: 'accepted' | 'requested' | 'completed';
  pickupCode: string;
  unread: boolean;
  lastMsgMinAgo: number;
  messages: { fromDonor: boolean; text: string; minAgo: number; unread?: boolean }[];
}

const SHOP_CONVO_TEMPLATES: ShopConvoTemplate[] = [
  {
    key: 'saffron',
    donorId: 'donor_1',
    listingId: 'list_1',
    listingTitle: 'Old Dhaka Kacchi Biryani & Roast Boxes',
    listingDesc: 'Freshly cooked lunchtime surplus boxes with aromatic chinigura rice, tender mutton kacchi, and boiled egg.',
    category: 'cooked',
    tags: ['Halal', 'Nut-Free'],
    unit: 'boxes',
    photo: '/images/kacchi-biryani.jpg',
    claimStatus: 'accepted',
    pickupCode: 'SFB318',
    unread: true,
    lastMsgMinAgo: 6,
    messages: [
      { fromDonor: false, text: 'Salam! Can I collect 2 Kacchi Biryani boxes around 5:30 PM?', minAgo: 28 },
      { fromDonor: true, text: 'Walaikum Assalam! Yes, your boxes are packed warm and sealed.', minAgo: 12 },
      { fromDonor: true, text: 'Ask for Arif at the side pickup counter — code SFB318.', minAgo: 6, unread: true },
    ],
  },
  {
    key: 'napoli',
    donorId: 'donor_7',
    listingId: 'list_16',
    listingTitle: 'Charcoal Beef Seekh Kabab & Naan Paratha',
    listingDesc: 'Freshly grilled smoky seekh kabab skewers paired with soft naan paratha and tamarind chutney.',
    category: 'cooked',
    tags: ['Halal'],
    unit: 'boxes',
    photo: '/images/seekh-kabab.jpg',
    claimStatus: 'accepted',
    pickupCode: 'OKP741',
    unread: true,
    lastMsgMinAgo: 11,
    messages: [
      { fromDonor: false, text: 'Salam Old Dhaka Kabab! Are the seekh kabab & paratha boxes still available?', minAgo: 42 },
      { fromDonor: true, text: 'Walaikum Assalam! We saved 3 family boxes with fresh seekh kabab & warm paratha.', minAgo: 14, unread: true },
      { fromDonor: true, text: 'Please bring a flat tote bag if picking up on scooter!', minAgo: 11, unread: true },
    ],
  },
  {
    key: 'roshogolla',
    donorId: 'donor_8',
    listingId: 'list_17',
    listingTitle: 'Fresh Roshogolla, Sandesh & Kalojam Boxes',
    listingDesc: 'Traditional Bangladeshi milk sweets packed cleanly in food-grade boxes at day end.',
    category: 'packaged',
    tags: ['Veg', 'Halal'],
    unit: 'boxes',
    photo: '/images/roshogolla-sweets.jpg',
    claimStatus: 'accepted',
    pickupCode: 'RSH502',
    unread: true,
    lastMsgMinAgo: 19,
    messages: [
      { fromDonor: false, text: 'Hello! Hoping to pick up sweet boxes for our community elder center.', minAgo: 55 },
      { fromDonor: true, text: 'We would love that! Packed 4 boxes of Sandesh and Roshogolla for you.', minAgo: 19, unread: true },
    ],
  },
  {
    key: 'bistro27',
    donorId: 'donor_4',
    listingId: 'list_4',
    listingTitle: 'Chicken Tehari & Egg Polao Lunch Boxes',
    listingDesc: 'Sealed food-grade boxes of spiced chicken tehari, roasted chicken, and cucumber salad.',
    category: 'packaged',
    tags: ['Halal'],
    unit: 'packs',
    photo: '/images/morog-polao.jpg',
    claimStatus: 'requested',
    pickupCode: 'UCS619',
    unread: false,
    lastMsgMinAgo: 26,
    messages: [
      { fromDonor: false, text: 'Hi Uttara Cha & Snacks! On my way toward Sector 7 — can pick up 2 boxes.', minAgo: 32 },
      { fromDonor: true, text: 'Sounds good! Let us know 5 minutes before you reach Lake Drive Road.', minAgo: 26 },
    ],
  },
  {
    key: 'greengrocer',
    donorId: 'donor_3',
    listingId: 'list_3',
    listingTitle: 'Fresh Local Vegetables & Rajshahi Mangoes',
    listingDesc: 'Surplus morning harvest of brinjal, cauliflower, tomatoes, and sweet seasonal mangoes.',
    category: 'produce',
    tags: ['Vegan', 'Veg', 'Halal'],
    unit: 'crates',
    photo: '/images/dhaka-vegetables.jpg',
    claimStatus: 'completed',
    pickupCode: 'KFC440',
    unread: false,
    lastMsgMinAgo: 44,
    messages: [
      { fromDonor: false, text: 'Thanks for the fresh vegetables & mangoes! Everything was super fresh.', minAgo: 50 },
      { fromDonor: true, text: 'So glad it helped! Watch for our Friday morning produce crate too.', minAgo: 44 },
    ],
  },
  {
    key: 'sonargaon',
    donorId: 'donor_10',
    listingId: 'list_18',
    listingTitle: 'Banquet Polao, Roast Chicken & Mutton Curry',
    listingDesc: 'Unserved banquet trays from lunch conference, packed cleanly in insulated boxes.',
    category: 'cooked',
    tags: ['Halal'],
    unit: 'trays',
    photo: '/images/rice-dal-bhorta.jpg',
    claimStatus: 'accepted',
    pickupCode: 'SGK903',
    unread: true,
    lastMsgMinAgo: 58,
    messages: [
      { fromDonor: false, text: 'Hi Chef Imran, can a volunteer van pick up at the service gate?', minAgo: 80 },
      { fromDonor: true, text: 'Yes! Security at Gate B has your pass ready under code SGK903.', minAgo: 58, unread: true },
    ],
  },
  {
    key: 'heritage',
    donorId: 'donor_5',
    listingId: 'list_5',
    listingTitle: 'Old Dhaka Beef Tehari & Dal Curry Packs',
    listingDesc: 'Aromatic mustard-oil beef tehari paired with slow-simmered thick masoor dal.',
    category: 'cooked',
    tags: ['Halal', 'Nut-Free'],
    unit: 'packs',
    photo: '/images/tehari-plate.jpg',
    claimStatus: 'completed',
    pickupCode: 'HBH215',
    unread: false,
    lastMsgMinAgo: 95,
    messages: [
      { fromDonor: true, text: 'Thank you for rescuing 6 packs of Beef Tehari today!', minAgo: 98 },
      { fromDonor: false, text: 'Shared them right away with families near Motijheel. Thank you!', minAgo: 95 },
    ],
  },
  {
    key: 'dailyharvest',
    donorId: 'donor_6',
    listingId: 'list_12',
    listingTitle: 'Flaky Paratha & Slow-Cooked Beef Nihari Packs',
    listingDesc: 'Individually packed warm paratha rolls and slow-simmered beef nihari portions.',
    category: 'packaged',
    tags: ['Halal', 'Nut-Free'],
    unit: 'packs',
    photo: '/images/nihari-ruti.jpg',
    claimStatus: 'completed',
    pickupCode: 'MFK782',
    unread: false,
    lastMsgMinAgo: 135,
    messages: [
      { fromDonor: false, text: 'Picked up the paratha & nihari packs from Mirpur 10 counter — appreciate it!', minAgo: 140 },
      { fromDonor: true, text: 'Anytime! Reach out tomorrow evening if you need more.', minAgo: 135 },
    ],
  },
  {
    key: 'expressgrill',
    donorId: 'donor_9',
    listingId: 'list_19',
    listingTitle: 'Grilled Seekh Kabab & Tandoori Roti Wraps',
    listingDesc: 'Freshly wrapped evening surplus seekh kababs, paratha rolls, and grilled chicken.',
    category: 'cooked',
    tags: ['Halal'],
    unit: 'packs',
    photo: '/images/paratha-curry.jpg',
    claimStatus: 'completed',
    pickupCode: 'MKG118',
    unread: false,
    lastMsgMinAgo: 185,
    messages: [
      { fromDonor: true, text: 'We have 5 extra grilled kabab & paratha wraps sealed warm.', minAgo: 195 },
      { fromDonor: false, text: 'Collected all 5 — thanks Mohammadpur Kabab & Grill!', minAgo: 185 },
    ],
  },
  {
    key: 'chaicha',
    donorId: 'donor_11',
    listingId: 'list_20',
    listingTitle: 'Crispy Singara, Samosa & Evening Cha Pack',
    listingDesc: 'Evening batch of hot potato singaras, crispy samosas, and tea-time biscuits.',
    category: 'bakery',
    tags: ['Veg', 'Halal'],
    unit: 'packs',
    photo: '/images/singara-snacks.jpg',
    claimStatus: 'completed',
    pickupCode: 'CCT334',
    unread: false,
    lastMsgMinAgo: 240,
    messages: [
      { fromDonor: true, text: 'Hot singaras & samosas packed in paper boxes near Green Road.', minAgo: 250 },
      { fromDonor: false, text: 'Got them — everyone loved the masala cha & singaras!', minAgo: 240 },
    ],
  },
  {
    key: 'crescent',
    donorId: 'donor_12',
    listingId: 'list_21',
    listingTitle: 'Seminar Catering Morog Polao & Salad Trays',
    listingDesc: 'Full-sized insulated catering trays from a Gulshan seminar lunch.',
    category: 'cooked',
    tags: ['Halal', 'Nut-Free'],
    unit: 'trays',
    photo: '/images/morog-polao.jpg',
    claimStatus: 'accepted',
    pickupCode: 'CEC664',
    unread: true,
    lastMsgMinAgo: 31,
    messages: [
      { fromDonor: false, text: 'Hello Crescent Caterers! Do we need to bring insulated bags?', minAgo: 62 },
      { fromDonor: true, text: 'No need, trays are foil-sealed inside thermal cartons for pickup.', minAgo: 31, unread: true },
    ],
  },
];

function ensureExtendedShopData() {
  const now = new Date().toISOString();

  const upsertUser = db.prepare(`
    INSERT OR IGNORE INTO users (id, role, name, phone, email, location, area, organization_name, verified, language, saved_radius_km, created_at)
    VALUES (?, 'donor', ?, ?, ?, 'Dhaka, Bangladesh', ?, ?, 1, 'en', 10, ?)
  `);

  const upsertDonor = db.prepare(`
    INSERT INTO donors (user_id, business_name, address, address_bn, lat, lng, hours, verification_status, logo_url, is_online)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      business_name = excluded.business_name,
      address = excluded.address,
      address_bn = COALESCE(excluded.address_bn, donors.address_bn),
      logo_url = excluded.logo_url,
      is_online = excluded.is_online
  `);

  const syncSeededUser = db.prepare(`
    UPDATE users SET name = ?, email = ?, organization_name = ? WHERE id = ?
  `);

  for (const s of EXTENDED_SHOPS) {
    upsertUser.run(s.id, s.name, s.phone, s.email, s.area, s.businessName, now);
    syncSeededUser.run(s.name, s.email, s.businessName, s.id);
    upsertDonor.run(
      s.id,
      s.businessName,
      s.address,
      s.addressBn,
      s.lat,
      s.lng,
      s.hours,
      s.verificationStatus,
      s.logoUrl,
      s.isOnline
    );
  }

  // Sync seeded recipient/admin emails & branding
  db.prepare(`UPDATE users SET email = REPLACE(email, '@nourishloop.org', '@aharforall.org') WHERE email LIKE '%@nourishloop.org'`).run();
  db.prepare(`UPDATE users SET name = 'Rizik Moderator', organization_name = 'Rizik Operations' WHERE id = 'admin_1'`).run();

  // Ensure listings for donor_7..donor_12 exist
  const insertListingIgnore = db.prepare(`
    INSERT OR IGNORE INTO listings (
      id, donor_id, title, description, category, dietary_tags, quantity, remaining_quantity,
      unit, photo_urls, pickup_start, pickup_end, pickup_address, pickup_address_bn, safety_note, prepared_at,
      consume_within_hours, status, lat, lng, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
  `);

  for (const tmpl of SHOP_CONVO_TEMPLATES) {
    const shop = EXTENDED_SHOPS.find((s) => s.id === tmpl.donorId)!;
    insertListingIgnore.run(
      tmpl.listingId,
      tmpl.donorId,
      tmpl.listingTitle,
      tmpl.listingDesc,
      tmpl.category,
      JSON.stringify(tmpl.tags),
      10,
      7,
      tmpl.unit,
      JSON.stringify([tmpl.photo]),
      isoOffset(-30),
      isoOffset(240),
      shop.address,
      shop.addressBn,
      'Prepared fresh in hygienic kitchen. Consume within 4 hours of pickup.',
      isoOffset(-60),
      4,
      shop.lat,
      shop.lng,
      now
    );
  }

  // Idempotent sync of seeded listing titles, descriptions, and real Bangladeshi photos
  const seededListingsSync: { id: string; title: string; desc: string; photo: string }[] = [
    {
      id: 'list_1',
      title: 'Old Dhaka Kacchi Biryani & Roast Boxes',
      desc: 'Freshly cooked lunchtime surplus boxes with aromatic chinigura rice, tender mutton kacchi, and boiled egg.',
      photo: '/images/kacchi-biryani.jpg',
    },
    {
      id: 'list_2',
      title: 'Freshly Baked Milk Buns, Pattice & Tea Loaves',
      desc: 'Warm butter milk buns, flaky chicken pattice, and sliced tea loaves baked fresh early morning.',
      photo: '/images/dhaka-bakery-bread.jpg',
    },
    {
      id: 'list_3',
      title: 'Fresh Local Vegetables & Rajshahi Mangoes',
      desc: 'Surplus morning harvest of brinjal, cauliflower, tomatoes, green chilies, and sweet seasonal mangoes.',
      photo: '/images/dhaka-vegetables.jpg',
    },
    {
      id: 'list_4',
      title: 'Chicken Tehari & Egg Polao Lunch Boxes',
      desc: 'Sealed food-grade boxes of spiced chicken tehari, roasted chicken, and cucumber salad.',
      photo: '/images/morog-polao.jpg',
    },
    {
      id: 'list_5',
      title: 'Old Dhaka Beef Tehari & Dal Curry Packs',
      desc: 'Aromatic mustard-oil beef tehari paired with slow-simmered thick masoor dal in sealed food-grade containers.',
      photo: '/images/tehari-plate.jpg',
    },
    {
      id: 'list_6',
      title: 'Whole-Wheat Ruti, Bakery Buns & Plain Cake',
      desc: 'Soft baked ruti packs, plain sponge cake slices, and sesame buns remaining from morning counter service.',
      photo: '/images/dhaka-bakery-bread.jpg',
    },
    {
      id: 'list_7',
      title: 'Bhuna Khichuri, Egg & Begun Bhaja Trays',
      desc: 'Wholesome moong dal bhuna khichuri with crispy begun bhaja and achaar — ideal for community kitchens.',
      photo: '/images/bhuna-khichuri.jpg',
    },
    {
      id: 'list_8',
      title: 'Hot Singara, Piyaju & Crispy Jilapi Boxes',
      desc: 'Evening snack boxes of crispy potato singaras, lentil piyaju, and golden jilapi packed warm.',
      photo: '/images/chawkbazar-chop.jpg',
    },
    {
      id: 'list_9',
      title: 'Seasonal Green Mangoes & Fresh Bhorta Greens',
      desc: 'Hand-picked raw green mangoes, red spinach, lau, and coriander bundled cleanly in 1.5kg bags.',
      photo: '/images/dhaka-mangoes.jpg',
    },
    {
      id: 'list_10',
      title: 'Traditional Clay-Pot Mishti Doi & Jilapi Cups',
      desc: 'Chilled Bogura-style mishti doi clay cups and golden jilapi packs kept cool at the counter.',
      photo: '/images/mishti-doi.jpg',
    },
    {
      id: 'list_11',
      title: 'Steamed Rice, Shorshe Ilish & Dal Platter',
      desc: 'Complete Bangladeshi lunch meal boxes with steamed rice, mustard ilish curry, bhorta, and thick dal.',
      photo: '/images/ilish-curry.jpg',
    },
    {
      id: 'list_12',
      title: 'Flaky Paratha & Slow-Cooked Beef Nihari Packs',
      desc: 'Individually packed warm paratha rolls and slow-simmered beef nihari portions from evening service.',
      photo: '/images/nihari-ruti.jpg',
    },
  ];
  for (const tmpl of SHOP_CONVO_TEMPLATES) {
    if (!seededListingsSync.some((x) => x.id === tmpl.listingId)) {
      seededListingsSync.push({
        id: tmpl.listingId,
        title: tmpl.listingTitle,
        desc: tmpl.listingDesc,
        photo: tmpl.photo,
      });
    }
  }
  const syncListingStmt = db.prepare(
    'UPDATE listings SET title = ?, description = ?, photo_urls = ? WHERE id = ?'
  );
  for (const item of seededListingsSync) {
    syncListingStmt.run(item.title, item.desc, JSON.stringify([item.photo]), item.id);
  }
  // Catch any custom or wedding listings still referencing old /src/assets/images/
  db.prepare(
    `UPDATE listings SET photo_urls = REPLACE(photo_urls, '/src/assets/images/food_cooked_meal_1794928399151.jpg', '/images/kacchi-biryani.jpg') WHERE photo_urls LIKE '%/src/assets/images/%'`
  ).run();
  db.prepare(
    `UPDATE listings SET photo_urls = REPLACE(photo_urls, '/src/assets/images/food_bakery_1794928399325.jpg', '/images/dhaka-bakery-bread.jpg') WHERE photo_urls LIKE '%/src/assets/images/%'`
  ).run();
  db.prepare(
    `UPDATE listings SET photo_urls = REPLACE(photo_urls, '/src/assets/images/food_produce_1794928400275.jpg', '/images/dhaka-vegetables.jpg') WHERE photo_urls LIKE '%/src/assets/images/%'`
  ).run();
  db.prepare(
    `UPDATE listings SET photo_urls = REPLACE(photo_urls, '/src/assets/images/food_packaged_1794928400420.jpg', '/images/singara-snacks.jpg') WHERE photo_urls LIKE '%/src/assets/images/%'`
  ).run();
  db.prepare(
    `UPDATE listings SET photo_urls = REPLACE(photo_urls, '/src/assets/images/wedding_buffet_rescue_1795019734970.jpg', '/images/wedding-buffet-bd.jpg') WHERE photo_urls LIKE '%/src/assets/images/%'`
  ).run();

  // Sync seeded starter chat messages and notifications so pre-existing DBs show Bangladeshi foods
  const syncMsgStmt = db.prepare('UPDATE messages SET text = ? WHERE id = ?');
  syncMsgStmt.run('Assalamu Alaikum! I requested 2 bags of milk buns & pattice for two elderly neighbors nearby.', 'msg_1');
  syncMsgStmt.run('Accepted! Come to the side bakery counter before 6 PM and show code GFB492.', 'msg_2');
  syncMsgStmt.run('We also tucked in two extra warm tea loaves for them!', 'msg_3');
  syncMsgStmt.run('Yes, we are packing the kacchi biryani trays now — confirming your request shortly.', 'msg_5');
  syncMsgStmt.run('Vegetable & mango crate is ready at the front loading bay.', 'msg_7');
  db.prepare(
    `UPDATE notifications SET title = ?, body = ? WHERE id = 'notif_1'`
  ).run(
    'Pickup Accepted · Gulshan Fresh Bakery',
    'Your request for Freshly Baked Milk Buns, Pattice & Tea Loaves was accepted. Pickup code: GFB492.'
  );
  db.prepare(
    `UPDATE notifications SET body = ? WHERE id = 'notif_2'`
  ).run('Alo Community Shelter requested 2 boxes of Old Dhaka Kacchi Biryani & Roast Boxes.');

  // Idempotent backfill for pre-existing DB rows lacking pickup_address_bn
  const setListingBn = db.prepare(
    "UPDATE listings SET pickup_address_bn = ? WHERE donor_id = ? AND (pickup_address_bn IS NULL OR pickup_address_bn = '')"
  );
  for (const s of EXTENDED_SHOPS) {
    setListingBn.run(s.addressBn, s.id);
  }

  // Ensure seeded accounts have a default demo password hash ('password123') if unset
  const usersWithoutPw = db
    .prepare("SELECT id FROM users WHERE password_hash IS NULL AND (email LIKE '%@aharforall.org' OR email LIKE '%@nourishloop.org')")
    .all() as { id: string }[];
  if (usersWithoutPw.length > 0) {
    const defaultPwHash = hashPassword('password123');
    const setPw = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    for (const u of usersWithoutPw) {
      setPw.run(defaultPwHash, u.id);
    }
  }

  // Ensure starter/demo platform conversations and seeded notifications are visible
  // to all logged-in users (not restricted to admin-only).
  const totalConvs = (db.prepare('SELECT COUNT(*) as c FROM conversations').get() as { c: number }).c;
  if (totalConvs <= 3) {
    seedStarterInboxForRecipient('recip_1', true, false);
  }
  db.prepare(
    `UPDATE conversations SET admin_only = 0 WHERE id IN ('conv_1', 'conv_2', 'conv_3') OR id LIKE 'conv_shop_%'`
  ).run();
  db.prepare(
    `UPDATE notifications SET admin_only = 0
     WHERE id IN ('notif_1', 'notif_2')
        OR (
          user_id IN ('recip_1','recip_2','recip_3','recip_4','recip_5','donor_1','donor_2','donor_3')
          AND id NOT LIKE 'notif_live_%'
          AND type IN ('claim_accepted','claim_requested','flash_rescue','claim_completed','donor_review','donation_receipt','shift_signup')
        )`
  ).run();

  // Sync seeded shop starter chat messages for existing pre-seeded threads
  SHOP_CONVO_TEMPLATES.forEach((tmpl) => {
    tmpl.messages.forEach((m, mIdx) => {
      syncMsgStmt.run(m.text, `msg_shop_recip_1_${tmpl.key}_${mIdx}`);
    });
  });
}

export function seedStarterInboxForRecipient(
  recipientId: string,
  preserveExisting = true,
  adminOnly = false
) {
  const existingConvCount = (
    db
      .prepare('SELECT COUNT(*) as c FROM conversations WHERE recipient_id = ?')
      .get(recipientId) as { c: number }
  ).c;

  if (!preserveExisting && existingConvCount > 0) return;

  const insertClaim = db.prepare(`
    INSERT OR IGNORE INTO claims (
      id, listing_id, recipient_id, quantity_claimed, status, pickup_code, notes,
      created_at, accepted_at, picked_up_at, completed_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertConv = db.prepare(`
    INSERT OR IGNORE INTO conversations (id, listing_id, claim_id, donor_id, recipient_id, admin_only, is_direct, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
  `);

  const insertMsg = db.prepare(`
    INSERT OR IGNORE INTO messages (id, conversation_id, sender_id, text, image_url, sent_at, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  SHOP_CONVO_TEMPLATES.forEach((tmpl, idx) => {
    const claimId = `claim_shop_${recipientId}_${tmpl.key}`;
    const convId = `conv_shop_${recipientId}_${tmpl.key}`;

    // Skip if this recipient already has a conversation with this donor
    const hasDonorConv = db
      .prepare('SELECT 1 FROM conversations WHERE donor_id = ? AND recipient_id = ?')
      .get(tmpl.donorId, recipientId);
    if (hasDonorConv) return;

    // 28h+ ago so daily 24h rescue quota is never exhausted by starter shop threads
    const oldCreatedAt = isoOffset(-(1680 + idx * 90));
    const acceptedAt = tmpl.claimStatus !== 'requested' ? isoOffset(-(1660 + idx * 90)) : null;
    const completedAt = tmpl.claimStatus === 'completed' ? isoOffset(-(1620 + idx * 90)) : null;
    const expiresAt = isoOffset(240);

    insertClaim.run(
      claimId,
      tmpl.listingId,
      recipientId,
      2,
      tmpl.claimStatus,
      tmpl.pickupCode,
      null,
      oldCreatedAt,
      acceptedAt,
      completedAt,
      completedAt,
      expiresAt
    );

    insertConv.run(
      convId,
      tmpl.listingId,
      claimId,
      tmpl.donorId,
      recipientId,
      adminOnly ? 1 : 0,
      oldCreatedAt,
      isoOffset(-tmpl.lastMsgMinAgo)
    );

    tmpl.messages.forEach((m, mIdx) => {
      const msgId = `msg_shop_${recipientId}_${tmpl.key}_${mIdx}`;
      const senderId = m.fromDonor ? tmpl.donorId : recipientId;
      const readAt = m.unread ? null : isoOffset(-(m.minAgo - 1));
      insertMsg.run(msgId, convId, senderId, m.text, null, isoOffset(-m.minAgo), readAt);
    });
  });
}

export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function generatePickupCode(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  let out = '';
  for (let i = 0; i < 3; i++) out += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 3; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Marks expired listings and unpicked-up/unaccepted claims whose windows have passed.
 */
export function runAutoExpirySweep(): string[] {
  const nowIso = new Date().toISOString();
  const expiredListings = db
    .prepare(`SELECT id FROM listings WHERE status = 'active' AND pickup_end <= ?`)
    .all(nowIso) as { id: string }[];

  if (expiredListings.length > 0) {
    db.prepare(`UPDATE listings SET status = 'expired' WHERE status = 'active' AND pickup_end <= ?`).run(
      nowIso
    );
    db.prepare(
      `UPDATE claims SET status = 'expired' WHERE status = 'requested' AND listing_id IN (SELECT id FROM listings WHERE status = 'expired')`
    ).run();
  }

  // Auto-release accepted claims past pickup_end + 30 minutes (no-show protection)
  const graceCutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  db.prepare(
    `UPDATE claims SET status = 'expired', cancel_reason = 'Pickup window expired (no-show auto-release)'
     WHERE status = 'accepted' AND expires_at IS NOT NULL AND expires_at <= ?`
  ).run(graceCutoff);

  return expiredListings.map((r) => r.id);
}

function dateDaysOffset(daysFromToday: number): string {
  const d = new Date(Date.now() + daysFromToday * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function ensureExtendedCommunityData() {
  const now = new Date().toISOString();

  // 1. Seed & sync 14 Clients & Partners across all 7 categories
  const partnersSeed = [
    {
      id: 'part_1',
      name: 'Saffron Kitchen',
      nameBn: 'স্যাফরন কিচেন',
      category: 'restaurants_cafes',
      area: 'Dhanmondi',
      desc: 'Shares hot kacchi biryani boxes and lentil platters every evening before closing.',
      descBn: 'প্রতিদিন সন্ধ্যায় বন্ধের আগে গরম কাচ্চি বিরিয়ানি বক্স ও ডালের প্যাকেট শেয়ার করে।',
      logo: '/images/haji-biriyani-boxes.jpg',
      since: 2023,
      meals: 1840,
      featured: 1,
    },
    {
      id: 'part_2',
      name: 'Gulshan Fresh Bakery',
      nameBn: 'গুলশান ফ্রেশ বেকারি',
      category: 'restaurants_cafes',
      area: 'Gulshan 2',
      desc: 'Donates unsold milk buns, flaky chicken pattice, and tea loaves to local families.',
      descBn: 'অবিক্রীত মিল্ক বান, চিকেন প্যাটিস ও সকালের পাউরুটি স্থানীয় পরিবারগুলোর মাঝে বিতরণ করে।',
      logo: '/images/dhaka-bakery-bread.jpg',
      since: 2023,
      meals: 1420,
      featured: 1,
    },
    {
      id: 'part_3',
      name: 'Shahi Darbar Convention Hall',
      nameBn: 'শাহী দরবার কনভেনশন হল',
      category: 'wedding_venues',
      area: 'Banani',
      desc: 'Pledged zero-waste banquets with rapid 2-hour pickup of untouched wedding buffet trays.',
      descBn: 'অক্ষত বিয়ের বুফে ট্রে ২ ঘণ্টার মধ্যে দ্রুত সংগ্রহের মাধ্যমে জিরো-ওয়েস্ট ভোজের অঙ্গীকারবদ্ধ।',
      logo: '/images/wedding-buffet-bd.jpg',
      since: 2024,
      meals: 4650,
      featured: 1,
    },
    {
      id: 'part_4',
      name: 'Gulshan Pavilion Banquet',
      nameBn: 'গুলশান প্যাভিলিয়ন ব্যাংকুয়েট',
      category: 'wedding_venues',
      area: 'Gulshan 1',
      desc: 'Partners with volunteer cargo vans after weekend receptions to feed nearby shelters.',
      descBn: 'সাপ্তাহিক রিসেপশনের পর স্বেচ্ছাসেবক ভ্যানের মাধ্যমে আশ্রয়কেন্দ্রগুলোতে খাবার পৌঁছে দেয়।',
      logo: '/images/wedding-celebration-bd.jpg',
      since: 2024,
      meals: 3180,
      featured: 0,
    },
    {
      id: 'part_5',
      name: 'Sonargaon Grand Kitchen',
      nameBn: 'সোনারগাঁও গ্র্যান্ড কিচেন',
      category: 'hotels_catering',
      area: 'Karwan Bazar',
      desc: 'Dispatches sealed conference buffet trays from business events every weekday.',
      descBn: 'কর্মদিবসে কর্পোরেট কনফারেন্সের অব্যবহৃত বুফে ট্রে সিল করা অবস্থায় পাঠিয়ে দেয়।',
      logo: '/images/kitchen-packing-bd.jpg',
      since: 2023,
      meals: 5210,
      featured: 1,
    },
    {
      id: 'part_6',
      name: 'Crescent Event Caterers',
      nameBn: 'ক্রিসেন্ট ইভেন্ট ক্যাটারার্স',
      category: 'hotels_catering',
      area: 'Gulshan 2',
      desc: 'Provides thermal cartons of morog polao and roasted chicken from corporate luncheons.',
      descBn: 'কর্পোরেট লাঞ্চ থেকে থার্মাল কার্টুনে মোরগ পোলাও ও রোস্টেড চিকেন সরবরাহ করে।',
      logo: '/images/rice-dal-bhorta.jpg',
      since: 2024,
      meals: 2490,
      featured: 0,
    },
    {
      id: 'part_7',
      name: 'Alo Community Relief Foundation',
      nameBn: 'আলো কমিউনিটি রিলিফ ফাউন্ডেশন',
      category: 'ngos_charities',
      area: 'Mohammadpur',
      desc: 'Coordinates last-mile distribution to 180+ low-income households across West Dhaka.',
      descBn: 'পশ্চিম ঢাকার ১৮০টিরও বেশি স্বল্প-আয়ের পরিবারের মাঝে শেষ পর্যায়ের খাবার বিতরণ সমন্বয় করে।',
      logo: '/images/community-distribution-bd.jpg',
      since: 2022,
      meals: 6400,
      featured: 1,
    },
    {
      id: 'part_8',
      name: 'Dhaka Food Volunteers Network',
      nameBn: 'ঢাকা ফুড ভলান্টিয়ার্স নেটওয়ার্ক',
      category: 'ngos_charities',
      area: 'Banani',
      desc: 'Operates 18 cargo-bike riders rescuing late-night wedding buffets across the city.',
      descBn: 'পুরো শহরে গভীর রাতের বিয়ের বুফে খাবার উদ্ধারে ১৮টি কার্গো-বাইক রাইডার দল পরিচালনা করে।',
      logo: '/images/dhaka-rickshaws.jpg',
      since: 2023,
      meals: 5120,
      featured: 1,
    },
    {
      id: 'part_9',
      name: 'Shishu Sneho Orphanage',
      nameBn: 'শিশু স্নেহ এতিমখানা',
      category: 'orphanages_shelters',
      area: 'Mirpur 10',
      desc: 'Receives warm weekend feast trays and fresh bakery breads for 85 resident children.',
      descBn: '৮৫ জন আবাসিক শিশুর জন্য সপ্তাহান্তে গরম ভোজের ট্রে ও তাজা বেকারি রুটি গ্রহণ করে।',
      logo: '/images/bhuna-khichuri.jpg',
      since: 2023,
      meals: 3940,
      featured: 0,
    },
    {
      id: 'part_10',
      name: 'Probashi Night Shelter Home',
      nameBn: 'প্রবাসী রাত্রিকালীন আশ্রয়কেন্দ্র',
      category: 'orphanages_shelters',
      area: 'Motijheel',
      desc: 'Serves warm dinner boxes every night to transit laborers and elderly residents.',
      descBn: 'ভ্রমণরত শ্রমিক ও প্রবীণ বাসিন্দাদের জন্য প্রতি রাতে গরম রাতের খাবারের বক্স পরিবেশন করে।',
      logo: '/images/chawkbazar-iftar.jpg',
      since: 2024,
      meals: 2870,
      featured: 0,
    },
    {
      id: 'part_11',
      name: 'Dhanmondi Lake Morning Walkers Club',
      nameBn: 'ধানমন্ডি লেক মর্নিং ওয়াকার্স ক্লাব',
      category: 'community_groups',
      area: 'Dhanmondi',
      desc: 'Sponsors monthly neighborhood community fridge refills and volunteer fuel stipends.',
      descBn: 'মাসিক পাড়ার কমিউনিটি ফ্রিজ রিফিল ও স্বেচ্ছাসেবকদের যাতায়াত খরচে সহায়তা করে।',
      logo: '/images/dhaka-canteen-shop.jpg',
      since: 2024,
      meals: 1320,
      featured: 0,
    },
    {
      id: 'part_12',
      name: 'Uttara Sector 7 Youth Circle',
      nameBn: 'উত্তরা সেক্টর ৭ ইয়ুথ সার্কেল',
      category: 'community_groups',
      area: 'Uttara',
      desc: 'Student volunteers packing and distributing weekend meal drives near rail crossings.',
      descBn: 'রেল ক্রসিংয়ের পাশে সাপ্তাহিক খাবার বিতরণ অভিযানে প্যাকিং ও বিতরণের কাজ করে।',
      logo: '/images/kawran-bazar.jpg',
      since: 2024,
      meals: 1680,
      featured: 0,
    },
    {
      id: 'part_13',
      name: 'Chowdhury & Rahman Household',
      nameBn: 'চৌধুরী ও রহমান পরিবার',
      category: 'individual_families',
      area: 'Dhanmondi',
      desc: 'Shares family milestone feast surpluses and supports monthly meal packaging funds.',
      descBn: 'পারিবারিক অনুষ্ঠানের উদ্বৃত্ত খাবার শেয়ার করে এবং মাসিক ফুড প্যাকেজিং তহবিলে সহায়তা করে।',
      logo: '/images/ilish-curry.jpg',
      since: 2024,
      meals: 420,
      featured: 0,
    },
    {
      id: 'part_14',
      name: 'Begum Rokeya Neighborhood Families',
      nameBn: 'বেগম রোকেয়া পাড়া পরিবারসমূহ',
      category: 'individual_families',
      area: 'Mirpur 10',
      desc: 'A collective of 22 local households coordinating bread pickups for elderly neighbors.',
      descBn: 'বয়স্ক প্রতিবেশীদের জন্য পাউরুটি ও খাবার সংগ্রহ সমন্বয়কারী ২২টি স্থানীয় পরিবারের একটি দল।',
      logo: '/images/bhorta-platter.jpg',
      since: 2023,
      meals: 640,
      featured: 0,
    },
  ];

  const partnerCount = (db.prepare('SELECT COUNT(*) as c FROM partners').get() as { c: number }).c;
  if (partnerCount === 0) {
    const insertPartner = db.prepare(`
      INSERT INTO partners (id, name, name_bn, category, area, description, description_bn, logo_url, since_year, meals_contributed, featured)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const p of partnersSeed) {
      insertPartner.run(
        p.id,
        p.name,
        p.nameBn,
        p.category,
        p.area,
        p.desc,
        p.descBn,
        p.logo,
        p.since,
        p.meals,
        p.featured
      );
    }
  } else {
    const syncPartner = db.prepare(`
      UPDATE partners SET name = ?, name_bn = ?, description = ?, description_bn = ?, logo_url = ? WHERE id = ?
    `);
    for (const p of partnersSeed) {
      syncPartner.run(p.name, p.nameBn, p.desc, p.descBn, p.logo, p.id);
    }
  }

  // 2. Seed & sync 4 Testimonials with real Bangladeshi portraits
  const testimonialsSeed = [
    {
      id: 'test_1',
      quote: 'We used to throw away 25 untouched biryani trays after big receptions. Now a volunteer van arrives within 45 minutes and 300 neighbors eat a warm meal.',
      quoteBn: 'বড় অনুষ্ঠানের পর আগে আমরা ২৫টি অক্ষত বিরিয়ানির ট্রে ফেলে দিতাম। এখন ৪৫ মিনিটের মধ্যে স্বেচ্ছাসেবক ভ্যান আসে এবং ৩০০ প্রতিবেশী গরম খাবার পান।',
      author: 'Tariqul Alam',
      authorBn: 'তারিকুল আলম',
      role: 'Operations Manager · Wedding Venue',
      roleBn: 'অপারেশন ম্যানেজার · কমিউনিটি সেন্টার',
      org: 'Shahi Darbar Convention Hall',
      cat: 'donor',
      avatarUrl: '/images/portrait-man-2.jpg',
    },
    {
      id: 'test_2',
      quote: 'Posting surplus milk buns, pattice, and tea loaves takes less than 20 seconds right at closing. Our staff loves knowing every fresh batch reaches a family table.',
      quoteBn: 'দোকান বন্ধের সময় উদ্বৃত্ত মিল্ক বান, প্যাটিস ও পাউরুটি পোস্ট করতে ২০ সেকেন্ডেরও কম লাগে। প্রতিটি খাবার মানুষের কাজে আসছে ভেবে আমাদের কর্মীরাও আনন্দিত।',
      author: 'Maya Sultana',
      authorBn: 'মায়া সুলতানা',
      role: 'Founder · Bakery Donor',
      roleBn: 'প্রতিষ্ঠাতা · বেকারি ডোনার',
      org: 'Gulshan Fresh Bakery',
      cat: 'donor',
      avatarUrl: '/images/portrait-woman-1.jpg',
    },
    {
      id: 'test_3',
      quote: 'Direct in-app chat and pickup codes made evening food collection effortless for our 85 children at the shelter.',
      quoteBn: 'অ্যাপের সরাসরি চ্যাট ও পিকআপ কোড আমাদের আশ্রয়কেন্দ্রের ৮৫ জন শিশুর রাতের খাবার সংগ্রহকে একদম সহজ করে দিয়েছে।',
      author: 'Rafiqul Islam',
      authorBn: 'রফিকুল ইসলাম',
      role: 'Coordinator · Community Shelter',
      roleBn: 'সমন্বয়ক · কমিউনিটি আশ্রয়কেন্দ্র',
      org: 'Alo Community Shelter',
      cat: 'recipient',
      avatarUrl: '/images/portrait-man-3.jpg',
    },
    {
      id: 'test_4',
      quote: 'Collecting morning bread bags for two elderly neighbors on my street has turned surplus food into real neighborhood care.',
      quoteBn: 'আমাদের রাস্তার দুই বয়স্ক প্রতিবেশীর জন্য সকালের রুটি সংগ্রহ করা উদ্বৃত্ত খাবারকে প্রকৃত প্রতিবেশী ভালোবাসায় পরিণত করেছে।',
      author: 'Nadia Rahman',
      authorBn: 'নাদিয়া রহমান',
      role: 'Neighborhood Volunteer',
      roleBn: 'পাড়ার স্বেচ্ছাসেবক',
      org: 'Dhanmondi Community Member',
      cat: 'recipient',
      avatarUrl: '/images/portrait-woman-2.jpg',
    },
  ];
  const testimonialCount = (db.prepare('SELECT COUNT(*) as c FROM testimonials').get() as { c: number }).c;
  if (testimonialCount === 0) {
    const insertTest = db.prepare(`
      INSERT INTO testimonials (id, quote, quote_bn, author_name, author_name_bn, role_label, role_label_bn, org_name, category, avatar_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of testimonialsSeed) {
      insertTest.run(
        item.id,
        item.quote,
        item.quoteBn,
        item.author,
        item.authorBn,
        item.role,
        item.roleBn,
        item.org,
        item.cat,
        item.avatarUrl
      );
    }
  } else {
    const syncTest = db.prepare(`
      UPDATE testimonials SET quote = ?, quote_bn = ?, org_name = ?, avatar_url = ? WHERE id = ?
    `);
    for (const item of testimonialsSeed) {
      syncTest.run(item.quote, item.quoteBn, item.org, item.avatarUrl, item.id);
    }
  }

  // 3. Seed & sync 6 Food Distribution Events (2 upcoming, 1 ongoing, 3 past)
  const IMG_DIST = '/images/community-distribution-bd.jpg';
  const IMG_PACK = '/images/kitchen-packing-bd.jpg';
  const IMG_BUFFET = '/images/wedding-buffet-bd.jpg';
  const IMG_CHAWK = '/images/chawkbazar-iftar.jpg';
  const IMG_BAKERY_EV = '/images/dhaka-bakery-bread.jpg';
  const IMG_MEAL_EV = '/images/rice-dal-bhorta.jpg';

  const eventsSeed = [
    {
      id: 'evt_1',
      title: 'Dhanmondi Weekend Hot Meal & Produce Drive',
      titleBn: 'ধানমন্ডি সাপ্তাহিক গরম খাবার ও সবজি বিতরণ',
      desc: 'Community meal box packing and open courtyard distribution in partnership with Saffron Kitchen and Alo Foundation. Warm rice bowls, lentils, and fresh vegetables for local working families.',
      descBn: 'স্যাফরন কিচেন ও আলো ফাউন্ডেশনের যৌথ উদ্যোগে গরম খাবারের বক্স প্যাকিং ও খোলা প্রাঙ্গণে বিতরণ। শ্রমজীবী পরিবারগুলোর জন্য খিচুড়ি, ডাল ও তাজা সবজি।',
      org: 'Alo Community Relief Foundation & Saffron Kitchen',
      orgBn: 'আলো কমিউনিটি রিলিফ ফাউন্ডেশন ও স্যাফরন কিচেন',
      area: 'Dhanmondi',
      loc: 'Rabindra Sarobar Courtyard, Dhanmondi 8, Dhaka',
      lat: 23.7465,
      lng: 90.376,
      date: dateDaysOffset(3),
      start: '16:00',
      end: '19:30',
      schedule: [
        { time: '16:00', activity: 'Kitchen crates arrive & hygiene station setup', activityBn: 'খাবারের ক্রেট পৌঁছানো ও হাইজিন স্টেশন প্রস্তুতি' },
        { time: '16:30', activity: 'Eco box packing & allergen labeling', activityBn: 'ইকো বক্স প্যাকিং ও অ্যালার্জেন লেবেলিং' },
        { time: '17:15', activity: 'Community meal distribution opens', activityBn: 'সবার মাঝে খাবার বিতরণ শুরু' },
        { time: '19:00', activity: 'Closing cleanup & leftovers sent to night shelter', activityBn: 'পরিচ্ছন্নতা ও অবশিষ্ট খাবার রাত্রিকালীন আশ্রয়ে প্রেরণ' },
      ],
      expected: 450,
      actual: null,
      helped: null,
      vols: 18,
      banner: IMG_DIST,
      gallery: [IMG_DIST, '/images/bhuna-khichuri.jpg', IMG_MEAL_EV],
      help: 'Join as a packing or distribution volunteer, bring reusable bags, or sponsor meal cartons.',
      helpBn: 'প্যাকিং বা বিতরণ স্বেচ্ছাসেবক হিসেবে যোগ দিন, পুনর্ব্যবহারযোগ্য ব্যাগ আনুন অথবা খাবারের কার্টন স্পনসর করুন।',
      status: 'upcoming',
    },
    {
      id: 'evt_2',
      title: 'Uttara Family Bakery & Breakfast Basket Pop-Up',
      titleBn: 'উত্তরা পারিবারিক বেকারি ও সকালের ঝুড়ি ক্যাম্প',
      desc: 'Morning distribution of fresh milk buns, ruti, fruit packs, and sealed breakfast boxes gathered from Gulshan and Uttara partner bakeries.',
      descBn: 'গুলশান ও উত্তরার অংশীদার বেকারি থেকে সংগৃহীত মিল্ক বান, রুটি, ফলের প্যাক ও সকালের খাবারের বক্স বিতরণ কার্যক্রম।',
      org: 'Uttara Sector 7 Youth Circle',
      orgBn: 'উত্তরা সেক্টর ৭ ইয়ুথ সার্কেল',
      area: 'Uttara',
      loc: 'Sector 7 Park Gate, Lake Drive Road, Uttara, Dhaka',
      lat: 23.8682,
      lng: 90.3987,
      date: dateDaysOffset(7),
      start: '08:30',
      end: '11:30',
      schedule: [
        { time: '08:30', activity: 'Bakery crates sorted by family size', activityBn: 'পরিবারের আকার অনুযায়ী বেকারি ক্রেট সাজানো' },
        { time: '09:15', activity: 'Distribution to senior citizens & families', activityBn: 'প্রবীণ ও পরিবারগুলোর মাঝে বিতরণ' },
        { time: '11:15', activity: 'Final inventory check & wrap-up', activityBn: 'চূড়ান্ত হিসাব ও সমাপ্তি' },
      ],
      expected: 320,
      actual: null,
      helped: null,
      vols: 12,
      banner: IMG_BAKERY_EV,
      gallery: [IMG_BAKERY_EV, '/images/singara-snacks.jpg'],
      help: 'Help sort bread bags, guide queues smoothly, or volunteer with a scooter/bicycle.',
      helpBn: 'রুটির ব্যাগ সাজাতে সাহায্য করুন, লাইন পরিচালনা করুন অথবা সাইকেল/স্কুটারে ডেলিভারি দিন।',
      status: 'upcoming',
    },
    {
      id: 'evt_3',
      title: 'Live Today: Banani-Karwan Bazar Midday Kitchen Dispatch',
      titleBn: 'আজকের চলমান উদ্যোগ: বনানী-কারওয়ান বাজার কিচেন ডিসপ্যাচ',
      desc: 'Ongoing real-time kitchen packing and cargo van dispatch rescuing conference hotel trays and distributing warm lunch packs across three city shelters.',
      descBn: 'হোটেল কনফারেন্সের খাবার উদ্ধার করে তিনটি আশ্রয়কেন্দ্রে গরম দুপুরের খাবার পাঠানোর চলমান কিচেন প্যাকিং ও ভ্যান ডিসপ্যাচ।',
      org: 'Dhaka Food Volunteers Network',
      orgBn: 'ঢাকা ফুড ভলান্টিয়ার্স নেটওয়ার্ক',
      area: 'Banani',
      loc: 'Road 11 Community Hub, Block F, Banani, Dhaka',
      lat: 23.7937,
      lng: 90.4066,
      date: dateDaysOffset(0),
      start: '12:00',
      end: '17:00',
      schedule: [
        { time: '12:00', activity: 'Hotel banquet trays checked & temperature-logged', activityBn: 'হোটেলের ট্রে পরীক্ষা ও তাপমাত্রা যাচাই' },
        { time: '13:30', activity: 'Portioning into 500 eco meal boxes', activityBn: '৫০০টি ইকো বক্সে খাবার প্যাকিং' },
        { time: '15:00', activity: 'Van dispatch to Motijheel & Mirpur shelters', activityBn: 'মতিঝিল ও মিরপুর আশ্রয়কেন্দ্রে ভ্যান প্রেরণ' },
      ],
      expected: 500,
      actual: null,
      helped: null,
      vols: 15,
      banner: IMG_PACK,
      gallery: [IMG_PACK, '/images/kacchi-biryani.jpg'],
      help: 'Extra packing hands welcome right now at Banani Community Hub; wear closed shoes.',
      helpBn: 'বনানী কমিউনিটি হাবে এখনই প্যাকিং স্বেচ্ছাসেবক হিসেবে যোগ দিতে পারেন।',
      status: 'ongoing',
    },
    {
      id: 'evt_4',
      title: 'Mirpur Shishu Sneho Warm Feast & Sweets Day',
      titleBn: 'মিরপুর শিশু স্নেহ উষ্ণ ভোজ ও মিষ্টি উৎসব',
      desc: 'Rescued festive reception trays from Gulshan Pavilion served warmly to orphanage children and neighborhood elders.',
      descBn: 'গুলশান প্যাভিলিয়ন থেকে সংগৃহীত উৎসবের খাবার এতিমখানার শিশু ও পাড়ার প্রবীণদের মাঝে পরিবেশন করা হয়।',
      org: 'Shishu Sneho Orphanage & Gulshan Pavilion',
      orgBn: 'শিশু স্নেহ এতিমখানা ও গুলশান প্যাভিলিয়ন',
      area: 'Mirpur 10',
      loc: 'Begum Rokeya Sarani, Mirpur 10, Dhaka',
      lat: 23.8069,
      lng: 90.3687,
      date: dateDaysOffset(-6),
      start: '17:30',
      end: '20:30',
      schedule: [
        { time: '17:30', activity: 'Thermal insulated arrival from Gulshan', activityBn: 'গুলশান থেকে থার্মাল বক্সে খাবার আগমন' },
        { time: '18:15', activity: 'Children dinner service & dessert trays', activityBn: 'শিশুদের রাতের খাবার ও মিষ্টি পরিবেশন' },
      ],
      expected: 380,
      actual: 412,
      helped: 390,
      vols: 14,
      banner: IMG_BUFFET,
      gallery: [IMG_BUFFET, '/images/roshogolla-sweets.jpg', IMG_DIST],
      help: 'Completed event — browse outcomes and photos.',
      helpBn: 'সম্পন্ন ইভেন্ট — ফলাফল ও ছবিগুলো দেখুন।',
      status: 'past',
    },
    {
      id: 'evt_5',
      title: 'Motijheel Night Transit Workers Dinner Drive',
      titleBn: 'মতিঝিল রাত্রিকালীন শ্রমজীবী মানুষের রাতের খাবার',
      desc: 'Packed 600+ tehari and lentil curry boxes with local donors for rickshaw pullers, security guards, and transit workers.',
      descBn: 'রিকশাচালক, নিরাপত্তাকর্মী ও শ্রমজীবীদের জন্য ৬০০+ তেহারি ও ডালের বক্স বিতরণ করা হয়েছে।',
      org: 'Probashi Night Shelter Home',
      orgBn: 'প্রবাসী রাত্রিকালীন আশ্রয়কেন্দ্র',
      area: 'Motijheel',
      loc: 'Dilkusha C/A Square, Motijheel, Dhaka',
      lat: 23.7279,
      lng: 90.4184,
      date: dateDaysOffset(-14),
      start: '20:00',
      end: '22:30',
      schedule: [
        { time: '20:00', activity: 'Meal box staging at Dilkusha courtyard', activityBn: 'দিলকুশা চত্বরে খাবারের বক্স সাজানো' },
        { time: '20:45', activity: 'Distribution across bus stands & shelter', activityBn: 'বাসস্ট্যান্ড ও আশ্রয়কেন্দ্রে বিতরণ' },
      ],
      expected: 550,
      actual: 618,
      helped: 595,
      vols: 20,
      banner: IMG_CHAWK,
      gallery: [IMG_CHAWK, '/images/tehari-plate.jpg'],
      help: 'Completed event — browse outcomes and photos.',
      helpBn: 'সম্পন্ন ইভেন্ট — ফলাফল ও ছবিগুলো দেখুন।',
      status: 'past',
    },
    {
      id: 'evt_6',
      title: 'Mohammadpur Zero-Waste Community Kitchen Day',
      titleBn: 'মোহাম্মদপুর জিরো-ওয়েস্ট কমিউনিটি কিচেন দিবস',
      desc: 'Turned rescued farm produce, flatbreads, and hotel catering trays into 490 nutritious evening family packs.',
      descBn: 'উদ্ধার করা তাজা সবজি, রুটি ও ক্যাটারিং খাবার থেকে ৪৯০টি পুষ্টিকর পারিবারিক রাতের খাবারের প্যাক তৈরি ও বিতরণ।',
      org: 'Alo Community Relief Foundation',
      orgBn: 'আলো কমিউনিটি রিলিফ ফাউন্ডেশন',
      area: 'Mohammadpur',
      loc: 'Tajmahal Road Community Center, Mohammadpur, Dhaka',
      lat: 23.7654,
      lng: 90.3621,
      date: dateDaysOffset(-21),
      start: '15:00',
      end: '19:00',
      schedule: [
        { time: '15:00', activity: 'Produce sorting & kitchen prep', activityBn: 'সবজি বাছাই ও রান্নাঘরের প্রস্তুতি' },
        { time: '17:00', activity: 'Family pack distribution', activityBn: 'পারিবারিক প্যাক বিতরণ' },
      ],
      expected: 450,
      actual: 492,
      helped: 460,
      vols: 16,
      banner: IMG_MEAL_EV,
      gallery: [IMG_MEAL_EV, '/images/dhaka-vegetables.jpg', IMG_DIST],
      help: 'Completed event — browse outcomes and photos.',
      helpBn: 'সম্পন্ন ইভেন্ট — ফলাফল ও ছবিগুলো দেখুন।',
      status: 'past',
    },
  ];

  const eventCount = (db.prepare('SELECT COUNT(*) as c FROM events').get() as { c: number }).c;
  if (eventCount === 0) {
    const insertEvent = db.prepare(`
      INSERT INTO events (
        id, title, title_bn, description, description_bn, organizer, organizer_bn, area, location_name,
        lat, lng, event_date, start_time, end_time, schedule_json, expected_meals, actual_meals_served,
        people_helped, volunteers_needed, banner_url, gallery_urls_json, how_to_help, how_to_help_bn,
        status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const ev of eventsSeed) {
      insertEvent.run(
        ev.id,
        ev.title,
        ev.titleBn,
        ev.desc,
        ev.descBn,
        ev.org,
        ev.orgBn,
        ev.area,
        ev.loc,
        ev.lat,
        ev.lng,
        ev.date,
        ev.start,
        ev.end,
        JSON.stringify(ev.schedule),
        ev.expected,
        ev.actual,
        ev.helped,
        ev.vols,
        ev.banner,
        JSON.stringify(ev.gallery),
        ev.help,
        ev.helpBn,
        ev.status,
        'admin_1',
        now
      );
    }

    // Seed sample volunteer registrations so roster + attendance panel are rich from turn 1
    const insertReg = db.prepare(`
      INSERT OR IGNORE INTO event_registrations (
        id, event_id, user_id, name, phone, availability, preferred_role, attendance_status, reminder_enabled, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertReg.run('ereg_1', 'evt_1', 'recip_3', 'Tariq Hasan', '+8801922-304050', '4:00 PM - 7:30 PM', 'transport', 'registered', 1, now);
    insertReg.run('ereg_2', 'evt_1', 'recip_2', 'Rafiqul Islam', '+8801822-203040', '4:30 PM - 7:30 PM', 'distribution', 'registered', 1, now);
    insertReg.run('ereg_3', 'evt_3', 'recip_3', 'Tariq Hasan', '+8801922-304050', '12:00 PM - 5:00 PM', 'transport', 'present', 1, now);
    insertReg.run('ereg_4', 'evt_4', 'recip_1', 'Nadia Rahman', '+8801722-102030', '5:30 PM - 8:30 PM', 'packing', 'present', 1, now);
    insertReg.run('ereg_5', 'evt_4', 'recip_5', 'Sajib Ahmed', '+8801522-506070', '5:30 PM - 8:30 PM', 'distribution', 'present', 1, now);
  } else {
    const syncEvent = db.prepare(`
      UPDATE events SET description = ?, description_bn = ?, banner_url = ?, gallery_urls_json = ? WHERE id = ?
    `);
    for (const ev of eventsSeed) {
      syncEvent.run(ev.desc, ev.descBn, ev.banner, JSON.stringify(ev.gallery), ev.id);
    }
    db.prepare(
      `UPDATE events SET banner_url = '/images/community-distribution-bd.jpg' WHERE banner_url LIKE '%/src/assets/images/%'`
    ).run();
  }

  // 4. Seed & sync 5 Wedding & Buffet Leftover Collection Requests across all 5 statuses
  const IMG_WED_BUFFET = '/images/wedding-buffet-bd.jpg';
  const IMG_WED_CELEB = '/images/wedding-celebration-bd.jpg';
  const IMG_WED_COOKED = '/images/kacchi-biryani.jpg';
  const IMG_WED_POLAO = '/images/morog-polao.jpg';
  const IMG_WED_DIST = '/images/community-distribution-bd.jpg';

  const weddingsSeed = [
    {
      id: 'wed_1',
      donorId: 'donor_12',
      eventType: 'wedding',
      venue: 'Shahi Darbar Convention Hall',
      address: 'Road 11, Block H, Banani, Dhaka',
      lat: 23.7942,
      lng: 90.4055,
      contact: 'Tariqul Alam',
      phone: '+8801799-887744',
      date: dateDaysOffset(0),
      ready: '22:15',
      servings: 240,
      foods: ['rice', 'curry', 'meat', 'sweets'],
      halal: 1,
      veg: 0,
      storage: 'covered_hot',
      photos: [IMG_WED_BUFFET],
      notes: 'Use rear catering elevator Gate 3. Unused chafing pans are untouched.',
      urgent: 1,
      status: 'submitted',
      volId: null,
      volName: null,
      ngoId: null,
      ngoName: null,
      convId: null,
      delPhoto: null,
      delMeals: null,
      delNote: null,
      createdMinAgo: 18,
    },
    {
      id: 'wed_2',
      donorId: 'donor_1',
      eventType: 'reception',
      venue: 'Dhanmondi Heritage Banquet',
      address: 'House 42, Road 27, Dhanmondi, Dhaka',
      lat: 23.7511,
      lng: 90.3765,
      contact: 'Arif Chowdhury',
      phone: '+8801711-223344',
      date: dateDaysOffset(0),
      ready: '21:30',
      servings: 160,
      foods: ['rice', 'curry', 'bread', 'sweets'],
      halal: 1,
      veg: 0,
      storage: 'covered_hot',
      photos: [IMG_WED_COOKED],
      notes: 'Kacchi biryani & chicken roast sealed in 8 stainless steel cambros.',
      urgent: 1,
      status: 'volunteer_assigned',
      volId: 'recip_3',
      volName: 'Tariq Hasan (Dhaka Food Volunteers)',
      ngoId: 'recip_2',
      ngoName: 'Alo Community Shelter',
      convId: 'conv_2',
      delPhoto: null,
      delMeals: null,
      delNote: null,
      createdMinAgo: 55,
    },
    {
      id: 'wed_3',
      donorId: 'donor_10',
      eventType: 'corporate',
      venue: 'Sonargaon Grand Ballroom',
      address: '107 Kazi Nazrul Islam Ave, Karwan Bazar, Dhaka',
      lat: 23.7495,
      lng: 90.3941,
      contact: 'Chef Imran Kabir',
      phone: '+8801715-660011',
      date: dateDaysOffset(0),
      ready: '16:00',
      servings: 180,
      foods: ['rice', 'curry', 'drinks', 'snacks'],
      halal: 1,
      veg: 1,
      storage: 'sealed_containers',
      photos: [IMG_WED_CELEB],
      notes: 'Cargo van pickup at service entrance Gate B; security notified.',
      urgent: 0,
      status: 'on_the_way',
      volId: 'recip_3',
      volName: 'Tariq Hasan (Cargo Van #2)',
      ngoId: 'recip_5',
      ngoName: 'Mirpur Youth Aid',
      convId: null,
      delPhoto: null,
      delMeals: null,
      delNote: null,
      createdMinAgo: 95,
    },
    {
      id: 'wed_4',
      donorId: 'donor_12',
      eventType: 'buffet',
      venue: 'Gulshan Pavilion Banquet',
      address: 'Road 23, Gulshan 1, Dhaka',
      lat: 23.7808,
      lng: 90.4167,
      contact: 'Zara Chowdhury',
      phone: '+8801799-887744',
      date: dateDaysOffset(0),
      ready: '15:00',
      servings: 130,
      foods: ['rice', 'meat', 'sweets'],
      halal: 1,
      veg: 0,
      storage: 'covered_hot',
      photos: [IMG_WED_POLAO],
      notes: 'Dispatched inside thermal crates toward Mirpur orphanage.',
      urgent: 0,
      status: 'collected',
      volId: 'recip_5',
      volName: 'Sajib Ahmed',
      ngoId: 'recip_5',
      ngoName: 'Shishu Sneho Orphanage',
      convId: null,
      delPhoto: null,
      delMeals: null,
      delNote: null,
      createdMinAgo: 150,
    },
    {
      id: 'wed_5',
      donorId: 'donor_10',
      eventType: 'wedding',
      venue: 'Lakefront Regency Hall',
      address: 'Lake Drive Road, Uttara Sector 7, Dhaka',
      lat: 23.8682,
      lng: 90.3987,
      contact: 'Chef Imran Kabir',
      phone: '+8801715-660011',
      date: dateDaysOffset(-2),
      ready: '22:00',
      servings: 300,
      foods: ['rice', 'curry', 'meat', 'sweets', 'bread'],
      halal: 1,
      veg: 0,
      storage: 'covered_hot',
      photos: [IMG_WED_BUFFET],
      notes: 'Full wedding buffet surplus safely packed within 60 minutes.',
      urgent: 0,
      status: 'delivered',
      volId: 'recip_3',
      volName: 'Tariq Hasan',
      ngoId: 'recip_2',
      ngoName: 'Alo Community Shelter',
      convId: null,
      delPhoto: IMG_WED_DIST,
      delMeals: 312,
      delNote: 'Delivered hot to 312 residents & night shelter families across Mohammadpur. Every tray enjoyed!',
      createdMinAgo: 2880,
    },
  ];

  const weddingCount = (db.prepare('SELECT COUNT(*) as c FROM wedding_pickups').get() as { c: number }).c;
  if (weddingCount === 0) {
    const insertWedding = db.prepare(`
      INSERT INTO wedding_pickups (
        id, donor_id, event_type, venue_name, address, lat, lng, contact_person, phone,
        event_date, ready_time, approx_servings, food_types_json, is_halal, is_veg,
        storage_method, photo_urls_json, special_notes, is_urgent,
        checklist_untouched, checklist_covered, checklist_fresh, status,
        volunteer_id, volunteer_name, ngo_claimer_id, ngo_name, conversation_id,
        delivery_photo_url, delivered_meals, delivery_note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const w of weddingsSeed) {
      const ts = isoOffset(-w.createdMinAgo);
      insertWedding.run(
        w.id,
        w.donorId,
        w.eventType,
        w.venue,
        w.address,
        w.lat,
        w.lng,
        w.contact,
        w.phone,
        w.date,
        w.ready,
        w.servings,
        JSON.stringify(w.foods),
        w.halal,
        w.veg,
        w.storage,
        JSON.stringify(w.photos),
        w.notes,
        w.urgent,
        w.status,
        w.volId,
        w.volName,
        w.ngoId,
        w.ngoName,
        w.convId,
        w.delPhoto,
        w.delMeals,
        w.delNote,
        ts,
        ts
      );
    }
  } else {
    const syncWedding = db.prepare(`
      UPDATE wedding_pickups SET photo_urls_json = ?, delivery_photo_url = COALESCE(?, delivery_photo_url) WHERE id = ?
    `);
    for (const w of weddingsSeed) {
      syncWedding.run(JSON.stringify(w.photos), w.delPhoto, w.id);
    }
    db.prepare(
      `UPDATE wedding_pickups SET photo_urls_json = '["/images/wedding-buffet-bd.jpg"]' WHERE photo_urls_json LIKE '%/src/assets/images/%'`
    ).run();
    db.prepare(
      `UPDATE wedding_pickups SET delivery_photo_url = '/images/community-distribution-bd.jpg' WHERE delivery_photo_url LIKE '%/src/assets/images/%'`
    ).run();
  }

  // 5. Seed & sync 8 Money Donations so Campaign Goal Progress & Recent Donors are live
  const donationsSeed = [
    { id: 'don_1', userId: 'donor_1', name: 'Saffron Kitchen', amt: 15000, freq: 'monthly', cause: 'general', ev: null, method: 'bank_transfer', anon: 0, honor: null, code: 'AF-DON-8412', minAgo: 4200 },
    { id: 'don_2', userId: 'recip_1', name: 'Nadia Rahman', amt: 1000, freq: 'one_time', cause: 'events', ev: 'evt_1', method: 'bkash', anon: 0, honor: null, code: 'AF-DON-8419', minAgo: 3100 },
    { id: 'don_3', userId: null, name: 'Tariqul Alam', amt: 5000, freq: 'one_time', cause: 'wedding_pickup', ev: null, method: 'nagad', anon: 0, honor: 'In memory of late father', code: 'AF-DON-8425', minAgo: 2100 },
    { id: 'don_4', userId: 'donor_2', name: 'Gulshan Fresh Bakery', amt: 10000, freq: 'monthly', cause: 'general', ev: null, method: 'card_sandbox', anon: 0, honor: null, code: 'AF-DON-8431', minAgo: 1500 },
    { id: 'don_5', userId: null, name: 'Farhana Karim', amt: 2500, freq: 'one_time', cause: 'events', ev: 'evt_2', method: 'bkash', anon: 1, honor: null, code: 'AF-DON-8440', minAgo: 920 },
    { id: 'don_6', userId: 'donor_10', name: 'Sonargaon Grand Kitchen', amt: 25000, freq: 'one_time', cause: 'wedding_pickup', ev: null, method: 'bank_transfer', anon: 0, honor: 'Hospitality Zero-Waste Pledge', code: 'AF-DON-8452', minAgo: 480 },
    { id: 'don_7', userId: 'recip_3', name: 'Tariq Hasan', amt: 500, freq: 'monthly', cause: 'platform', ev: null, method: 'rocket', anon: 0, honor: null, code: 'AF-DON-8466', minAgo: 180 },
    { id: 'don_8', userId: 'donor_3', name: 'Krishi Fresh Co-op', amt: 5000, freq: 'one_time', cause: 'general', ev: null, method: 'bkash', anon: 0, honor: null, code: 'AF-DON-8473', minAgo: 45 },
  ];

  const donationCount = (db.prepare('SELECT COUNT(*) as c FROM donations').get() as { c: number }).c;
  if (donationCount === 0) {
    const insertDonation = db.prepare(`
      INSERT INTO donations (
        id, user_id, donor_display_name, amount_bdt, frequency, cause, event_id,
        payment_method, is_anonymous, honor_of, receipt_code, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
    `);

    for (const d of donationsSeed) {
      insertDonation.run(
        d.id,
        d.userId,
        d.name,
        d.amt,
        d.freq,
        d.cause,
        d.ev,
        d.method,
        d.anon,
        d.honor,
        d.code,
        isoOffset(-d.minAgo)
      );
    }
  } else {
    const syncDon = db.prepare(`UPDATE donations SET donor_display_name = ?, receipt_code = ? WHERE id = ?`);
    for (const d of donationsSeed) {
      syncDon.run(d.name, d.code, d.id);
    }
    db.prepare(`UPDATE donations SET receipt_code = REPLACE(receipt_code, 'NL-DON-', 'AF-DON-') WHERE receipt_code LIKE 'NL-DON-%'`).run();
  }

  // Backfill location_name_bn & address_bn for seeded events & weddings in pre-existing DBs
  const eventLocBnMap: Record<string, string> = {
    evt_1: 'রবীন্দ্র সরোবর প্রাঙ্গণ, ধানমন্ডি ৮, ঢাকা',
    evt_2: 'সেক্টর ৭ পার্ক গেট, লেক ড্রাইভ রোড, উত্তরা, ঢাকা',
    evt_3: 'রোড ১১ কমিউনিটি হাব, ব্লক এফ, বনানী, ঢাকা',
    evt_4: 'বেগম রোকেয়া সরণি, মিরপুর ১০, ঢাকা',
    evt_5: 'দিলকুশা বা/এ চত্বর, মতিঝিল, ঢাকা',
    evt_6: 'তাজমহল রোড কমিউনিটি সেন্টার, মোহাম্মদপুর, ঢাকা',
  };
  const updEventBn = db.prepare(
    "UPDATE events SET location_name_bn = ? WHERE id = ? AND (location_name_bn IS NULL OR location_name_bn = '')"
  );
  for (const [evId, locBn] of Object.entries(eventLocBnMap)) {
    updEventBn.run(locBn, evId);
  }

  const weddingAddrBnMap: Record<string, string> = {
    wed_1: 'রোড ১১, ব্লক এইচ, বনানী, ঢাকা',
    wed_2: 'বাড়ি ৪২, রোড ২৭, ধানমন্ডি, ঢাকা',
    wed_3: '১০৭ কাজী নজরুল ইসলাম এভিনিউ, কারওয়ান বাজার, ঢাকা',
    wed_4: 'রোড ২৩, গুলশান ১, ঢাকা',
    wed_5: 'লেক ড্রাইভ রোড, উত্তরা সেক্টর ৭, ঢাকা',
  };
  const updWeddingBn = db.prepare(
    "UPDATE wedding_pickups SET address_bn = ? WHERE id = ? AND (address_bn IS NULL OR address_bn = '')"
  );
  for (const [wId, addrBn] of Object.entries(weddingAddrBnMap)) {
    updWeddingBn.run(addrBn, wId);
  }

  // Flag urgent Flash Rescue & Ramadan Iftar / Sehri batches idempotently
  db.prepare(
    `UPDATE listings SET is_flash_rescue = 1, storage_method = 'covered_hot', is_ramadan_special = 1 WHERE id IN ('list_1', 'list_4', 'list_8', 'list_13', 'list_18')`
  ).run();
  db.prepare(
    `UPDATE listings SET storage_method = 'covered_chilled' WHERE id IN ('list_10', 'list_17')`
  ).run();
  db.prepare(
    `UPDATE listings SET storage_method = 'sealed_dry' WHERE id IN ('list_2', 'list_6')`
  ).run();
  db.prepare(
    `UPDATE listings SET pickup_end = ? WHERE id = 'list_1' AND pickup_end > ?`
  ).run(isoOffset(48), isoOffset(65));
  db.prepare(
    `UPDATE listings SET pickup_end = ? WHERE id = 'list_4' AND pickup_end > ?`
  ).run(isoOffset(38), isoOffset(65));
  db.prepare(
    `UPDATE listings SET pickup_end = ? WHERE id = 'list_8' AND pickup_end > ?`
  ).run(isoOffset(55), isoOffset(65));

  // Seed initial verified donor pickup reviews so ratings appear cleanly across listings and shop profiles
  const reviewCount = (db.prepare('SELECT COUNT(*) as c FROM donor_reviews').get() as { c: number }).c;
  if (reviewCount === 0) {
    const insertReview = db.prepare(`
      INSERT OR IGNORE INTO donor_reviews (id, claim_id, donor_id, recipient_id, rating, hygiene_ok, comment, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `);
    const seedReviews = [
      { id: 'rev_1', claimId: 'seed_claim_rev_1', donorId: 'donor_1', recipId: 'recip_2', rating: 5, comment: 'Kacchi boxes arrived piping hot and neatly sealed. Volunteer handover took 2 minutes.', minAgo: 1800 },
      { id: 'rev_2', claimId: 'seed_claim_rev_2', donorId: 'donor_1', recipId: 'recip_3', rating: 5, comment: 'Clean kitchen counter and accurate box count every evening.', minAgo: 960 },
      { id: 'rev_3', claimId: 'seed_claim_rev_3', donorId: 'donor_2', recipId: 'recip_1', rating: 5, comment: 'Fresh milk buns and pattice packed separately with zero crushing.', minAgo: 1440 },
      { id: 'rev_4', claimId: 'seed_claim_rev_4', donorId: 'donor_3', recipId: 'recip_4', rating: 5, comment: 'Crisp vegetables and sweet Rajshahi mangoes sorted neatly into crates.', minAgo: 2100 },
      { id: 'rev_5', claimId: 'seed_claim_rev_5', donorId: 'donor_4', recipId: 'recip_3', rating: 4, comment: 'Generous tehari portions, easy pickup outside Uttara café.', minAgo: 720 },
      { id: 'rev_6', claimId: 'seed_claim_rev_6', donorId: 'donor_7', recipId: 'recip_5', rating: 5, comment: 'Warm kabab and paratha wraps labeled Halal and ready before Maghrib.', minAgo: 540 },
      { id: 'rev_7', claimId: 'seed_claim_rev_7', donorId: 'donor_10', recipId: 'recip_2', rating: 5, comment: 'Banquet trays temperature-checked and ready for shelter distribution.', minAgo: 400 },
    ];
    for (const r of seedReviews) {
      insertReview.run(r.id, r.claimId, r.donorId, r.recipId, r.rating, r.comment, isoOffset(-r.minAgo));
    }
  }

  // Seed Volunteer Hub Shifts (with Dhaka areas, roles & Ramadan/community shifts)
  const shiftCount = (db.prepare('SELECT COUNT(*) as c FROM volunteer_shifts').get() as { c: number }).c;
  if (shiftCount === 0) {
    const insertShift = db.prepare(`
      INSERT INTO volunteer_shifts (
        id, title, title_bn, area, location_name, location_name_bn, role, shift_date, start_time, end_time, slots_total, event_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin_1', ?)
    `);
    const shiftsSeed = [
      {
        id: 'shift_1',
        title: 'Dhanmondi Evening Hot Meal Packing',
        titleBn: 'ধানমন্ডি সন্ধ্যা গরম খাবার প্যাকিং',
        area: 'Dhanmondi',
        loc: 'Rabindra Sarobar Courtyard, Dhanmondi 8',
        locBn: 'রবীন্দ্র সরোবর প্রাঙ্গণ, ধানমন্ডি ৮',
        role: 'packing',
        date: dateDaysOffset(0),
        start: '16:30',
        end: '18:30',
        slots: 8,
        eventId: 'evt_1',
      },
      {
        id: 'shift_2',
        title: 'Iftar Pack & Chawkbazar Distribution Crew',
        titleBn: 'ইফতার প্যাক ও চকবাজার বিতরণ দল',
        area: 'Mohammadpur',
        loc: 'Tajmahal Road Community Center, Mohammadpur',
        locBn: 'তাজমহল রোড কমিউনিটি সেন্টার, মোহাম্মদপুর',
        role: 'distribution',
        date: dateDaysOffset(1),
        start: '15:30',
        end: '18:15',
        slots: 10,
        eventId: 'evt_6',
      },
      {
        id: 'shift_3',
        title: 'Uttara Wedding Buffet Cold-Van Pickup',
        titleBn: 'উত্তরা বিয়ের খাবার কোল্ড-ভ্যান সংগ্রহ',
        area: 'Uttara',
        loc: 'Sector 7 Park Gate, Lake Drive Road',
        locBn: 'সেক্টর ৭ পার্ক গেট, লেক ড্রাইভ রোড',
        role: 'transport',
        date: dateDaysOffset(1),
        start: '21:00',
        end: '23:00',
        slots: 4,
        eventId: 'evt_2',
      },
      {
        id: 'shift_4',
        title: 'Banani Bakery & Produce Sorting',
        titleBn: 'বানানী বেকারি ও সবজি বাছাই শিফট',
        area: 'Banani',
        loc: 'Road 11 Community Hub, Block F, Banani',
        locBn: 'রোড ১১ কমিউনিটি হাব, ব্লক এফ, বনানী',
        role: 'packing',
        date: dateDaysOffset(2),
        start: '09:30',
        end: '12:00',
        slots: 6,
        eventId: 'evt_3',
      },
      {
        id: 'shift_5',
        title: 'Mirpur Morning Khichuri Cooking Prep',
        titleBn: 'মিরপুর সকালের খিচুড়ি রান্না প্রস্তুতি',
        area: 'Mirpur 10',
        loc: 'Begum Rokeya Sarani Kitchen Hub, Mirpur 10',
        locBn: 'বেগম রোকেয়া সরণি কিচেন হাব, মিরপুর ১০',
        role: 'cooking',
        date: dateDaysOffset(3),
        start: '08:00',
        end: '11:00',
        slots: 6,
        eventId: 'evt_4',
      },
      {
        id: 'shift_6',
        title: 'Motijheel Office Lunch Surplus Runner',
        titleBn: 'মতিঝিল অফিস দুপুরের খাবার সংগ্রহ রানার',
        area: 'Motijheel',
        loc: 'Dilkusha C/A Square, Motijheel',
        locBn: 'দিলকুশা বা/এ চত্বর, মতিঝিল',
        role: 'transport',
        date: dateDaysOffset(4),
        start: '14:30',
        end: '16:30',
        slots: 5,
        eventId: 'evt_5',
      },
    ];
    for (const s of shiftsSeed) {
      insertShift.run(
        s.id,
        s.title,
        s.titleBn,
        s.area,
        s.loc,
        s.locBn,
        s.role,
        s.date,
        s.start,
        s.end,
        s.slots,
        s.eventId,
        isoOffset(-120)
      );
    }

    const insertSignup = db.prepare(`
      INSERT OR IGNORE INTO shift_signups (id, shift_id, user_id, name, phone, status, hours_logged, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertSignup.run('ss_1', 'shift_1', 'recip_3', 'Tariq Hasan', '+8801922-304050', 'completed', 4.5, isoOffset(-1440));
    insertSignup.run('ss_2', 'shift_2', 'recip_3', 'Tariq Hasan', '+8801922-304050', 'signed_up', 0, isoOffset(-300));
    insertSignup.run('ss_3', 'shift_1', 'recip_1', 'Nadia Rahman', '+8801722-102030', 'completed', 2.0, isoOffset(-2880));
    insertSignup.run('ss_4', 'shift_4', 'recip_5', 'Sajib Ahmed', '+8801522-506070', 'completed', 3.5, isoOffset(-1900));
  }
}
