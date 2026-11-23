const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create public directory if not exists
const publicDir = path.resolve(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Write public/icon.svg
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064e3b" />
      <stop offset="50%" stop-color="#047857" />
      <stop offset="100%" stop-color="#022c22" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="40%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6ee7b7" />
      <stop offset="100%" stop-color="#10b981" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background circle/squircle -->
  <rect width="512" height="512" rx="112" fill="url(#bgGrad)" />
  <circle cx="256" cy="256" r="230" stroke="#10b981" stroke-width="4" stroke-opacity="0.3" fill="none" />

  <!-- Steam / Aroma rays -->
  <path d="M 210 130 C 205 160 220 180 215 205" stroke="url(#goldGrad)" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.85" />
  <path d="M 256 110 C 250 145 265 170 258 205" stroke="url(#goldGrad)" stroke-width="12" stroke-linecap="round" fill="none" />
  <path d="M 302 130 C 297 160 312 180 307 205" stroke="url(#goldGrad)" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.85" />

  <!-- Food Bowl -->
  <path d="M 120 240 Q 256 240 392 240 C 380 350 332 380 256 380 C 180 380 132 350 120 240 Z" fill="url(#goldGrad)" filter="url(#glow)" />
  <!-- Bowl Rim -->
  <ellipse cx="256" cy="240" rx="136" ry="24" fill="#fef3c7" stroke="#d97706" stroke-width="4" />

  <!-- Sprout of Hope / Leaf -->
  <path d="M 256 220 Q 285 175 330 185 Q 320 225 256 240 Z" fill="url(#emeraldGrad)" />
  <path d="M 256 220 Q 225 175 180 185 Q 190 225 256 240 Z" fill="#34d399" />
  <circle cx="256" cy="224" r="8" fill="#fef08a" />

  <!-- Bottom pedestal -->
  <path d="M 200 376 L 312 376 C 304 396 280 404 256 404 C 232 404 208 396 200 376 Z" fill="#b45309" />

  <!-- Inner Rice/Meal highlight -->
  <ellipse cx="256" cy="240" rx="100" ry="16" fill="#fef9c3" opacity="0.9" />
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgIcon, 'utf8');
console.log('Created public/icon.svg');

// PNG Builder Helper using pure Node.js
function buildPngBuffer(width, height, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // 8-bit
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.concat([typeBuf, data]);
    let crc = 0 ^ (-1);
    for (let i = 0; i < crcBuf.length; i++) {
      let byte = crcBuf[i];
      for (let j = 0; j < 8; j++) {
        const mask = -(crc & 1);
        crc = (crc >>> 1) ^ (0xEDB88320 & mask);
      }
    }
    crc = (crc ^ (-1)) >>> 0;
    const crcField = Buffer.alloc(4);
    crcField.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcField]);
  }

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const idatData = zlib.deflateSync(rawData);
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Draw Rizik Brand Emblem in RGBA
function rizikIconShader(x, y, w, h, isMaskable = false) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = (x - cx) / (w / 2);
  const dy = (y - cy) / (h / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background gradient: dark emerald to deep forest
  const bgR = Math.round(6 + (4 - 6) * ((dy + 1) / 2));
  const bgG = Math.round(78 + (120 - 78) * ((dy + 1) / 2));
  const bgB = Math.round(59 + (40 - 59) * ((dy + 1) / 2));

  // If not maskable, round squircle bounds
  if (!isMaskable) {
    const cornerRadius = 0.88;
    const dCorner = Math.pow(Math.abs(dx), 3.5) + Math.pow(Math.abs(dy), 3.5);
    if (dCorner > cornerRadius) {
      return [0, 0, 0, 0]; // Transparent outside squircle
    }
  }

  // Inside background
  let r = bgR;
  let g = bgG;
  let b = bgB;
  let a = 255;

  // Safe scale factor
  const scale = isMaskable ? 0.72 : 0.88;
  const lx = dx / scale;
  const ly = dy / scale;

  // Outer gold ring
  const lDist = Math.sqrt(lx * lx + ly * ly);
  if (lDist > 0.88 && lDist < 0.94) {
    return [16, 185, 129, 180];
  }

  // Bowl geometry (lower hemisphere)
  // Bowl top line: ly around 0.05, bottom ly around 0.55
  if (ly >= -0.05 && ly <= 0.58) {
    const bowlRadiusX = 0.55 * (1 - Math.pow((ly - 0.05) / 0.53, 2) * 0.45);
    if (Math.abs(lx) <= bowlRadiusX) {
      // Golden gradient
      const t = (ly + 0.05) / 0.6;
      r = Math.round(250 - t * 40);
      g = Math.round(204 - t * 60);
      b = Math.round(21 + t * 20);

      // Bowl rim highlight
      if (Math.abs(ly - 0.05) < 0.06) {
        r = 254;
        g = 243;
        b = 199;
      }
      return [r, g, b, 255];
    }
  }

  // Sprout Leaves & Steam (above bowl: ly between -0.55 and 0.05)
  if (ly >= -0.55 && ly < 0.05) {
    // Center steam
    if (Math.abs(lx) < 0.05 && ly >= -0.45) {
      return [245, 158, 11, 230];
    }
    // Left sprout leaf
    const leafLeftDist = Math.hypot(lx + 0.18, ly + 0.2);
    if (leafLeftDist < 0.22 && lx < 0) {
      return [52, 211, 153, 245];
    }
    // Right sprout leaf
    const leafRightDist = Math.hypot(lx - 0.18, ly + 0.2);
    if (leafRightDist < 0.22 && lx > 0) {
      return [16, 185, 129, 245];
    }
  }

  return [r, g, b, a];
}

