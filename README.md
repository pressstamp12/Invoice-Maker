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

- **Lampiran Gambar** — di form Buat Penawaran, ada tombol "📤 Tambah Gambar" (bisa pilih beberapa sekaligus, mis. mockup desain atau referensi produk). Otomatis muncul sebagai galeri di PDF penawaran, sebelum bagian tanda tangan.

## Fitur baru: Penawaran Harga (Quotation)

Tab **"Penawaran"** — untuk klien yang butuh dokumen resmi sebelum deal (biasanya klien korporat/PO besar):

- Buat penawaran dengan format mirip invoice (kop surat, tabel item, dll), tapi ada **"Berlaku Hingga"** (bukan jatuh tempo) dan PDF-nya bertuliskan **"PENAWARAN HARGA"**, bukan "INVOICE"
- Status: **Menunggu / Diterima / Ditolak** — ubah lewat dropdown di tiap kartu
- Nomor otomatis: `QUO-2026-0001`, terpisah dari nomor invoice
- Tombol **🧾 Jadikan Invoice** — begitu klien setuju, data penawaran otomatis dipindah ke form Buat Invoice (tinggal cek & simpan), status penawaran ikut berubah jadi "Diterima" dan tertaut ke invoice hasilnya
- Preview/Download PDF & JPG, share link — sama seperti invoice

Setelah update ini, jalankan `supabase/schema.sql` (menambahkan tabel `quotations`, aman diulang).

## Update lanjutan #3: upload gambar langsung, urutan invoice angka asli, fix tanda tangan

- **Upload gambar langsung dari HP** — di form Kasir (tanda tangan) dan
  Perusahaan (logo), sekarang ada tombol **"📤 Upload"**. Klik → pilih foto
  dari HP → otomatis terupload ke Supabase Storage dan link-nya terisi
  sendiri. Tidak perlu lagi buka Dashboard Supabase manual. Maks ukuran
  file 3MB per gambar.
- **Urutan Nomor Invoice diperbaiki** — sebelumnya sortir A-Z/Z-A itu
  alfabet biasa (bisa salah urutan kalau prefix invoice campur, mis. IMP-
  vs INV-). Sekarang sortir memang berdasarkan **angka asli** di nomor
  invoice (Terkecil→Terbesar / Terbesar→Terkecil).
- **Tanda tangan masih tidak muncul** — ternyata ada sisa atribut
  `crossorigin="anonymous"` di kode yang lupa dihapus, yang justru
  menyebabkan gambar GAGAL DIMUAT SAMA SEKALI (bukan cuma di
  download, preview pun kena) kalau server gambarnya tidak mendukung
  CORS — sudah dihapus. **Kalau gambar tanda tangan/logo Anda saat ini
  masih pakai link Google Drive**, sebaiknya diganti ke Supabase Storage
  (pakai tombol Upload baru di atas) — Google Drive memang tidak cocok untuk
  ini karena kadang menampilkan halaman peringatan alih-alih gambar
  langsung, dan sering diblokir untuk akses otomatis berulang (hotlink).

Cara update: timpa `public/assets/api.js`, `public/assets/app.js`,
`public/assets/invoice-template.js`, dan `public/index.html` di repo Anda
(JANGAN timpa `supabase-config.js`) → commit → push. Tidak perlu ubah
database — storage bucket & policy upload sudah otomatis dibuat dari
`schema.sql` sebelumnya.

## Update lanjutan #2: filter kas jadi dropdown, urutan A-Z/Z-A, perbaiki JPG "crash"

- **Filter kas per invoice** — sekarang jadi **dropdown pilihan** (bukan
  ketik bebas lagi), isinya otomatis semua nomor invoice yang ada + nama
  klien, jadi tidak mungkin salah ketik.
