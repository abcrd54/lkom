create extension if not exists pgcrypto;

create table if not exists public.user_mailboxes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  inbox_email text not null unique,
  access_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.incoming_emails (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.user_mailboxes(id) on delete cascade,
  sender_name text,
  sender_email text not null,
  subject text not null,
  preview_text text,
  body_text text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists incoming_emails_mailbox_id_received_at_idx
  on public.incoming_emails (mailbox_id, received_at desc);

alter table public.user_mailboxes enable row level security;
alter table public.incoming_emails enable row level security;

revoke all on public.user_mailboxes from anon, authenticated;
revoke all on public.incoming_emails from anon, authenticated;

create or replace function public.get_mailbox_context(
  p_slug text,
  p_access_token text
)
returns table (
  mailbox_id uuid,
  slug text,
  display_name text,
  inbox_email text
)
language sql
security definer
set search_path = public
as $$
  select
    id as mailbox_id,
    slug,
    display_name,
    inbox_email
  from public.user_mailboxes
  where slug = p_slug
    and access_token = p_access_token
    and is_active = true
  limit 1;
$$;

create or replace function public.get_mailbox_inbox(
  p_slug text,
  p_access_token text,
  p_limit integer default 12
)
returns table (
  id uuid,
  sender_name text,
  sender_email text,
  subject text,
  preview_text text,
  body_text text,
  received_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.sender_name,
    e.sender_email,
    e.subject,
    e.preview_text,
    e.body_text,
    e.received_at
  from public.user_mailboxes m
  join public.incoming_emails e on e.mailbox_id = m.id
  where m.slug = p_slug
    and m.access_token = p_access_token
    and m.is_active = true
  order by e.received_at desc
  limit greatest(coalesce(p_limit, 12), 1);
$$;

grant execute on function public.get_mailbox_context(text, text) to anon, authenticated;
grant execute on function public.get_mailbox_inbox(text, text, integer) to anon, authenticated;

insert into public.user_mailboxes (slug, display_name, inbox_email, access_token)
values (
  'demo-user',
  'Demo User',
  'demo-otp@maildesk.local',
  'change-this-secret-token'
)
on conflict (slug) do nothing;
