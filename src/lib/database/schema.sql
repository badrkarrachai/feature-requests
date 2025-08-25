-- =========================================================
-- Prereqs
-- =========================================================
-- Simple password storage (no hashing for simplicity)
-- Passwords are stored as plain text

-- Create pg_cron extension for scheduled tasks
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron;
  end if;
end $$;

do $$
begin
  -- Drop and recreate the enum types to ensure they have the correct values
  -- This is safe because we're recreating the entire schema
  drop type if exists feature_status cascade;
  create type feature_status as enum ('under_review','planned','in_progress','done');

  drop type if exists user_role cascade;
  create type user_role as enum ('user','admin');
end $$;

-- =========================================================
-- Generic updated_at trigger
-- =========================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =========================================================
-- USERS (single source of truth for identity + role)
-- =========================================================
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  image_url     text,
  role          user_role not null default 'user',
  password_hash text,                                 -- plain text password (required only for admins)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_email_lowercase check (email = lower(email)),
  constraint admin_has_password check (
    (role <> 'admin') or (password_hash is not null)
  )
);

drop trigger if exists trg_users_updated on public.users;
create trigger trg_users_updated
before update on public.users
for each row execute procedure public.set_updated_at();

-- =========================================================
-- FEATURES / VOTES / COMMENTS (all reference users)
-- =========================================================
create table if not exists public.features (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete restrict,
  title           text not null,
  description     text not null,
  status          feature_status not null default 'under_review',
  votes_count     int  not null default 0,
  comments_count  int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists features_user_lower_title_uniq
  on public.features (user_id, (lower(title)));

drop trigger if exists trg_features_updated on public.features;
create trigger trg_features_updated
before update on public.features
for each row execute procedure public.set_updated_at();

create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (feature_id, user_id)
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

-- =========================================================
-- NOTIFICATIONS SYSTEM (integrated with main schema)
-- =========================================================
create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade, -- recipient
  type             text not null check (type in ('comment','status_change','feature_deleted','vote')),
  title            text not null,
  message          text not null,
  feature_id       uuid references public.features(id) on delete set null,      -- keep rows even if feature is deleted
  comment_id       uuid,
  -- grouping
  group_key        text,
  group_count      integer not null default 1,
  latest_actor_id  uuid references public.users(id) on delete set null,         -- last user who caused the grouped notif
  read             boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Notifications indexes
create index if not exists idx_notifications_user_id            on public.notifications(user_id);
create index if not exists idx_notifications_user_read          on public.notifications(user_id, read) where read = false;
create index if not exists idx_notifications_feature_id         on public.notifications(feature_id);
create index if not exists idx_notifications_created_at         on public.notifications(created_at desc);
create index if not exists idx_notifications_user_type          on public.notifications(user_id, type);
create index if not exists idx_notifications_group_key          on public.notifications(group_key);
create index if not exists idx_notifications_feature_type       on public.notifications(feature_id, type);

-- =========================================================
-- Counters: votes_count / comments_count
-- =========================================================
create or replace function public.sync_votes_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.features set votes_count = votes_count + 1 where id = new.feature_id;
  elsif tg_op = 'DELETE' then
    update public.features set votes_count = greatest(votes_count - 1, 0) where id = old.feature_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_votes_sync on public.votes;
create trigger trg_votes_sync
after insert or delete on public.votes
for each row execute procedure public.sync_votes_count();

create or replace function public.sync_comments_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.features set comments_count = comments_count + 1 where id = new.feature_id;
  elsif tg_op = 'DELETE' then
    update public.features set comments_count = greatest(comments_count - 1, 0) where id = old.feature_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_comments_sync on public.comments;
create trigger trg_comments_sync
after insert or delete on public.comments
for each row execute procedure public.sync_comments_count();

-- Notifications updated_at trigger
create trigger update_notifications_updated_at
  before update on public.notifications
  for each row
  execute function public.set_updated_at();

-- =========================================================
-- RLS: Public read; write only via RPC functions
-- (no JWT required; RPC sets internal flags)
-- =========================================================
alter table public.users       enable row level security;
alter table public.features    enable row level security;
alter table public.votes       enable row level security;
alter table public.comments    enable row level security;
alter table public.notifications enable row level security;

-- Clear old policies if any
do $$
begin
  perform 1 from pg_policies where schemaname='public' and tablename='users';
  if found then
    drop policy if exists users_select on public.users;
    drop policy if exists users_write_authorized on public.users;
  end if;

  perform 1 from pg_policies where schemaname='public' and tablename='features';
  if found then
    drop policy if exists features_select on public.features;
    drop policy if exists features_write_authorized on public.features;
  end if;

  perform 1 from pg_policies where schemaname='public' and tablename='votes';
  if found then
    drop policy if exists votes_select on public.votes;
    drop policy if exists votes_write_authorized on public.votes;
    drop policy if exists votes_delete_owner on public.votes;
  end if;

  perform 1 from pg_policies where schemaname='public' and tablename='comments';
  if found then
    drop policy if exists comments_select on public.comments;
    drop policy if exists comments_insert_authorized on public.comments;
    drop policy if exists comments_delete_owner_or_admin on public.comments;
  end if;

  perform 1 from pg_policies where schemaname='public' and tablename='notifications';
  if found then
    drop policy if exists notifications_select on public.notifications;
  end if;
end $$;

-- Everyone can read
create policy users_select        on public.users       for select using (true);
create policy features_select     on public.features    for select using (true);
create policy votes_select        on public.votes       for select using (true);
create policy comments_select     on public.comments    for select using (true);
create policy notifications_select on public.notifications for select using (true);

-- Helper GUC-based authorization (set only inside SECURITY DEFINER RPCs)
-- app.authorized = 'true' → allow write
-- app.user_id    = '<uuid>' of the acting user
-- app.admin      = 'true' if the acting user is admin
create or replace function public.app_activate(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.authorized','true', true);
  perform set_config('app.user_id', p_user_id::text, true);
  perform set_config('app.admin', case when p_is_admin then 'true' else 'false' end, true);
end;
$$;

-- Writes only when RPC set app.authorized
create policy users_write_authorized on public.users
for all
using (current_setting('app.authorized', true) = 'true')
with check (current_setting('app.authorized', true) = 'true');

create policy features_write_authorized on public.features
for all
using (current_setting('app.authorized', true) = 'true')
with check (current_setting('app.authorized', true) = 'true');

create policy votes_write_authorized on public.votes
for insert with check (current_setting('app.authorized', true) = 'true');

create policy votes_delete_owner on public.votes
for delete using (
  current_setting('app.authorized', true) = 'true'
  and (
    (user_id::text = current_setting('app.user_id', true))
    or current_setting('app.admin', true) = 'true'
  )
);

create policy comments_insert_authorized on public.comments
for insert with check (current_setting('app.authorized', true) = 'true');

create policy comments_delete_owner_or_admin on public.comments
for delete using (
  current_setting('app.authorized', true) = 'true'
  and (
    (user_id::text = current_setting('app.user_id', true))
    or current_setting('app.admin', true) = 'true'
  )
);

-- =========================================================
-- RPC: user upsert + admin helpers (no JWT needed)
-- =========================================================
create or replace function public.ensure_user(
  p_email     text,
  p_name      text,
  p_image_url text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  p_email := lower(trim(p_email));
  if coalesce(p_email,'') = '' then
    raise exception 'email is required';
  end if;

  -- Validate that name is provided and not empty
  if coalesce(p_name,'') = '' then
    raise exception 'name is required and cannot be empty';
  end if;

  insert into public.users (email, name, image_url)
  values (p_email, p_name, p_image_url)
  on conflict (email) do update
    set name = excluded.name,
        image_url = coalesce(excluded.image_url, public.users.image_url),
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- Create or promote an admin (sets password as plain text)
create or replace function public.admin_upsert(
  p_email     text,
  p_name      text,
  p_image_url text,
  p_password  text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(p_password,'') = '' then
    raise exception 'password required for admin';
  end if;

  v_id := public.ensure_user(p_email, p_name, p_image_url);

  update public.users
     set role = 'admin',
         password_hash = p_password,  -- Store as plain text
         updated_at = now()
   where id = v_id;

  return v_id;
end;
$$;

-- Internal: verify an admin email+password, return id (plain text comparison)
create or replace function public.verify_admin_return_id(
  p_email    text,
  p_password text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
       v_stored_password text;
begin
  select id, password_hash
    into v_id, v_stored_password
    from public.users
   where email = lower(trim(p_email)) and role = 'admin';

  if v_id is null then
    raise exception 'admin user not found';
  end if;

  if v_stored_password is null then
    raise exception 'admin password not set';
  end if;

  -- Simple plain text password comparison
  if v_stored_password != p_password then
    raise exception 'invalid admin password';
  end if;

  return v_id;
end;
$$;

-- =========================================================
-- RPC: Public create/toggle/comment (caller passes email/name/image)
-- =========================================================
create or replace function public.create_feature(
  p_email       text,
  p_name        text,
  p_image_url   text,
  p_title       text,
  p_description text
) returns public.features
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
        v_row  public.features;
begin
  if coalesce(p_title,'') = '' or coalesce(p_description,'') = '' then
    raise exception 'title and description are required';
  end if;

  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false);

  insert into public.features (user_id, title, description)
  values (v_user, p_title, p_description)
  returning * into v_row;

  -- Auto-vote by the creator
  insert into public.votes (user_id, feature_id)
  values (v_user, v_row.id);

  return v_row;
end;
$$;

create or replace function public.toggle_vote(
  p_email     text,
  p_name      text,
  p_image_url text,
  p_feature_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
        v_exists boolean;
begin
  -- validate feature exists
  if not exists (select 1 from public.features f where f.id = p_feature_id) then
    raise exception 'feature not found';
  end if;

  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false);

  select true into v_exists
  from public.votes
  where feature_id = p_feature_id and user_id = v_user;

  if v_exists then
    delete from public.votes where feature_id = p_feature_id and user_id = v_user;
    return 'removed';
  else
    insert into public.votes (feature_id, user_id) values (p_feature_id, v_user);
    return 'added';
  end if;
end;
$$;

create or replace function public.add_comment(
  p_email      text,
  p_name       text,
  p_image_url  text,
  p_feature_id uuid,
  p_content    text
) returns public.comments
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
        v_row  public.comments;
begin
  if coalesce(p_content,'') = '' then
    raise exception 'content required';
  end if;

  if not exists (select 1 from public.features where id = p_feature_id) then
    raise exception 'feature not found';
  end if;

  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false);

  insert into public.comments (user_id, feature_id, content)
  values (v_user, p_feature_id, p_content)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_comment_by_owner(
  p_email      text,
  p_comment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid;
        v_cnt  int;
begin
  v_user := public.ensure_user(p_email, null, null);
  perform public.app_activate(v_user, false);

  delete from public.comments
  where id = p_comment_id
    and user_id = v_user;

  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

-- =========================================================
-- NOTIFICATION FUNCTIONS
-- =========================================================

-- Create/Group notification helpers (UUID-based)
create or replace function public.create_grouped_notification(
  p_user_id         uuid,              -- recipient
  p_type            text,
  p_title           text,
  p_message         text,
  p_feature_id      uuid default null,
  p_trigger_user_id uuid default null  -- actor
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  notification_id       uuid;
  group_key_val         text;
  existing_notification record;
  actor_name            text;
begin
  group_key_val := p_type || '_' || coalesce(p_feature_id::text, 'general');
  actor_name := coalesce((select u.name from public.users u where u.id = p_trigger_user_id), 'Someone');

  select * into existing_notification
  from public.notifications
  where group_key = group_key_val
    and user_id   = p_user_id
    and type      = p_type
    and feature_id is not distinct from p_feature_id
    and read = false
  limit 1;

  if existing_notification.id is not null then
    update public.notifications
       set group_count     = existing_notification.group_count + 1,
           latest_actor_id = p_trigger_user_id,
           updated_at      = now(),
           title           = p_title,
           message         = case
                               when existing_notification.group_count = 1
                                 then actor_name || ' and 1 other voted on your feature request'
                               else actor_name || ' and ' || existing_notification.group_count || ' others voted on your feature request'
                             end
     where id = existing_notification.id
     returning id into notification_id;
  else
    insert into public.notifications (
      user_id, type, title, message, feature_id, group_key, group_count, latest_actor_id
    ) values (
      p_user_id,
      p_type,
      coalesce(p_title, 'Notification'),
      coalesce(
        p_message,
        case when p_type = 'vote'
             then actor_name || ' voted on your feature request'
             else 'You have a new notification'
        end
      ),
      p_feature_id,
      group_key_val,
      1,
      p_trigger_user_id
    )
    returning id into notification_id;
  end if;

  return notification_id;
end;
$$;

create or replace function public.create_notification(
  p_user_id     uuid,
  p_type        text,
  p_title       text,
  p_message     text,
  p_feature_id  uuid default null,
  p_comment_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare notification_id uuid;
begin
  insert into public.notifications (user_id, type, title, message, feature_id, comment_id)
  values (p_user_id, p_type, p_title, p_message, p_feature_id, p_comment_id)
  returning id into notification_id;

  return notification_id;
end;
$$;

-- Query helpers (email → user_id to keep "no auth/JWT" ergonomics)
create or replace function public.get_unread_notification_count(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  unread_count integer := 0;
begin
  select u.id into v_user_id from public.users u where u.email = lower(trim(p_email));
  if v_user_id is null then
    return 0;
  end if;

  select count(*) into unread_count
  from public.notifications
  where user_id = v_user_id and read = false;

  return unread_count;
end;
$$;

create or replace function public.mark_all_notifications_read(p_email text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  updated_count integer := 0;
begin
  select u.id into v_user_id from public.users u where u.email = lower(trim(p_email));
  if v_user_id is null then
    return 0;
  end if;

  update public.notifications
     set read = true, updated_at = now()
   where user_id = v_user_id
     and read = false;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- List notifications for an email (pagination)
create or replace function public.list_notifications(
  p_email  text,
  p_limit  integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  type text,
  title text,
  message text,
  feature_id uuid,
  comment_id uuid,
  group_key text,
  group_count integer,
  latest_actor_name text,
  feature_title text,
  read boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid;
begin
  select u.id into v_user_id from public.users u where u.email = lower(trim(p_email));
  return query
    select
      n.id,
      n.type,
      n.title,
      n.message,
      n.feature_id,
      n.comment_id,
      n.group_key,
      n.group_count,
      coalesce(u.name, 'Someone') as latest_actor_name,
      (select f.title from public.features f where f.id = n.feature_id) as feature_title,
      n.read,
      n.created_at,
      n.updated_at
    from public.notifications n
    left join public.users u on u.id = n.latest_actor_id
    where n.user_id = v_user_id
    order by n.created_at desc
    limit p_limit offset p_offset;
end;
$$;

-- Notification triggers
create or replace function public.notify_on_feature_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare status_name text;
begin
  if old.status = new.status then
    return new;
  end if;

  status_name := case new.status
                   when 'under_review' then 'Under Review'
                   when 'planned'      then 'Planned'
                   when 'in_progress'  then 'In Progress'
                   when 'done'         then 'Complete'
                   else new.status
                 end;

  perform public.create_notification(
    new.user_id,
    'status_change',
    'Your feature request status was updated',
    'Your feature request "' || new.title || '" was moved to ' || status_name,
    new.id,
    null
  );

  return new;
end;
$$;

create or replace function public.notify_on_new_vote()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare owner_id uuid;
begin
  select f.user_id into owner_id from public.features f where f.id = new.feature_id;

  -- skip if voter is the owner
  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  perform public.create_grouped_notification(
    owner_id,
    'vote',
    'Your feature request got a new vote',
    'New votes on your feature request',
    new.feature_id,
    new.user_id
  );

  return new;
end;
$$;

create or replace function public.notify_on_feature_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Note: notifications.feature_id is set null on feature delete,
  -- so the notification persists as an audit record.
  perform public.create_notification(
    old.user_id,
    'feature_deleted',
    'Your feature request was removed',
    'Your feature request "' || old.title || '" was removed by an admin.',
    old.id,
    null
  );
  return old;
end;
$$;

-- Notification triggers
create trigger trigger_feature_status_change_notification
  after update on public.features
  for each row
  execute function public.notify_on_feature_status_change();

create trigger trigger_new_vote_notification
  after insert on public.votes
  for each row
  execute function public.notify_on_new_vote();

create trigger trigger_feature_deleted_notification
  before delete on public.features
  for each row
  execute function public.notify_on_feature_deleted();

-- Cleanup function (older than 30 days AND read)
create or replace function public.cleanup_old_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
  cutoff_date   timestamptz := now() - interval '30 days';
begin
  delete from public.notifications
   where read = true
     and created_at < cutoff_date;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Schedule daily cleanup at 02:00 (idempotent)
do $$
declare v_jobid bigint;
begin
  -- if pg_cron is present, unschedule any existing job with this name
  if to_regclass('cron.job') is not null then
    select jobid into v_jobid from cron.job where jobname = 'cleanup-old-notifications';
    if v_jobid is not null then
      perform cron.unschedule(v_jobid);
    end if;
  end if;

  -- recreate the job (command must be a plain string)
  perform cron.schedule(
    'cleanup-old-notifications',
    '0 2 * * *',
    'select public.cleanup_old_notifications();'
  );
end;
$$;

-- =========================================================
-- RPC: Admin actions (email + password required, no JWT)
-- =========================================================
create or replace function public.admin_update_feature_status(
  p_admin_email text,
  p_password    text,
  p_feature_id  uuid,
  p_new_status  feature_status
) returns public.features
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid;
        v_row   public.features;
begin
  v_admin := public.verify_admin_return_id(p_admin_email, p_password);
  perform public.app_activate(v_admin, true);

  update public.features
     set status = p_new_status,
         updated_at = now()
   where id = p_feature_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'feature not found';
  end if;
  return v_row;
end;
$$;

create or replace function public.admin_delete_feature(
  p_admin_email text,
  p_password    text,
  p_feature_id  uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid;
        v_cnt   int;
begin
  v_admin := public.verify_admin_return_id(p_admin_email, p_password);
  perform public.app_activate(v_admin, true);

  delete from public.features where id = p_feature_id;
  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

create or replace function public.admin_delete_comment(
  p_admin_email text,
  p_password    text,
  p_comment_id  uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid;
        v_cnt   int;
begin
  v_admin := public.verify_admin_return_id(p_admin_email, p_password);
  perform public.app_activate(v_admin, true);

  delete from public.comments where id = p_comment_id;
  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

-- =========================================================
-- Public views for easy reads (author fields included)
-- =========================================================
create or replace view public.features_public with (security_invoker = on) as
select
  f.id,
  f.user_id,                            -- ADD THIS
  f.title, f.description, f.status,
  f.votes_count, f.comments_count,
  f.created_at, f.updated_at,
  u.name  as author_name,
  u.email as author_email,
  u.image_url as author_image_url
from public.features f
join public.users u on u.id = f.user_id;


create or replace view public.comments_public with (security_invoker = on) as
select
  c.id, c.feature_id, c.content, c.created_at,
  u.name as author_name, u.email as author_email, u.image_url as author_image_url
from public.comments c
join public.users u on u.id = c.user_id;

-- Notifications public view
create or replace view public.notifications_public with (security_invoker = on) as
select
  n.id, n.user_id, n.type, n.title, n.message, n.feature_id, n.comment_id,
  n.group_key, n.group_count,
  n.latest_actor_id,
  (select u.name  from public.users u where u.id = n.latest_actor_id) as latest_actor_name,
  (select u.email from public.users u where u.id = n.latest_actor_id) as latest_actor_email,
  (select f.title from public.features f where f.id = n.feature_id)   as feature_title,
  n.read, n.created_at, n.updated_at
from public.notifications n;

-- =========================================================
-- RLS: Public read; write only via RPC functions
-- (no JWT required; RPC sets internal flags)
-- =========================================================
grant usage on schema public to anon, authenticated;
grant select on public.features, public.votes, public.comments, public.users, public.notifications to anon, authenticated;
grant select on public.features_public, public.comments_public, public.notifications_public to anon, authenticated;

grant execute on function
  public.ensure_user(text,text,text),
  public.admin_upsert(text,text,text,text),
  public.verify_admin_return_id(text,text),
  public.app_activate(uuid,boolean),
  public.create_feature(text,text,text,text,text),
  public.toggle_vote(text,text,text,uuid),         -- fixed: 4 args
  public.add_comment(text,text,text,uuid,text),
  public.delete_comment_by_owner(text,uuid),
  public.admin_update_feature_status(text,text,uuid,feature_status),
  public.admin_delete_feature(text,text,uuid),
  public.admin_delete_comment(text,text,uuid),
  -- Notification functions
  public.create_grouped_notification(uuid,text,text,text,uuid,uuid),
  public.create_notification(uuid,text,text,text,uuid,uuid),
  public.get_unread_notification_count(text),
  public.mark_all_notifications_read(text),
  public.cleanup_old_notifications(),
  public.notify_on_feature_status_change(),
  public.notify_on_new_vote(),
  public.notify_on_feature_deleted(),
  public.list_notifications(text,integer,integer)
to anon, authenticated;

-- =========================================================
-- OPTIONAL: migrate from old schema if you had name/email in rows
-- (Run only once, then drop legacy columns.)
-- =========================================================
-- Example (adjust source columns if they exist):
-- insert into public.users (email, name)
-- select lower(email), max(name)
-- from (
--   select email, name from public.features
--   union all
--   select email, name from public.votes
--   union all
--   select email, name from public.comments
-- ) s
-- where email is not null and name is not null
-- on conflict (email) do nothing;
--
-- update public.features f set user_id = u.id
-- from public.users u
-- where f.user_id is null and lower(f.email) = u.email;
--
-- update public.votes v set user_id = u.id
-- from public.users u
-- where v.user_id is null and lower(v.email) = u.email;
--
-- update public.comments c set user_id = u.id
-- from public.users u
-- where c.user_id is null and lower(c.email) = u.email;
--
-- -- After verifying data, you can drop legacy columns:
-- -- alter table public.features  drop column if exists name, drop column if exists email;
-- -- alter table public.votes     drop column if exists name, drop column if exists email;
-- -- alter table public.comments  drop column if exists name, drop column if exists email;
-- supabase client with anon key (server or client as you prefer)
-- create feature
--const { data: feature } = await supabase.rpc('create_feature', {
--  p_email: userEmail,
--  p_name: userName,
--  p_image_url: userImageUrl,
--  p_title: title,
--  p_description: description,
--});

-- vote toggle
--const { data: action } = await supabase.rpc('toggle_vote', {
--  p_email: userEmail,
--  p_name: userName,
--  p_image_url: userImageUrl,
--  p_feature_id: featureId,
--});

-- add comment
--await supabase.rpc('add_comment', {
--  p_email: userEmail,
--  p_name: userName,
--  p_image_url: userImageUrl,
--  p_feature_id: featureId,
--  p_content: commentText,
--});

-- admin: create/promote and set password once
--await supabase.rpc('admin_upsert', {
--  p_email: adminEmail,
--  p_name: adminName,
--  p_image_url: adminImageUrl,
--  p_password: plaintextPassword,
--});

-- admin: update status / delete
--await supabase.rpc('admin_update_feature_status', {
--  p_admin_email: adminEmail,
--  p_password: plaintextPassword,
--  p_feature_id: featureId,
--  p_new_status: 'in_progress',
--});

--await supabase.rpc('admin_delete_feature', {
--  p_admin_email: adminEmail,
--  p_password: plaintextPassword,
--  p_feature_id: featureId,
--});

-- =========================================================
-- SETUP COMPLETE MESSAGE
-- =========================================================
do $$
begin
  raise notice '🎉 FEATURE REQUEST SYSTEM WITH NOTIFICATIONS - SETUP COMPLETE!';
  raise notice '✅ Users table with UUID-based identity';
  raise notice '✅ Features, votes, comments with proper relationships';
  raise notice '✅ Complete notifications system integrated';
  raise notice '✅ Auto-vote on feature creation';
  raise notice '✅ All RPC functions and triggers configured';
  raise notice '✅ Row Level Security properly configured';
  raise notice '✅ Ready for production use';
end $$;


-- ===========================================
-- 1) Statuses lookup table + seed
-- ===========================================
create table if not exists public.statuses (
  id          smallint primary key,
  slug        text not null unique,
  label       text not null,
  sort_order  smallint not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint statuses_slug_format check (slug ~ '^[a-z0-9_]+$')
);

create or replace function public._statuses_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now(); return new;
end $$;

drop trigger if exists trg_statuses_updated on public.statuses;
create trigger trg_statuses_updated
before update on public.statuses
for each row execute procedure public._statuses_touch_updated_at();

insert into public.statuses (id, slug, label, sort_order) values
  (1,'under_review','Under Review',10),
  (2,'planned','Planned',20),
  (3,'in_progress','In Progress',30),
  (4,'done','Done',40)
on conflict (id) do nothing;

-- optional: expose to clients like the other tables
grant select on public.statuses to anon, authenticated;
alter table public.statuses enable row level security;
drop policy if exists statuses_select on public.statuses;
create policy statuses_select on public.statuses for select using (true);

-- ===========================================
-- 2) Add new FK column to features and backfill
-- ===========================================
alter table public.features add column if not exists status_id smallint;

-- backfill using the OLD enum column (cast to text)
update public.features f
set status_id = s.id
from public.statuses s
where f.status_id is null and s.slug = f.status::text;

-- constraints + default (1 = under_review)
alter table public.features
  alter column status_id set not null,
  alter column status_id set default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'features_status_fk'
  ) then
    alter table public.features
      add constraint features_status_fk
      foreign key (status_id) references public.statuses(id);
  end if;
end$$;

-- helpful index for filters
create index if not exists idx_features_status_id on public.features(status_id);

-- ===========================================
-- 3) Rebuild the status-change trigger to use status_id
-- ===========================================
drop trigger if exists trigger_feature_status_change_notification on public.features;
drop function if exists public.notify_on_feature_status_change();

create or replace function public.notify_on_feature_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare status_name text;
begin
  if old.status_id = new.status_id then
    return new;
  end if;

  select label into status_name from public.statuses where id = new.status_id;

  perform public.create_notification(
    new.user_id,
    'status_change',
    'Your feature request status was updated',
    'Your feature request "' || new.title || '" was moved to ' || coalesce(status_name,'(unknown)'),
    new.id,
    null
  );

  return new;
end;
$$;

create trigger trigger_feature_status_change_notification
  after update on public.features
  for each row execute function public.notify_on_feature_status_change();

-- ===========================================
-- 4) Replace the admin_update_feature_status RPC
--    (accepts text slug like 'under_review' or 'Under Review')
-- ===========================================
drop function if exists public.admin_update_feature_status(text,text,uuid,feature_status);

create or replace function public.admin_update_feature_status(
  p_admin_email text,
  p_password    text,
  p_feature_id  uuid,
  p_new_status  text         -- slug, any case/with spaces ok
) returns public.features
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
  v_row   public.features;
  v_slug  text;
  v_status_id smallint;
begin
  v_admin := public.verify_admin_return_id(p_admin_email, p_password);
  perform public.app_activate(v_admin, true);

  -- normalize: "Under Review" -> "under_review"
  v_slug := replace(lower(trim(p_new_status)), ' ', '_');

  select id into v_status_id from public.statuses where slug = v_slug;
  if v_status_id is null then
    raise exception 'invalid status slug: % (must be one of under_review, planned, in_progress, done)', p_new_status;
  end if;

  update public.features
     set status_id  = v_status_id,
         updated_at = now()
   where id = p_feature_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'feature not found';
  end if;
  return v_row;
end;
$$;

grant execute on function public.admin_update_feature_status(text,text,uuid,text)
to anon, authenticated;

-- ===========================================
-- 5) Replace features_public view so UI still sees `status` as slug
-- ===========================================
drop view if exists public.features_public;

create view public.features_public with (security_invoker = on) as
select
  f.id,
  f.user_id,
  f.title,
  f.description,
  s.slug  as status,        -- <== same name your UI expects
  s.label as status_label,  -- nice to have
  f.votes_count,
  f.comments_count,
  f.created_at,
  f.updated_at,
  u.name       as author_name,
  u.email      as author_email,
  u.image_url  as author_image_url
from public.features f
join public.users u on u.id = f.user_id
join public.statuses s on s.id = f.status_id;

-- ===========================================
-- 6) Drop the old enum column + type (after everything depends on status_id)
-- ===========================================
alter table public.features drop column if exists status;

do $$
begin
  if exists (select 1 from pg_type where typname = 'feature_status') then
    drop type feature_status;
  end if;
end $$;






-- ==========================================
-- SUPABASE TRENDS SYSTEM (Full, Fixed)
-- ==========================================
-- - Keeps history (unique per metric + window)
-- - Robust % change (symmetric fallback when previous=0)
-- - 7 FULL local days windows (Africa/Casablanca), half-open [start, end)
-- - RLS read-only exposure, hardened view (security_invoker + security_barrier)
-- - Hourly pg_cron job (idempotent), plus initial run
-- ==========================================

-- 0) Extensions (no-op if present)
create extension if not exists pgcrypto;
create extension if not exists pg_cron;

-- 1) Trends table (+ constraints & indexes)
create table if not exists public.trends (
  id              uuid primary key default gen_random_uuid(),
  metric_name     text         not null,
  current_value   integer      not null,
  previous_value  integer      not null,
  trend_percent   numeric(7,2) not null,
  period_start    timestamptz  not null,
  period_end      timestamptz  not null,
  computed_at     timestamptz  not null default now(),
  constraint trends_period_nonempty check (period_end > period_start)
);

-- Unique per metric+window → safe upserts
create unique index if not exists trends_metric_window_uq
  on public.trends (metric_name, period_start, period_end);

-- Common read-path indexes
create index if not exists trends_metric_computed_desc_idx
  on public.trends (metric_name, computed_at desc);

create index if not exists trends_period_end_idx
  on public.trends (period_end desc);

comment on table public.trends is
  'Historical metric snapshots for UI analytics (7-day rolling windows, local-time aligned).';

-- 2) Best-practice % change with symmetric fallback when previous = 0
create or replace function public.calculate_trend_percentage(
  p_current  integer,
  p_previous integer
) returns numeric(7,2)
language plpgsql
immutable
as $$
declare
  num numeric;
begin
  if coalesce(p_current,0) = 0 and coalesce(p_previous,0) = 0 then
    return 0.00;
  end if;

  if p_previous = 0 then
    num := 200.0 * (p_current::numeric - p_previous::numeric)
                / nullif(p_current::numeric + p_previous::numeric, 0);
    return round(num, 2);
  end if;

  return round(((p_current - p_previous)::numeric / p_previous::numeric) * 100, 2);
end;
$$;

comment on function public.calculate_trend_percentage(integer, integer)
  is 'Returns percent change; falls back to symmetric % when previous=0 to avoid divide-by-zero/infinite values.';

-- 3) Helpful read indexes on source tables
-- (Skip if you already have them)
create index if not exists features_created_at_idx on public.features (created_at);
create index if not exists votes_created_at_idx    on public.votes    (created_at);
create index if not exists comments_created_at_idx on public.comments (created_at);

