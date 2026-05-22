# MailDesk OTP Dashboard

Dashboard ini sekarang difokuskan untuk OTP:

- satu user punya satu mailbox
- satu user punya satu link akses inbox
- frontend membaca inbox user tertentu dari Supabase
- root dashboard dikunci password admin

## Jalankan

```bash
npm install
npm run dev
```

## Konfigurasi Supabase

1. Salin `.env.example` menjadi `.env`
2. Isi `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`
3. Jalankan SQL pada [supabase/schema.sql](F:/lkom/supabase/schema.sql)

## Struktur database

Tabel:

- `public.user_mailboxes`
- `public.incoming_emails`

Fungsi RPC:

- `public.get_mailbox_context(p_slug, p_access_token)`
- `public.get_mailbox_inbox(p_slug, p_access_token, p_limit)`

Frontend tidak lagi membaca semua email secara langsung. Dashboard memanggil RPC berdasarkan link user.

## Format link user

```text
http://127.0.0.1:5173/?mailbox=demo-user&token=change-this-secret-token
```

## Akses admin

Halaman root `http://127.0.0.1:5173/` dikunci password admin frontend.

Default password:

```text
IkiJeporo1954
```

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
where slug = 'demo-user';
```

Kalau env atau RPC belum aktif, UI akan fallback ke data contoh lokal.