- **Urutan Nomor Invoice A-Z / Z-A** — di dropdown "Urutkan" tab Kas.
- **Tanda tangan JPG/PDF "crash"** — penyebabnya: percobaan perbaikan
  sebelumnya membuat *preview* ikut menunggu proses `fetch()` gambar dari
  server (bisa macet lama/gagal kalau server gambar lambat atau tidak
  mengizinkan CORS sama sekali), sehingga preview jadi terasa "nge-hang"/gagal.
  Sekarang dipisah jadi dua jalur:
  - **Preview di layar** → kembali ke cara cepat/ringan seperti semula
    (pakai URL gambar apa adanya, tidak pernah macet).
  - **Download/Share PDF & JPG** → pakai jalur khusus dengan **timeout 5 detik**:
    kalau gambar berhasil diambil, dipakai; kalau gagal/lambat, otomatis
    lanjut tanpa macet (gambar itu saja yang mungkin tidak muncul, bukan
    seluruh prosesnya gagal).

Cara update: timpa `public/assets/api.js`, `public/assets/app.js`, dan
`public/index.html` di repo Anda (JANGAN timpa `supabase-config.js`) →
commit → push.

## Update lanjutan: tanda tangan JPG, filter kas per invoice, grafik mobile

- **Tanda tangan/logo hilang di JPG/PDF** — sekarang sebelum di-capture, gambar
  logo & tanda tangan diambil lewat `fetch()` dan diubah jadi data langsung
  (data URI), bukan cuma menunggu `<img>` selesai load. Ini jauh lebih
  andal karena capture-nya tidak lagi tergantung timing/CORS saat proses
  render berlangsung. **Catatan:** kalau URL gambar Anda di server yang benar-benar
  memblokir akses lintas-origin (tidak mengizinkan `fetch()` sama sekali),
  sistem otomatis fallback ke URL asli — dalam kasus itu, upload gambar ke
  Supabase Storage (bucket `invoice-files`) adalah solusi paling pasti.
- **Filter kas per invoice** — di tab Kas sekarang ada kolom "Cari Nomor
  Invoice". Ketik sebagian/seluruh nomor invoice (mis. "400" atau
  "INV-2026-0400") untuk langsung lihat semua transaksi masuk & keluar milik
  invoice itu, lengkap dengan ringkasan total masuk/keluar/selisihnya.
- **Grafik tren lebih rapi di HP** — label bulan dimiringkan otomatis di
  layar kecil supaya tidak menumpuk, angka disingkat (mis. "50rb"/"2jt"),
  dan grafik otomatis digambar ulang saat HP diputar (landscape/portrait).

Cara update: timpa `public/assets/api.js`, `public/assets/app.js`,
`public/assets/style.css`, dan `public/index.html` di repo Anda dengan isi
paket ini → commit → push. Tidak perlu ubah database (schema.sql tidak
berubah di update ini).

### Update: Gambar Produk, Barang vs Jasa, Deskripsi

- Setiap item sekarang punya field **Gambar Produk** (upload lewat tombol
  📤 Upload, sama seperti tanda tangan/logo) dan **Deskripsi** (teks bebas,
  cocok untuk keterangan seperti "Sudah termasuk jasa potong rapi" atau
  "Belum termasuk pemasangan").
- Setiap item juga punya field **Jenis: Barang / Jasa**. Katalog publik
  **hanya menampilkan item berjenis "Barang"** — item "Jasa" otomatis
  tersembunyi dari customer (tetap kelihatan & bisa dipakai normal di
  Admin, termasuk untuk invoice & simulasi harga).
- Kartu katalog (Admin maupun publik) sekarang menampilkan foto asli kalau
  ada gambar yang di-upload; kalau belum ada gambar, tetap fallback ke
  ikon seperti sebelumnya.

Setelah update ini, jalankan ulang `supabase/schema.sql` (menambah kolom
`image_url`, `item_type`, `description` ke tabel items). **Item yang sudah
ada sebelumnya otomatis dianggap "Barang"** — kalau ada yang sebenarnya
Jasa (misalnya item lama seperti "Desain"), tolong dicek & diedit jenisnya
satu per satu di Katalog Admin.

### Update: Harga per Cabang + Pilih Lokasi

Karena tiap titik Slawe (Setu, Mustikajaya, Cikarang) punya harga & nomor WA
berbeda, katalog publik sekarang **wajib pilih lokasi dulu** sebelum lihat
katalog:

- Setiap item di form Katalog Admin sekarang ada bagian **"Harga per
  Cabang"** — daftar semua Perusahaan/Kop yang ada, tiap baris bisa diisi
  harga khusus untuk cabang itu. **Kosongkan** kalau cabang itu mau pakai
  Harga Jual Default biasa.
- Nomor WhatsApp tujuan checkout otomatis dari **nomor telepon di data
  Perusahaan (Kop)** masing-masing cabang — tidak perlu isi nomor WA
  terpisah di `storefront-config.js` lagi.
- Customer buka katalog publik → pilih lokasi dulu (nama & alamat diambil
  dari data Perusahaan) → baru lihat katalog dengan harga sesuai lokasi
  itu → checkout otomatis ke nomor WA cabang tersebut. Pilihan lokasi
  diingat di HP customer (tidak perlu pilih ulang tiap buka).
- **Penting:** pastikan field "Telepon" di setiap Perusahaan (Kop) —
  Pengaturan → Perusahaan — sudah diisi nomor WhatsApp yang benar-benar
  aktif, karena itu yang jadi tujuan checkout.

Setelah update ini, jalankan ulang `supabase/schema.sql` (menambah tabel
`item_branch_prices` + izin baca publik untuk data Perusahaan).

## Update besar: Katalog Publik + Order via WhatsApp (2 aplikasi terpisah)

Sekarang ada **2 aplikasi terpisah** yang berbagi database Supabase yang sama:

- `public/` → **Aplikasi Admin** (perlu login) — semuanya seperti sekarang: dashboard, invoice, kas, katalog internal, dll.
- `storefront/` → **Katalog Publik** (tanpa login, bisa diakses siapa saja) — customer lihat produk, isi keranjang, checkout langsung buka WhatsApp dengan pesan pesanan siap kirim ke Anda.

### Perubahan di Admin
- Setiap item di Katalog sekarang punya 2 field baru: **Minimum Order** dan **Syarat & Ketentuan** (mis. "DP 50%, waktu produksi 2 hari") — ini yang tampil ke customer di katalog publik.
- **Semua item di Katalog otomatis tampil ke publik** (tidak ada penanda khusus, sesuai yang diminta). Kalau nanti mau ada item yang disembunyikan dari publik, tinggal bilang, saya tambahkan fitur toggle-nya.

### Setup Katalog Publik (storefront)

1. **Jalankan ulang `supabase/schema.sql`** (aman, idempotent) — ini menambahkan kolom `min_order`/`terms` ke tabel items, dan izin akses baca publik untuk katalog.
2. Buka `storefront/assets/storefront-config.js`, isi:
   ```js
   window.SUPABASE_URL = "..."       // sama seperti punya Admin
   window.SUPABASE_ANON_KEY = "..."  // sama seperti punya Admin
   window.STORE_WA_NUMBER = "62812xxxxxxxx"  // nomor WA Anda, format 62xxx tanpa + atau 0 di depan
   window.STORE_NAME = "Nama Toko Anda"
   window.STORE_TAGLINE = "Kalimat singkat di bawah nama toko"
   ```
3. Push ke GitHub seperti biasa (folder `storefront/` ikut ter-push).
4. **Deploy sebagai situs terpisah** di Vercel: New Project → pilih repo yang sama → kali ini set **Root Directory** ke `storefront` (bukan `public`). Anda akan dapat URL kedua, mis. `https://katalog-usaha-anda.vercel.app`, terpisah dari URL admin.
5. Bagikan URL katalog publik ini ke customer (bisa dipasang di bio Instagram, status WA, dll). Mereka **tidak perlu login apapun**.

### Cara kerja checkout
Customer pilih produk → atur jumlah → checkout → isi Nama & No. WA → tap "Kirim Pesanan via WhatsApp" → otomatis buka WhatsApp dengan pesan berisi daftar pesanan & total, tinggal customer tap **Kirim**. Tidak ada data order yang tersimpan di database — semuanya lewat chat WhatsApp seperti biasa Anda terima order.

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