-- 4) Entrypoint: recompute last 7 FULL local days and upsert
create or replace function public.refresh_trends(retention_days integer default 365)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text := 'Africa/Casablanca';
  now_utc           timestamptz := now();
  local_now         timestamp;
  local_today_start timestamp;

  current_start   timestamptz;
  current_end     timestamptz;
  previous_start  timestamptz;
  previous_end    timestamptz;

  cur_features    integer;
  prv_features    integer;
  cur_votes       integer;
  prv_votes       integer;
  cur_comments    integer;
  prv_comments    integer;

  tr_features     numeric(7,2);
  tr_votes        numeric(7,2);
  tr_comments     numeric(7,2);
begin
  -- Anchor to local midnight so we compare FULL days only
  local_now := now_utc AT TIME ZONE tz;
  local_today_start := date_trunc('day', local_now);

  current_end   := local_today_start AT TIME ZONE tz;                -- [start, end)
  current_start := (local_today_start - interval '7 days') AT TIME ZONE tz;

  previous_end   := current_start;
  previous_start := previous_end - interval '7 days';

  -- Current window counts
  select count(*) into cur_features from public.features
   where created_at >= current_start and created_at < current_end;

  select count(*) into cur_votes from public.votes
   where created_at >= current_start and created_at < current_end;

  select count(*) into cur_comments from public.comments
   where created_at >= current_start and created_at < current_end;

  -- Previous window counts
  select count(*) into prv_features from public.features
   where created_at >= previous_start and created_at < previous_end;

  select count(*) into prv_votes from public.votes
   where created_at >= previous_start and created_at < previous_end;

  select count(*) into prv_comments from public.comments
   where created_at >= previous_start and created_at < previous_end;

  -- Trend math
  tr_features := public.calculate_trend_percentage(cur_features, prv_features);
  tr_votes    := public.calculate_trend_percentage(cur_votes,    prv_votes);
  tr_comments := public.calculate_trend_percentage(cur_comments, prv_comments);

  -- Upsert per metric (idempotent for the window)
  insert into public.trends (metric_name, current_value, previous_value, trend_percent, period_start, period_end)
  values
    ('total_features', cur_features, prv_features, tr_features, current_start, current_end),
    ('total_votes',    cur_votes,    prv_votes,    tr_votes,    current_start, current_end),
    ('total_comments', cur_comments, prv_comments, tr_comments, current_start, current_end)
  on conflict (metric_name, period_start, period_end)
  do update set
    current_value  = excluded.current_value,
    previous_value = excluded.previous_value,
    trend_percent  = excluded.trend_percent,
    computed_at    = now();

  -- Housekeeping: keep only the last N days of history
  delete from public.trends
  where period_end < (now_utc - make_interval(days => retention_days));
