# MailDesk OTP Dashboard

Dashboard sekarang punya dua tampilan:

- `/` untuk admin
- `/mail/<route_token_acak>` untuk inbox user

Fitur utama:

- admin bisa buat satu mailbox manual dari local-part
- admin bisa bulk generate mailbox dari input satu baris satu local-part
- setiap mailbox punya link akses user sendiri
- halaman user hanya menampilkan inbox mailbox miliknya

## Jalankan

```bash
npm install
npm run dev
```

## Konfigurasi Supabase

1. Salin `.env.example` menjadi `.env`
2. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`
3. Jalankan SQL pada [supabase/schema.sql](E:/lkom/supabase/schema.sql)

## Struktur database

Tabel:

- `public.user_mailboxes`
- `public.incoming_emails`
- `public.mail_processing_logs`

Kolom penting mailbox:

- `display_name`
- `inbox_email`
- `route_token`
- `is_active`

Kolom penting email masuk:

- `preview_text`
- `body_text`
- `body_html`

Fungsi RPC:

- `public.get_mailbox_by_route_token(p_route_token)`
- `public.get_mailbox_inbox_by_route_token(p_route_token, p_limit)`
- `public.get_admin_mailboxes(p_admin_password)`
- `public.get_admin_recent_incoming_emails(p_admin_password, p_limit)`
- `public.create_admin_mailbox(p_admin_password, p_local_part, p_display_name)`
- `public.bulk_create_admin_mailboxes(p_admin_password, p_items)`

## Akses admin

Halaman root `https://lkom.cloud/` dipakai untuk admin dan menampilkan:

- list semua mailbox
- alamat email inbox tiap user
- link dashboard user
- email masuk terbaru lintas semua mailbox
- form create mailbox baru
- panel bulk generate mailbox

Default password admin:

```text
IkiJeporo1954
```

## Link user

Format link user:

```text
https://lkom.cloud/mail/<route_token_acak>
```

`route_token` dibuat otomatis oleh database dengan nilai acak yang sulit ditebak.

## Buat mailbox dari dashboard admin

Input single mailbox:

```text
riski-ridho
```

Hasil:

```text
riski-ridho@lkom.cloud
https://lkom.cloud/mail/<route_token_acak>
```

## Bulk generate

Input bulk di admin pakai format satu baris satu local-part:

```text
budi-santoso
siti-aminah
raka-saputra
```

Setiap baris akan membuat:

- `display_name` otomatis
- `inbox_email` otomatis
- `route_token` otomatis
- link mailbox user

## Link verifikasi dari email HTML

Frontend sekarang bisa mencoba membaca tombol/link verifikasi dari:

- URL plaintext di `preview_text` atau `body_text`
- atribut `href` di `body_html`

Kalau mau tombol verifikasi tampil konsisten di UI, pastikan email masuk menyimpan `body_html`.

## Insert email masuk

Contoh insert email OTP:

```sql
insert into public.incoming_emails (
  mailbox_id,
  sender_name,
  sender_email,
  subject,
  preview_text,
  body_text
)
select
  id,
  'Telegram',
  'login@telegram.org',
  'Kode login Anda 384921',
  'Gunakan kode 384921 untuk masuk.',
  'Gunakan kode 384921 untuk masuk ke akun Anda.'
from public.user_mailboxes
where inbox_email = 'demo-otp@maildesk.local';
```

Untuk melihat token user:

```sql
select display_name, inbox_email, route_token
from public.user_mailboxes;
```

## Cloudflare Worker untuk email masuk

Folder Worker:

```text
cloudflare-worker/
```

Fungsi Worker:

- menerima email dari Cloudflare Email Routing
- mencari `inbox_email` yang cocok di `user_mailboxes`
- menyimpan email ke `incoming_emails`
- mencatat error processing ke `mail_processing_logs`

### Env Worker

Salin `cloudflare-worker/.dev.vars.example` menjadi `.dev.vars` di folder `cloudflare-worker`, lalu isi:

```text
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
MAIL_DOMAIN=lkom.cloud
```

### Deploy Worker

```bash
cd cloudflare-worker
npm install
npm run deploy
```

### Setup di Cloudflare

1. Aktifkan `Email Routing` untuk `lkom.cloud`
2. Aktifkan `Catch-all address`
3. Set action ke `Worker`
4. Pilih Worker `maildesk-email-worker`

Setelah itu email ke alamat seperti `riski-ridho@lkom.cloud` akan diterima Worker dan otomatis masuk ke database kalau mailbox tersebut ada di `user_mailboxes`.

### Cek error email masuk

Kalau email ditolak, cek log database:

```sql
select inbox_email, sender_email, status, error_message, created_at
from public.mail_processing_logs
order by created_at desc
limit 30;
```