// 2. Generate PNGs
console.log('Generating PWA PNG icons...');
const pwa192 = buildPngBuffer(192, 192, (x, y, w, h) => rizikIconShader(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), pwa192);
console.log('Created public/pwa-192x192.png');

const pwa512 = buildPngBuffer(512, 512, (x, y, w, h) => rizikIconShader(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), pwa512);
console.log('Created public/pwa-512x512.png');

const pwaMaskable512 = buildPngBuffer(512, 512, (x, y, w, h) => rizikIconShader(x, y, w, h, true));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), pwaMaskable512);
console.log('Created public/pwa-maskable-512x512.png');

const appleTouchIcon = buildPngBuffer(180, 180, (x, y, w, h) => rizikIconShader(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), appleTouchIcon);
console.log('Created public/apple-touch-icon.png');

const favicon = buildPngBuffer(64, 64, (x, y, w, h) => rizikIconShader(x, y, w, h, false));
fs.writeFileSync(path.join(publicDir, 'favicon.png'), favicon);
console.log('Created public/favicon.png');

// 3. Generate 1200x630 OpenGraph Share Card
console.log('Generating og-image.png (1200x630)...');
const ogImage = buildPngBuffer(1200, 630, (x, y, w, h) => {
  // Rich emerald gradient with golden light rays
  const nx = x / w;
  const ny = y / h;
  const cornerGlow = Math.hypot(nx - 0.2, ny - 0.5);

  let r = Math.round(6 + (20 * (1 - cornerGlow)));
  let g = Math.round(78 + (60 * (1 - cornerGlow)));
  let b = Math.round(59 + (30 * (1 - cornerGlow)));

  // Center emblem card area (around x: 220, y: 315)
  const iconDist = Math.hypot(x - 240, y - 315);
  if (iconDist < 170) {
    const subX = (x - (240 - 170)) / 340 * 192;
    const subY = (y - (315 - 170)) / 340 * 192;
    return rizikIconShader(subX, subY, 192, 192, false);
  }

  // Accent bars
  if (y > 610) {
    return [245, 158, 11, 255]; // Gold bottom edge
  }

  return [r, g, b, 255];
});
fs.writeFileSync(path.join(publicDir, 'og-image.png'), ogImage);
console.log('Created public/og-image.png');

// 4. Generate manifest.json in public/ for static hosts
const manifestJson = {
  id: '/',
  name: 'Rizik',
  short_name: 'Rizik',
  description: 'রিজিক কখনো ভুল ঠিকানায় পৌঁছায় না, যার জন্য যতটুকু বরাদ্দ, সে ততটুকুই পায়।',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#10b981',
  background_color: '#0f172a',
  orientation: 'portrait-primary',
  icons: [
    {
      src: '/pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any'
    },
    {
      src: '/pwa-maskable-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable'
    }
  ]
};
fs.writeFileSync(path.join(publicDir, 'manifest.json'), JSON.stringify(manifestJson, null, 2), 'utf8');
console.log('Created public/manifest.json');