end;
$$;

comment on function public.refresh_trends(integer)
  is 'Recompute last 7 FULL local days, upsert per metric window, purge rows older than retention_days.';

-- 5) Hardened view for UI (invoker semantics + barrier)
create or replace view public.trends_latest
  with (security_invoker = true, security_barrier = true) as
with ranked as (
  select t.id,
         t.metric_name,
         t.current_value,
         t.previous_value,
         t.trend_percent,
         t.period_start,
         t.period_end,
         t.computed_at,
         row_number() over (
           partition by t.metric_name
           order by t.period_end desc, t.computed_at desc
         ) as rn
  from public.trends t
)
select id, metric_name, current_value, previous_value, trend_percent,
       period_start, period_end, computed_at
from ranked
where rn = 1;

-- Optional helper for API
create or replace function public.get_latest_trends()
returns table (
  metric_name    text,
  current_value  integer,
  previous_value integer,
  trend_percent  numeric(7,2),
  period_start   timestamptz,
  period_end     timestamptz,
  computed_at    timestamptz
) language sql stable as $$
  select metric_name, current_value, previous_value, trend_percent,
         period_start, period_end, computed_at
  from public.trends_latest
  order by metric_name;
$$;

-- 6) RLS: read-only exposure for clients
alter table public.trends enable row level security;

