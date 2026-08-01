-- ============================================================
-- TRIGGER: Notifikasi WhatsApp otomatis saat invoice jadi LUNAS
-- Jalankan SETELAH Edge Function 'notify-invoice-paid' berhasil di-deploy.
-- Ganti YOUR-PROJECT-REF di bawah dengan project ref Supabase Anda
-- (lihat di URL dashboard: https://supabase.com/dashboard/project/YOUR-PROJECT-REF)
-- ============================================================

-- Extension untuk memanggil HTTP dari dalam Postgres
create extension if not exists pg_net;

create or replace function notify_invoice_paid()
returns trigger as $$
begin
  -- Hanya jalan kalau status BARU SAJA berubah MENJADI 'Paid'
  -- (tidak berulang kalau invoice yang sudah Paid di-update lagi tanpa ganti status)
  if new.status = 'Paid' and (old.status is distinct from 'Paid') then
    perform net.http_post(
      url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify-invoice-paid',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('invoiceNumber', new.invoice_number)
    );
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_notify_invoice_paid on invoices;
create trigger trg_notify_invoice_paid
  after update on invoices
  for each row
  execute function notify_invoice_paid();
