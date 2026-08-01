// Edge Function: notify-invoice-paid
// Dipanggil oleh database trigger (lihat supabase/notify_trigger.sql) setiap kali
// kolom invoices.status berubah dari selain 'Paid' menjadi 'Paid'.
//
// Env vars yang perlu di-set (lewat: supabase secrets set NAMA=nilai):
//   FONNTE_TOKEN     -> token device Fonnte Anda
//   FONNTE_GROUP_ID  -> ID grup WhatsApp tujuan (mis. 1203xxxxxxxx-xxxxxxxxxx@g.us)
// SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY otomatis tersedia di Edge Function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  try {
    const { invoiceNumber } = await req.json();
    if (!invoiceNumber) {
      return new Response(JSON.stringify({ error: 'invoiceNumber wajib diisi' }), { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('invoice_number', invoiceNumber)
      .maybeSingle();
    if (invErr || !invoice) throw new Error('Invoice tidak ditemukan: ' + invoiceNumber);

    let companyName = '-';
    if (invoice.company_id) {
      const { data: company } = await supabase.from('companies').select('name').eq('company_id', invoice.company_id).maybeSingle();
      if (company) companyName = company.name;
    }
    let cashierName = '-';
    if (invoice.cashier_id) {
      const { data: cashier } = await supabase.from('cashiers').select('name').eq('cashier_id', invoice.cashier_id).maybeSingle();
      if (cashier) cashierName = cashier.name;
    }

    const money = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    const message =
      `✅ *INVOICE LUNAS*\n\n` +
      `No. Invoice : *${invoice.invoice_number}*\n` +
      `Perusahaan  : ${companyName}\n` +
      `Klien       : ${invoice.client_name}\n` +
      `Kasir       : ${cashierName}\n` +
      `Tanggal     : ${invoice.invoice_date}\n` +
      `Total       : *${money(invoice.total)}*\n` +
      (invoice.notes ? `Catatan     : ${invoice.notes}\n` : '') +
      `\n_Notifikasi otomatis dari Invoice Maker_`;

    const fonnteToken = Deno.env.get('FONNTE_TOKEN');
    const groupId = Deno.env.get('FONNTE_GROUP_ID');
    if (!fonnteToken || !groupId) throw new Error('FONNTE_TOKEN / FONNTE_GROUP_ID belum di-set di secrets.');

    const form = new FormData();
    form.append('target', groupId);
    form.append('message', message);
    form.append('countryCode', '62');

    const waRes = await fetch('https://api.fonnte.com/send', {
      method: 'POST',
      headers: { Authorization: fonnteToken },
      body: form
    });
    const waJson = await waRes.json().catch(() => ({}));

    return new Response(JSON.stringify({ success: true, fonnte: waJson }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});
