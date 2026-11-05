/**
 * Uji asap UI per peran (Playwright).
 *   Prasyarat: `npx supabase start && npx supabase db reset`, `npm run dev`,
 *   dan Playwright: `npm i -D playwright && npx playwright install chromium`.
 *   Jalankan:  SUPABASE_SERVICE_ROLE_KEY=... npm run test:ui
 * Opsional: BASE_URL (default http://localhost:5173), SUPABASE_URL.
 *
 * Untuk setiap peran: buka semua halaman yang boleh diakses di lebar HP (360px)
 * dan desktop; gagal bila ada galat konsol, scroll horizontal, atau judul hilang.
 * Halaman terlarang harus menampilkan "Akses ditolak" / dialihkan.
 */
import { createRequire } from 'node:module';
import { createHmac } from 'node:crypto';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright belum terpasang. Jalankan: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SB_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_ID = '00000000-0000-4000-a000-000000000001';

function totp(secret) {
  const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, val = 0;
  const out = [];
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) {
    val = (val << 5) | a.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', Buffer.from(out)).update(b).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

async function resetOwnerMfa() {
  if (!SERVICE) throw new Error('Set SUPABASE_SERVICE_ROLE_KEY agar uji Owner bisa mendaftarkan 2FA uji.');
  const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };
  const r = await fetch(`${SB_URL}/auth/v1/admin/users/${OWNER_ID}/factors`, { headers: h });
  const factors = r.ok ? await r.json() : [];
  for (const f of factors) await fetch(`${SB_URL}/auth/v1/admin/users/${OWNER_ID}/factors/${f.id}`, { method: 'DELETE', headers: h });
}

const PUBLIC = ['/', '/menu', '/menu/soes-vla', '/keranjang', '/lacak', '/cerita', '/lokasi', '/masuk', '/daftar'];
const ROLES = {
  tamu: { pages: PUBLIC, forbidden: ['/akun', '/dashboard'] },
  member: { email: 'member@gutvibes.test', pw: 'Member12345', pages: ['/akun', '/menu', '/checkout'], forbidden: ['/dashboard'] },
  admin_baking: {
    email: 'baking@gutvibes.test', pw: 'Baking12345',
    pages: ['/dashboard/produksi', '/dashboard/produksi/riwayat', '/dashboard/stok-bahan', '/dashboard/profil'],
    forbidden: ['/dashboard/pesanan', '/dashboard/resep', '/dashboard/biaya', '/dashboard/akun', '/dashboard/katalog'],
  },
  admin: {
    email: 'admin@gutvibes.test', pw: 'Admin12345',
    pages: ['/dashboard', '/dashboard/pesanan', '/dashboard/katalog', '/dashboard/promo', '/dashboard/pelanggan', '/dashboard/loyalti',
      '/dashboard/produksi', '/dashboard/produksi/riwayat', '/dashboard/stok-bahan', '/dashboard/stok-produk', '/dashboard/resep',
      '/dashboard/konten', '/dashboard/whatsapp'],
    forbidden: ['/dashboard/akun', '/dashboard/biaya', '/dashboard/laporan', '/dashboard/analisis-pelanggan', '/dashboard/pengaturan', '/dashboard/log-aktivitas'],
  },
  owner: {
    email: 'owner@gutvibes.test', pw: 'Owner12345', mfa: true,
    pages: ['/dashboard', '/dashboard/pesanan', '/dashboard/katalog', '/dashboard/promo', '/dashboard/pelanggan', '/dashboard/loyalti',
      '/dashboard/produksi', '/dashboard/produksi/riwayat', '/dashboard/stok-bahan', '/dashboard/stok-produk', '/dashboard/resep',
      '/dashboard/biaya', '/dashboard/biaya?tab=anggaran', '/dashboard/laporan', '/dashboard/analisis-pelanggan', '/dashboard/konten',
      '/dashboard/whatsapp', '/dashboard/whatsapp?tab=koneksi', '/dashboard/akun', '/dashboard/log-aktivitas', '/dashboard/pengaturan'],
    forbidden: [],
  },
};

const failures = [];
const results = [];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });

async function check(page, role, path, width) {
  const errs = [];
  const onConsole = (m) => { if (m.type() === 'error') errs.push(m.text()); };
  const onPageError = (e) => errs.push(e.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  await page.goto(BASE + path);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const culprit = overflow > 1
    ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(-3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(' ').slice(0, 3).join('.')}`).join(', '))
    : '';
  const h1 = await page.locator('h1').count();
  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  const ok = errs.length === 0 && overflow <= 1 && h1 > 0;
  results.push({ peran: role, halaman: path, lebar: width, ok: ok ? '✓' : '✗', overflow, galat: errs.length });
  if (!ok) failures.push(`${role} ${path} @${width}px: ${errs.join(' | ') || ''}${overflow > 1 ? ` scroll horizontal ${overflow}px (${culprit})` : ''}${h1 ? '' : ' tanpa judul'}`);
}

for (const [role, cfg] of Object.entries(ROLES)) {
  for (const width of [360, 1366]) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 740 : 860 } });
    const page = await ctx.newPage();
    if (cfg.email) {
      if (cfg.mfa) await resetOwnerMfa();
      await page.goto(BASE + '/masuk');
      await page.getByLabel('Email').fill(cfg.email);
      await page.getByLabel('Kata sandi').fill(cfg.pw);
      await page.getByRole('button', { name: 'Masuk' }).click();
      if (cfg.mfa) {
        await page.waitForURL(/2fa/);
        await page.getByText('Tidak bisa memindai').waitFor();
        const secret = (await page.locator('details code').textContent()).trim();
        await page.getByLabel('Kode 6 digit').fill(totp(secret));
        await page.getByRole('button', { name: 'Verifikasi' }).click();
      }
      await page.waitForURL((u) => !u.pathname.startsWith('/masuk') && !u.pathname.includes('2fa'));
    }
    for (const path of cfg.pages) await check(page, role, path, width);
    if (width === 1366) {
      for (const path of cfg.forbidden) {
        await page.goto(BASE + path);
        await page.waitForLoadState('networkidle').catch(() => {});
        const denied = (await page.getByText('Akses ditolak').count()) > 0 || !new URL(page.url()).pathname.startsWith(path.split('?')[0]);
        results.push({ peran: role, halaman: `${path} (terlarang)`, lebar: width, ok: denied ? '✓' : '✗', overflow: 0, galat: 0 });
        if (!denied) failures.push(`${role} bisa membuka halaman terlarang ${path}`);
      }
    }
    await ctx.close();
  }
}
await browser.close();
console.table(results);
if (failures.length) {
  console.error(`\n${failures.length} masalah:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`\nSemua ${results.length} pemeriksaan lulus.`);
