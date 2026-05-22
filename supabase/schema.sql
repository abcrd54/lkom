create extension if not exists pgcrypto;

create table if not exists public.user_mailboxes (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  display_name text not null,
  inbox_email text not null unique,
  route_token text not null unique default encode(gen_random_bytes(16), 'hex'),
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
  body_html text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.incoming_emails
  add column if not exists body_html text;

create table if not exists public.mail_processing_logs (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid references public.user_mailboxes(id) on delete set null,
  inbox_email text,
  sender_email text,
  subject text,
  status text not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists incoming_emails_mailbox_id_received_at_idx
  on public.incoming_emails (mailbox_id, received_at desc);

create index if not exists mail_processing_logs_created_at_idx
  on public.mail_processing_logs (created_at desc);

alter table public.user_mailboxes enable row level security;
alter table public.incoming_emails enable row level security;
alter table public.mail_processing_logs enable row level security;

revoke all on public.user_mailboxes from anon, authenticated;
revoke all on public.incoming_emails from anon, authenticated;
revoke all on public.mail_processing_logs from anon, authenticated;

create or replace function public.is_valid_admin_password(
  p_admin_password text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select p_admin_password = 'IkiJeporo1954';
$$;

create or replace function public.get_mailbox_by_route_token(
  p_route_token text
)
returns table (
  mailbox_id uuid,
  display_name text,
  inbox_email text,
  route_token text,
  is_active boolean
)
language sql
security definer
set search_path = public
as $$
  select
    id as mailbox_id,
    display_name,
    inbox_email,
    route_token,
    is_active
  from public.user_mailboxes
  where route_token = p_route_token
    and is_active = true
  limit 1;
$$;

drop function if exists public.get_mailbox_inbox_by_route_token(text, integer);

create or replace function public.get_mailbox_inbox_by_route_token(
  p_route_token text,
  p_limit integer default 12
)
returns table (
  id uuid,
  sender_name text,
  sender_email text,
  subject text,
  preview_text text,
  body_text text,
  body_html text,
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
    e.body_html,
    e.received_at
  from public.user_mailboxes m
  join public.incoming_emails e on e.mailbox_id = m.id
  where m.route_token = p_route_token
    and m.is_active = true
  order by e.received_at desc
  limit greatest(coalesce(p_limit, 12), 1);
$$;

create or replace function public.get_admin_mailboxes(
  p_admin_password text
)
returns table (
  mailbox_id uuid,
  display_name text,
  inbox_email text,
  route_token text,
  is_active boolean,
  total_emails bigint,
  latest_received_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    m.id as mailbox_id,
    m.display_name,
    m.inbox_email,
    m.route_token,
    m.is_active,
    count(e.id) as total_emails,
    max(e.received_at) as latest_received_at
  from public.user_mailboxes m
  left join public.incoming_emails e on e.mailbox_id = m.id
  where public.is_valid_admin_password(p_admin_password)
  group by m.id, m.display_name, m.inbox_email, m.route_token, m.is_active
  order by max(e.received_at) desc nulls last, m.created_at desc;
$$;

drop function if exists public.get_admin_recent_incoming_emails(text, integer);

create or replace function public.get_admin_recent_incoming_emails(
  p_admin_password text,
  p_limit integer default 14
)
returns table (
  id uuid,
  mailbox_id uuid,
  mailbox_name text,
  inbox_email text,
  sender_name text,
  sender_email text,
  subject text,
  preview_text text,
  body_text text,
  body_html text,
  received_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    m.id as mailbox_id,
    m.display_name as mailbox_name,
    m.inbox_email,
    e.sender_name,
    e.sender_email,
    e.subject,
    e.preview_text,
    e.body_text,
    e.body_html,
    e.received_at
  from public.user_mailboxes m
  join public.incoming_emails e on e.mailbox_id = m.id
  where public.is_valid_admin_password(p_admin_password)
  order by e.received_at desc
  limit greatest(coalesce(p_limit, 14), 1);
$$;

create or replace function public.create_admin_mailbox(
  p_admin_password text,
  p_local_part text,
  p_display_name text default null
)
returns table (
  mailbox_id uuid,
  display_name text,
  inbox_email text,
  route_token text,
  is_active boolean,
  total_emails bigint,
  latest_received_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local_part text;
  v_display_name text;
begin
  if not public.is_valid_admin_password(p_admin_password) then
    raise exception 'Password admin salah';
  end if;

  v_local_part := trim(lower(regexp_replace(coalesce(p_local_part, ''), '[^a-z0-9-]+', '-', 'g')));
  v_local_part := regexp_replace(v_local_part, '-{2,}', '-', 'g');
  v_local_part := regexp_replace(v_local_part, '(^-+|-+$)', '', 'g');

  if v_local_part = '' then
    raise exception 'Local part email tidak valid';
  end if;

  v_display_name := coalesce(nullif(trim(p_display_name), ''), replace(initcap(v_local_part), '-', ' '));

  insert into public.user_mailboxes (slug, display_name, inbox_email)
  values (
    v_local_part,
    v_display_name,
    v_local_part || '@lkom.cloud'
  );

  return query
  select
    m.id as mailbox_id,
    m.display_name,
    m.inbox_email,
    m.route_token,
    m.is_active,
    0::bigint as total_emails,
    null::timestamptz as latest_received_at
  from public.user_mailboxes m
  where m.inbox_email = v_local_part || '@lkom.cloud'
  limit 1;
end;
$$;

create or replace function public.bulk_create_admin_mailboxes(
  p_admin_password text,
  p_items jsonb
)
returns table (
  mailbox_id uuid,
  display_name text,
  inbox_email text,
  route_token text,
  is_active boolean,
  total_emails bigint,
  latest_received_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  v_local_part text;
  v_display_name text;
begin
  if not public.is_valid_admin_password(p_admin_password) then
    raise exception 'Password admin salah';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array';
  end if;

  for item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_local_part := trim(lower(regexp_replace(coalesce(item->>'local_part', ''), '[^a-z0-9-]+', '-', 'g')));
    v_local_part := regexp_replace(v_local_part, '-{2,}', '-', 'g');
    v_local_part := regexp_replace(v_local_part, '(^-+|-+$)', '', 'g');

    if v_local_part = '' then
      continue;
    end if;

    v_display_name := coalesce(nullif(trim(item->>'display_name'), ''), replace(initcap(v_local_part), '-', ' '));

    insert into public.user_mailboxes (slug, display_name, inbox_email)
    values (
      v_local_part,
      v_display_name,
      v_local_part || '@lkom.cloud'
    )
    on conflict on constraint user_mailboxes_inbox_email_key do nothing;

    return query
    select
      m.id as mailbox_id,
      m.display_name,
      m.inbox_email,
      m.route_token,
      m.is_active,
      0::bigint as total_emails,
      null::timestamptz as latest_received_at
    from public.user_mailboxes m
    where m.inbox_email = v_local_part || '@lkom.cloud'
    limit 1;
  end loop;
end;
$$;

grant execute on function public.is_valid_admin_password(text) to anon, authenticated;
grant execute on function public.get_mailbox_by_route_token(text) to anon, authenticated;
grant execute on function public.get_mailbox_inbox_by_route_token(text, integer) to anon, authenticated;
grant execute on function public.get_admin_mailboxes(text) to anon, authenticated;
grant execute on function public.get_admin_recent_incoming_emails(text, integer) to anon, authenticated;
grant execute on function public.create_admin_mailbox(text, text, text) to anon, authenticated;
grant execute on function public.bulk_create_admin_mailboxes(text, jsonb) to anon, authenticated;

insert into public.user_mailboxes (slug, display_name, inbox_email)
values (
  'demo-user',
  'Demo User',
  'demo-otp@maildesk.local'
)
on conflict on constraint user_mailboxes_inbox_email_key do nothing;
