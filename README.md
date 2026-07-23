# Invoice Maker — PWA (GitHub + Supabase)

Migrasi dari Google Apps Script ke aplikasi web statis (tanpa proses build/Node)
yang bicara langsung ke Supabase. Bisa di-install di HP sebagai app (PWA).

Semua tampilan & fitur dibuat **sama persis** dengan versi Apps Script:
Dashboard, Buat Invoice, Daftar Invoice, HPP, Kas (Brankas/Pribadi/Bank + transfer),
Kelola Item, Pengaturan (Perusahaan/Kop, Kasir, Database Rekening), Impor Excel,
Preview/Download PDF & JPG, share ke WhatsApp.

## Struktur folder

```
invoice-maker-pwa/
├── public/                  <- ini yang di-deploy (root situs)
│   ├── index.html
│   ├── manifest.json        <- konfigurasi PWA
│   ├── sw.js                <- service worker (installable + app-shell cache)
│   ├── icons/
│   └── assets/
│       ├── supabase-config.js  <- ISI URL & ANON KEY Supabase Anda di sini
│       ├── api.js              <- pengganti Code.gs (semua fungsi server)
│       ├── invoice-template.js <- pengganti InvoiceTemplate.html
│       └── app.js              <- pengganti JavaScript.html (UI logic)
├── supabase/
│   ├── schema.sql            <- skema database + RLS + storage bucket
│   └── seed_data.sql         <- DATA ASLI Anda (432 invoice dll) siap import
└── README.md
```

## 1. Setup Supabase

1. Buat project baru di https://supabase.com (gratis).
2. Buka **SQL Editor** → New query → tempel isi `supabase/schema.sql` → Run.
   Ini akan membuat semua tabel, Row Level Security, dan storage bucket `invoice-files`.
3. Masih di SQL Editor → New query → tempel isi `supabase/seed_data.sql` → Run.
   Ini akan mengisi database dengan **data asli Anda** (invoice, item, kasir,
   perusahaan, kas, dll — sesuai file Excel database yang Anda unggah).
4. Buka **Authentication → Users → Add user** → buat 1 akun (email + password)
   untuk login ke aplikasi (bisa tambah lebih dari 1 user/karyawan nanti).
5. Buka **Project Settings → API** → salin:
   - `Project URL`
   - `anon public` key

## 2. Hubungkan aplikasi ke Supabase

Edit `public/assets/supabase-config.js`:

```js
window.SUPABASE_URL = "https://xxxxxxxx.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOi....";
```

`anon key` aman ditaruh di kode publik/browser — akses data tetap dijaga oleh
Row Level Security yang sudah diatur di `schema.sql` (hanya user yang login
lewat Supabase Auth yang boleh baca/tulis data).

## 3. Push ke GitHub

```bash
cd invoice-maker-pwa
git init
git add .
git commit -m "Migrasi Invoice Maker ke PWA + Supabase"
git branch -M main
git remote add origin https://github.com/USERNAME/invoice-maker.git
git push -u origin main
```

## 4. Deploy (Vercel — auto-deploy tiap push)

1. Buka https://vercel.com → New Project → import repo GitHub Anda.
2. Saat konfigurasi, set **Root Directory** ke `public` (karena situsnya statis,
   tidak perlu Build Command / Output Directory — kosongkan/biarkan default,
   atau pilih framework preset "Other").
3. Deploy. Anda akan dapat URL `https://invoice-maker-xxx.vercel.app`.
4. Setiap kali Anda push perubahan ke GitHub, Vercel otomatis deploy ulang.

> Alternatif: GitHub Pages (Settings → Pages → Deploy from branch → folder `/public`),
> atau Netlify (Publish directory: `public`) — sama-sama gratis dan tanpa build step.

## 5. Install sebagai app di HP (PWA)

- **Android (Chrome):** buka URL Vercel Anda → menu (⋮) → "Tambahkan ke Layar Utama" /
  "Install aplikasi".
- **iPhone (Safari):** buka URL → tombol Share → "Tambah ke Layar Utama".

Aplikasi akan muncul seperti app native (ikon sendiri, tanpa address bar).

## 6. Login pertama kali

Buka aplikasi → masukkan email & password user yang Anda buat di langkah 1.4.
Setelah login, semua tab (Dashboard, Buat Invoice, dst) akan berfungsi
menggunakan data yang sudah dimigrasikan.

## Catatan penting soal perbedaan dari versi Apps Script

- **Login**: karena bukan lagi jalan di dalam akun Google Anda, aplikasi ini
  butuh login sendiri (Supabase Auth). Tambahkan user lain lewat
  Authentication → Users di dashboard Supabase.
- **Penyimpanan file (PDF/JPG "Link")**: pengganti Google Drive adalah
  **Supabase Storage** (bucket `invoice-files`, sudah dibuat otomatis oleh
  `schema.sql`, bersifat publik untuk link yang dibagikan).
- **PDF**: dulu dibuat oleh server Google (`HtmlService...getAs('pdf')`),
  sekarang dirender di browser HP/laptop pengguna (html2canvas + jsPDF).
  Hasilnya identik secara visual dengan template invoice aslinya.
- **Nomor ID** (`INV-2026-0001`, `CMP-0001`, dst): tetap memakai skema yang
  sama persis seperti sebelumnya.
- Semua rumus HPP, profit, produktivitas kasir, kinerja perusahaan, dan
  logika kas (brankas/pribadi/bank + transfer) — dipindahkan 1:1 dari
  `Code.gs` tanpa ada perubahan logika.

## Menambah user/karyawan baru

Supabase Dashboard → Authentication → Users → Add user (email + password).
User baru langsung bisa login dan punya akses penuh yang sama (aplikasi ini
didesain untuk 1 tim/toko, bukan multi-tenant terpisah).