-- CREATE POLICY does not support IF NOT EXISTS → use drop+create idempotently
drop policy if exists trends_read_all on public.trends;
create policy trends_read_all on public.trends
  for select
  using (true);

-- Grants (adjust to your roles as needed)
grant select on public.trends            to anon, authenticated;
grant select on public.trends_latest     to anon, authenticated;
grant execute on function public.get_latest_trends() to anon, authenticated;
-- Note: refresh_trends() is SECURITY DEFINER; called via pg_cron below.
-- You can omit granting it to anon/authenticated.

-- 7) pg_cron: idempotent hourly job at minute 7 (UTC)
--    Safe quoting with dollar-tags; no DO-block quoting conflicts.
create extension if not exists pg_cron;

-- Remove existing job (if any)
select cron.unschedule(jobid)
from cron.job
where jobname = 'trends_hourly';

-- Create fresh job
select cron.schedule(
  'trends_hourly',
  '7 * * * *',
  $job$SELECT public.refresh_trends();$job$
);

-- 8) Seed once so UI has data immediately
select public.refresh_trends();

-- 9) Quick checks (optional)
-- select jobid, jobname, schedule, command from cron.job where jobname='trends_hourly';
-- select * from public.trends_latest order by metric_name;
-- select * from public.trends order by period_end desc, metric_name;
