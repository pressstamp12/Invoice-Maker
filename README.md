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

## Update: perbaikan bug + fitur baru (baca kalau upgrade dari versi sebelumnya)

Jika sebelumnya Anda sudah menjalankan `schema.sql`, cukup jalankan ulang
**seluruh isi `schema.sql`** di SQL Editor (aman diulang — semua perintah
pakai `IF NOT EXISTS`) untuk menambahkan tabel `customers` yang baru.

Lalu timpa semua file di `public/` (terutama `assets/api.js`, `assets/app.js`,
`assets/invoice-template.js`, `sw.js`, `index.html`) di repo GitHub Anda
dengan isi dari paket ini → commit → push.

**Setelah deploy, buka aplikasi (browser/PWA yang sudah ter-install) dan
tutup-buka sekali** — service worker versi baru akan otomatis mengambil alih
dan me-reload halaman sendiri; setelah itu update berikutnya akan mengalir
otomatis tanpa perlu langkah manual ini lagi.

Ringkasan perbaikan:
- **Double input arus kas** — tombol Simpan (HPP, Terima Bayar, Kas manual)
  sekarang terkunci saat proses berjalan, jadi tap ganda/koneksi lambat tidak
  lagi mencatat transaksi dua kali.
- **Status Lunas tanpa catatan kas** — klik badge status untuk menandai
  Lunas sekarang otomatis mengarahkan ke modal "Terima Bayar" (supaya kas
  selalu tercatat). Klik untuk membatalkan status Lunas tetap bisa langsung
  (tidak menghapus histori kas yang sudah ada).
- **Tanda tangan hilang di JPG** — sistem sekarang menunggu semua gambar
  (logo & tanda tangan) selesai dimuat sebelum meng-capture, dan meminta
  izin CORS ke server gambar. **Catatan:** kalau tanda tangan Anda di-host di
  URL yang tidak mendukung CORS, tetap bisa gagal muncul di JPG/PDF meski
  muncul normal di preview — solusi paling aman adalah upload gambar
  tanda tangan/logo ke **Supabase Storage** (bucket `invoice-files` yang
  sudah dibuat otomatis), lalu pakai Public URL-nya.
- **Tampilan "kode aneh" saat buka app** — disebabkan cache PWA (service
  worker) menyimpan file lama. Sekarang strategi cache diganti jadi
  network-first (selalu ambil versi terbaru saat online) + auto-reload saat
  ada update baru terdeploy.

Fitur baru:
- **Sortir arus kas** — di tab Kas, ada dropdown "Urutkan": Tanggal
  Transaksi / Tanggal Dicatat / Nomor Invoice. Pilih "Nomor Invoice" untuk
  mengelompokkan transaksi per invoice, memudahkan cek invoice mana yang
  catatannya belum lengkap.
- **Data customer tersimpan otomatis** — setiap invoice disimpan, nama +
  email + telepon + alamat klien otomatis tersimpan. Saat buat invoice baru
  dan ketik nama klien yang sama (repeat order), email/telepon/alamat
  otomatis terisi.

## Menambah user/karyawan baru

Supabase Dashboard → Authentication → Users → Add user (email + password).
User baru langsung bisa login dan punya akses penuh yang sama (aplikasi ini
didesain untuk 1 tim/toko, bukan multi-tenant terpisah).

## 7. Notifikasi WhatsApp otomatis saat invoice LUNAS

Fitur ini mengirim detail invoice ke grup WhatsApp otomatis setiap kali status
invoice berubah jadi "Paid" — lewat provider **Fonnte** (karena WhatsApp
Business API resmi tidak bisa kirim ke grup).

### 7.1 Siapkan akun Fonnte
1. Daftar di https://fonnte.com, hubungkan 1 nomor WA (scan QR) yang sudah
   jadi anggota grup tujuan.
2. Salin **Token** device dari dashboard Fonnte.
3. Cari **Group ID** grup tujuan lewat menu daftar grup di dashboard Fonnte
   (format umum: `120xxxxxxxxx-xxxxxxxxxx@g.us`).

### 7.2 Install Supabase CLI (sekali saja di komputer Anda)
```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
```
`YOUR-PROJECT-REF` bisa dilihat di URL dashboard project Anda.

### 7.3 Set secret & deploy Edge Function
```bash
supabase secrets set FONNTE_TOKEN=isi_token_fonnte_anda
supabase secrets set FONNTE_GROUP_ID=isi_group_id_anda

supabase functions deploy notify-invoice-paid --no-verify-jwt
```
`--no-verify-jwt` dipakai karena function ini dipanggil oleh trigger database
(bukan oleh pengguna lewat browser), jadi tidak membawa token login pengguna.

### 7.4 Pasang trigger database
1. Buka `supabase/notify_trigger.sql`, ganti `YOUR-PROJECT-REF` pada baris
   `url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify-invoice-paid'`
   dengan project ref Anda.
2. Jalankan isi file itu di **SQL Editor** Supabase.

### 7.5 Uji coba
Di aplikasi, tandai satu invoice sebagai "Lunas" (klik badge status di Daftar
Invoice, atau lewat modal "Terima Bayar"). Pesan otomatis akan masuk ke grup
WhatsApp dalam beberapa detik. Kalau tidak masuk, cek log Edge Function lewat:
```bash
supabase functions logs notify-invoice-paid
```
Penyebab paling umum: Group ID salah format, token Fonnte kadaluarsa/device
ter-disconnect (perlu scan ulang QR di dashboard Fonnte), atau nomor WA
Fonnte belum jadi anggota grup tujuan.
