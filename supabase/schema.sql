-- ============================================================
-- INVOICE MAKER — Supabase Schema
-- Migrasi 1:1 dari struktur Google Sheets (Code.gs GAS v7)
-- Jalankan di Supabase SQL Editor (Project > SQL Editor > New query)
-- ============================================================

-- ---------- BANK ACCOUNTS ----------
create table if not exists bank_accounts (
  bank_id        text primary key,
  bank_name      text not null,
  account_number text not null,
  account_holder text not null,
  label          text default '',
  created_at     timestamptz not null default now()
);

-- ---------- COMPANIES (Kop Surat) ----------
create table if not exists companies (
  company_id      text primary key,
  name            text not null,
  address         text default '',
  phone           text default '',
  email           text default '',
  bank            text default '',   -- fallback teks manual (legacy)
  logo_url        text default '',
  currency        text default 'Rp',
  default_bank_id text references bank_accounts(bank_id) on delete set null,
  created_at      timestamptz not null default now()
);

-- ---------- CASHIERS (Kasir) ----------
create table if not exists cashiers (
  cashier_id    text primary key,
  name          text not null,
  phone         text default '',
  signature_url text default '',
  created_at    timestamptz not null default now()
);

-- ---------- ITEMS (Master Item) ----------
create table if not exists items (
  item_id       text primary key,
  item_name     text not null,
  category      text default '',
  default_price numeric default 0,
  unit          text default '',
  created_at    timestamptz not null default now()
);

-- ---------- ACCOUNTS (Akun Kas: Brankas / Pribadi / Bank) ----------
create table if not exists accounts (
  account_id      text primary key,
  name            text not null,
  type            text default 'personal', -- safe | personal | bank | other
  opening_balance numeric default 0,
  note            text default '',
  active          boolean default true,
  created_at      timestamptz not null default now()
);

-- ---------- INVOICES ----------
create table if not exists invoices (
  invoice_number text primary key,
  invoice_date   date not null default current_date,
  due_date       date,
  client_name    text not null,
  client_address text default '',
  client_email   text default '',
  client_phone   text default '',
  items_json     jsonb not null default '[]',
  notes          text default '',
  tax_percent    numeric default 0,
  discount       numeric default 0,
  subtotal       numeric default 0,
  tax_amount     numeric default 0,
  total          numeric default 0,
  status         text default 'Unpaid', -- Paid | Unpaid
  company_id     text references companies(company_id) on delete set null,
  cashier_id     text references cashiers(cashier_id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_invoices_status on invoices(status);
create index if not exists idx_invoices_company on invoices(company_id);
create index if not exists idx_invoices_cashier on invoices(cashier_id);

-- ---------- PURCHASES (HPP per invoice) ----------
create table if not exists purchases (
  id              bigserial primary key,
  invoice_number  text not null references invoices(invoice_number) on delete cascade,
  item_desc       text not null,
  qty             numeric,
  cost_price      numeric,
  total_cost      numeric not null default 0,
  type            text not null default 'item', -- item | other
  updated_at      timestamptz not null default now()
);
create index if not exists idx_purchases_invoice on purchases(invoice_number);

-- ---------- CASH FLOW ----------
create table if not exists cash_flow (
  flow_id         text primary key,
  date            date not null default current_date,
  type            text not null,             -- in | out | transfer
  account_id      text references accounts(account_id) on delete restrict,
  to_account_id   text references accounts(account_id) on delete restrict,
  amount          numeric not null,
  category        text default '',
  note            text default '',
  invoice_number  text references invoices(invoice_number) on delete set null,
  source_type     text default '',            -- hpp | payment | ''
  created_at      timestamptz not null default now()
);
create index if not exists idx_cashflow_invoice on cash_flow(invoice_number);
create index if not exists idx_cashflow_account on cash_flow(account_id);

-- ---------- GLOBAL SETTINGS (pengganti PropertiesService) ----------
create table if not exists app_settings (
  key   text primary key,
  value text
);
insert into app_settings(key, value) values ('CURRENCY', 'Rp')
  on conflict (key) do nothing;

-- ============================================================
-- ROW LEVEL SECURITY
-- App ini bersifat internal (1 tim/toko). Semua user yang sudah
-- login (Supabase Auth) boleh baca & tulis semua data.
-- ============================================================
alter table bank_accounts enable row level security;
alter table companies      enable row level security;
alter table cashiers       enable row level security;
alter table items          enable row level security;
alter table accounts       enable row level security;
alter table invoices       enable row level security;
alter table purchases      enable row level security;
alter table cash_flow      enable row level security;
alter table app_settings   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bank_accounts','companies','cashiers','items','accounts','invoices','purchases','cash_flow','app_settings']
  loop
    execute format('drop policy if exists "auth_all_%1$s" on %1$s', t);
    execute format(
      'create policy "auth_all_%1$s" on %1$s for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t
    );
  end loop;
end $$;

-- ============================================================
-- STORAGE (pengganti Google Drive untuk PDF/JPG invoice)
-- Jalankan bagian ini juga, atau buat manual lewat menu Storage:
-- Nama bucket: invoice-files, Public bucket: ON
-- ============================================================
insert into storage.buckets (id, name, public)
values ('invoice-files', 'invoice-files', true)
on conflict (id) do nothing;

drop policy if exists "invoice_files_read" on storage.objects;
create policy "invoice_files_read" on storage.objects
  for select using (bucket_id = 'invoice-files');

drop policy if exists "invoice_files_write" on storage.objects;
create policy "invoice_files_write" on storage.objects
  for insert to authenticated with check (bucket_id = 'invoice-files');

drop policy if exists "invoice_files_update" on storage.objects;
create policy "invoice_files_update" on storage.objects
  for update to authenticated using (bucket_id = 'invoice-files');
