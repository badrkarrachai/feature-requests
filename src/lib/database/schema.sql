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

create extension if not exists pgcrypto with schema extensions;


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

alter table public.notifications
  add column if not exists read_at timestamptz;

-- Notifications indexes
create index if not exists idx_notifications_user_id            on public.notifications(user_id);
create index if not exists idx_notifications_user_read          on public.notifications(user_id, read) where read = false;
create index if not exists idx_notifications_feature_id         on public.notifications(feature_id);
create index if not exists idx_notifications_created_at         on public.notifications(created_at desc);
create index if not exists idx_notifications_user_type          on public.notifications(user_id, type);
create index if not exists idx_notifications_group_key          on public.notifications(group_key);
create index if not exists idx_notifications_feature_type       on public.notifications(feature_id, type);
create index if not exists notifications_read_at_idx            on public.notifications (read, read_at);



create or replace function public.set_read_at()
returns trigger language plpgsql as $$
begin
  if new.read = true
     and (old.read is distinct from true)
     and new.read_at is null then
    new.read_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_notifications_read_at on public.notifications;
create trigger trg_notifications_read_at
before update on public.notifications
for each row execute procedure public.set_read_at();

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

create or replace function public.admin_change_password(
  p_admin_email text,
  p_old_password text,
  p_new_password text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_admin_id uuid;
begin
  if coalesce(p_new_password,'') = '' then
    raise exception 'new password required';
  end if;

  v_admin_id := public.verify_admin_return_id(p_admin_email, p_old_password);

  update public.users
     set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_admin_id;

  return true;
end;
$$;


grant execute on function public.admin_change_password(text,text,text)
to anon, authenticated;


-- Create or promote an admin (sets password as plain text)
create or replace function public.admin_upsert(
  p_email     text,
  p_name      text,
  p_image_url text,
  p_password  text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if coalesce(p_password,'') = '' then
    raise exception 'password required for admin';
  end if;

  v_id := public.ensure_user(p_email, p_name, p_image_url);

  update public.users
     set role = 'admin',
         -- bcrypt (default cost)
         password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
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
set search_path = public, extensions
as $$
declare v_id uuid;
begin
  -- bcrypt check: crypt(input, stored_hash) = stored_hash
  select u.id
    into v_id
    from public.users u
   where u.email = lower(trim(p_email))
     and u.role = 'admin'
     and u.password_hash is not null
     and u.password_hash = extensions.crypt(p_password, u.password_hash);

  if v_id is null then
    raise exception 'invalid admin credentials';
  end if;

  return v_id;
end;
$$;

-- Lock down the base users table
revoke select on public.users from anon, authenticated;

-- Drop the open read policy (it’s not needed if clients read the view)
drop policy if exists users_select on public.users;

-- (Belt & suspenders) If you ever re-grant table access, keep the hash hidden:
revoke select (password_hash) on public.users from anon, authenticated;

-- A safe view (no password_hash)
create or replace view public.users_public
with (security_invoker = on) as
select id, email, name, image_url, role, created_at, updated_at
from public.users;

grant select on public.users_public to anon, authenticated;


do $$
begin
  if not exists (select 1 from public.users where email='admin@admin.com') then
    perform public.admin_upsert('admin@admin.com', 'Admin', null, 'admin');
  else
    update public.users
       set role='admin',
           updated_at = now()
     where email='admin@admin.com'
       and role <> 'admin';

    -- If password is NULL or looks non-bcrypt, set hashed default
    update public.users
       set password_hash = extensions.crypt('admin', extensions.gen_salt('bf')),
           updated_at = now()
     where email='admin@admin.com'
       and (password_hash is null or password_hash !~ '^\$2[abxy]\$');
  end if;
end $$;



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
declare
  v_user uuid;
  v_cnt  int;
begin
  select id into v_user
  from public.users
  where email = lower(trim(p_email));

  if v_user is null then
    raise exception 'user not found';
  end if;

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

-- Cleanup function (older than 24 hours AND read)
create or replace function public.cleanup_old_notifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
  cutoff_date   timestamptz := now() - interval '24 hours';
begin
  delete from public.notifications
   where read = true
     and read_at is not null
     and read_at < cutoff_date;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Schedule daily cleanup 
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
  '0 * * * *',
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
--  p_password: hashedPassword,
--});

-- admin: update status / delete
--await supabase.rpc('admin_update_feature_status', {
--  p_admin_email: adminEmail,
--  p_password: hashedPassword,
--  p_feature_id: featureId,
--  p_new_status: 'in_progress',
--});

--await supabase.rpc('admin_delete_feature', {
--  p_admin_email: adminEmail,
--  p_password: hashedPassword,
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
revoke execute on function public.app_activate(uuid, boolean) from anon, authenticated;
revoke execute on function public.admin_upsert(text,text,text,text) from anon, authenticated;
revoke execute on function public.verify_admin_return_id(text,text)   from anon, authenticated;
revoke execute on function public.create_grouped_notification(uuid,text,text,text,uuid,uuid) from anon, authenticated;
revoke execute on function public.create_notification(uuid,text,text,text,uuid,uuid)          from anon, authenticated;
revoke execute on function public.notify_on_feature_status_change()                           from anon, authenticated;
revoke execute on function public.notify_on_new_vote()                                        from anon, authenticated;
revoke execute on function public.notify_on_feature_deleted()                                 from anon, authenticated;
revoke execute on function public.cleanup_old_notifications()                                 from anon, authenticated;


-- 9) Quick checks (optional)
-- select jobid, jobname, schedule, command from cron.job where jobname='trends_hourly';
-- select * from public.trends_latest order by metric_name;
-- select * from public.trends order by period_end desc, metric_name;



-- =========================================
-- COMMENTS: replies + likes + soft delete
-- =========================================

-- 0) Columns on comments
alter table public.comments
  add column if not exists parent_id    uuid references public.comments(id) on delete set null,
  add column if not exists is_deleted   boolean not null default false,
  add column if not exists deleted_at   timestamptz,
  add column if not exists edited_at    timestamptz,
  add column if not exists likes_count  integer not null default 0,
  add column if not exists replies_count integer not null default 0;

-- Simple safety: parent cannot reference self
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'comments_parent_not_self'
  ) then
    alter table public.comments
      add constraint comments_parent_not_self check (parent_id is null or parent_id <> id);
  end if;
end $$;

-- 1) Reactions table (only 'like' for now; easy to add more later)
create table if not exists public.comment_reactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  comment_id uuid not null references public.comments(id) on delete cascade,
  reaction   text not null check (reaction in ('like')),
  created_at timestamptz not null default now(),
  unique (comment_id, user_id, reaction)
);

-- Helpful indexes
create index if not exists idx_comments_feature_created
  on public.comments (feature_id, created_at desc)
  where parent_id is null and is_deleted = false;

create index if not exists idx_replies_parent_created
  on public.comments (parent_id, created_at asc)
  where is_deleted = false;

create index if not exists idx_comment_reactions_comment
  on public.comment_reactions(comment_id);

-- 2) Count sync triggers
create or replace function public.sync_comment_likes_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.comments set likes_count = likes_count + 1 where id = new.comment_id;
  elsif tg_op = 'DELETE' then
    update public.comments set likes_count = greatest(likes_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_comment_likes_sync on public.comment_reactions;
create trigger trg_comment_likes_sync
after insert or delete on public.comment_reactions
for each row execute procedure public.sync_comment_likes_count();

create or replace function public.sync_replies_count()
returns trigger language plpgsql as $$
begin
  -- Only affect parent rows when this row is a reply
  if tg_op = 'INSERT' and new.parent_id is not null then
    update public.comments set replies_count = replies_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update public.comments set replies_count = greatest(replies_count - 1, 0) where id = old.parent_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_replies_sync on public.comments;
create trigger trg_replies_sync
after insert or delete on public.comments
for each row execute procedure public.sync_replies_count();

-- 3) Light edit/soft-delete helpers
create or replace function public.comments_touch_edited_at()
returns trigger language plpgsql as $$
begin
  -- Only set edited_at if the actual content was changed (not just metadata like likes_count, replies_count)
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_comments_touch_edited on public.comments;
create trigger trg_comments_touch_edited
before update on public.comments
for each row execute procedure public.comments_touch_edited_at();

-- Keep your existing features.comments_count trigger as-is (already present).

-- 4) RLS for reactions + updates on comments
alter table public.comment_reactions enable row level security;

drop policy if exists comment_reactions_select on public.comment_reactions;
create policy comment_reactions_select on public.comment_reactions
  for select using (true);

drop policy if exists comment_reactions_insert on public.comment_reactions;
create policy comment_reactions_insert on public.comment_reactions
  for insert with check (current_setting('app.authorized', true) = 'true');

drop policy if exists comment_reactions_delete_owner on public.comment_reactions;
create policy comment_reactions_delete_owner on public.comment_reactions
  for delete using (
    current_setting('app.authorized', true) = 'true'
    and (user_id::text = current_setting('app.user_id', true) or current_setting('app.admin', true) = 'true')
  );

-- Allow updates (for soft-delete / future edit) to owner or admin
drop policy if exists comments_update_owner_or_admin on public.comments;
create policy comments_update_owner_or_admin on public.comments
  for update using (
    current_setting('app.authorized', true) = 'true'
    and (user_id::text = current_setting('app.user_id', true) or current_setting('app.admin', true) = 'true')
  )
  with check (true);

-- 5) RPCs
-- (A) add_comment now accepts optional parent (1-level replies)
drop function if exists public.add_comment(text,text,text,uuid,text);
create or replace function public.add_comment(
  p_email      text,
  p_name       text,
  p_image_url  text,
  p_feature_id uuid,
  p_content    text,
  p_parent_comment_id uuid default null
) returns public.comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_row  public.comments;
  v_parent_feature uuid;
  v_parent_parent uuid;
begin
  if coalesce(p_content,'') = '' then
    raise exception 'content required';
  end if;

  if not exists (select 1 from public.features where id = p_feature_id) then
    raise exception 'feature not found';
  end if;

  -- Ensure user context
  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false);

  -- Replies: enforce same feature (allow unlimited nesting depth)
  if p_parent_comment_id is not null then
    select feature_id into v_parent_feature
    from public.comments where id = p_parent_comment_id;

    if v_parent_feature is null then
      raise exception 'parent comment not found';
    end if;
    if v_parent_feature <> p_feature_id then
      raise exception 'parent comment belongs to a different feature';
    end if;
  end if;

  insert into public.comments (user_id, feature_id, content, parent_id)
  values (v_user, p_feature_id, p_content, p_parent_comment_id)
  returning * into v_row;

  return v_row;
end;
$$;

-- (B) toggle_comment_like
create or replace function public.toggle_comment_like(
  p_email      text,
  p_name       text,
  p_image_url  text,
  p_comment_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_exists boolean;
  v_feature uuid;
begin
  -- Resolve user and authorize
  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false);

  -- Validate comment
  if not exists (select 1 from public.comments where id = p_comment_id and is_deleted = false) then
    raise exception 'comment not found';
  end if;

  select true into v_exists
  from public.comment_reactions
  where comment_id = p_comment_id and user_id = v_user and reaction = 'like';

  if v_exists then
    delete from public.comment_reactions
    where comment_id = p_comment_id and user_id = v_user and reaction = 'like';
    return 'removed';
  else
    insert into public.comment_reactions (comment_id, user_id, reaction)
    values (p_comment_id, v_user, 'like');
    return 'added';
  end if;
end;
$$;

-- (C) Soft delete by owner
create or replace function public.soft_delete_comment_by_owner(
  p_email      text,
  p_comment_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_user uuid; v_cnt int;
begin
  select id into v_user from public.users where email = lower(trim(p_email));
  if v_user is null then raise exception 'user not found'; end if;

  perform public.app_activate(v_user, false);

  update public.comments
     set is_deleted = true, content = '', deleted_at = now()
   where id = p_comment_id and user_id = v_user and is_deleted = false;

  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

-- (D) Admin soft delete
create or replace function public.admin_soft_delete_comment(
  p_admin_email text,
  p_password    text,
  p_comment_id  uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_admin uuid; v_cnt int;
begin
  v_admin := public.verify_admin_return_id(p_admin_email, p_password);
  perform public.app_activate(v_admin, true);

  update public.comments
     set is_deleted = true, content = '', deleted_at = now()
   where id = p_comment_id and is_deleted = false;

  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

-- 6) Public view with aggregates for the UI
drop view if exists public.comments_public;
create view public.comments_public with (security_invoker = on) as
select
  c.id,
  c.feature_id,
  c.parent_id,
  case when c.is_deleted then null else c.content end as content,
  c.is_deleted,
  c.likes_count,
  c.replies_count,
  c.created_at,
  c.edited_at,
  u.name       as author_name,
  u.email      as author_email,
  u.image_url  as author_image_url
from public.comments c
join public.users u on u.id = c.user_id;

-- 6.0) Enhanced features function with user-specific vote status and pagination
create or replace function public.get_features_with_user_votes(
  p_email text,
  p_search text default null,
  p_sort text default 'trending',
  p_filter text default 'all',
  p_limit integer default 10,
  p_offset integer default 0
) returns table (
  id uuid,
  title text,
  description text,
  status text,
  votes_count integer,
  comments_count integer,
  created_at timestamptz,
  updated_at timestamptz,
  user_id uuid,
  author_name text,
  author_email text,
  author_image_url text,
  voted_by_me boolean,
  total_count bigint
) language plpgsql stable as $$
declare 
  v_user_id uuid;
  v_email_param text;
  v_total_count bigint;
  v_search_terms text[];
  v_search_condition text;
begin
  -- Store the email parameter in a local variable
  v_email_param := lower(trim(coalesce(p_email, '')));
  
  -- Get user ID from email
  select u.id into v_user_id
  from public.users u
  where u.email = v_email_param;

  -- Validate and sanitize pagination parameters
  p_limit := greatest(1, least(coalesce(p_limit, 10), 50)); -- Between 1 and 50
  p_offset := greatest(0, coalesce(p_offset, 0)); -- Non-negative

  -- Build search condition if provided
  v_search_condition := '';
  if p_search is not null and trim(p_search) <> '' then
    -- Split search terms and create ILIKE conditions
    v_search_terms := string_to_array(trim(p_search), ' ');
    v_search_condition := ' AND (' || 
      array_to_string(
        array(
          select 'f.title ILIKE ''%' || replace(trim(term), '''', '''''') || '%'' OR ' ||
                 'f.description ILIKE ''%' || replace(trim(term), '''', '''''') || '%'' OR ' ||
                 'u.name ILIKE ''%' || replace(trim(term), '''', '''''') || '%'''
          from unnest(v_search_terms) as term
          where trim(term) <> ''
        ),
        ' OR '
      ) || ')';
  end if;

  -- Get total count with filters applied
  execute 'SELECT COUNT(*) FROM public.features f 
           JOIN public.users u ON u.id = f.user_id 
           JOIN public.statuses s ON s.id = f.status_id
           WHERE 1=1 ' ||
           case when p_filter = 'mine' and v_user_id is not null then ' AND f.user_id = $1' else '' end ||
           case when p_filter not in ('all', 'mine') then ' AND s.slug = $2' else '' end ||
           v_search_condition
  into v_total_count
  using v_user_id, case when p_filter = 'open' then 'under_review' else p_filter end;

  return query execute
    'SELECT f.id, f.title, f.description, s.slug as status, f.votes_count, f.comments_count, 
            f.created_at, f.updated_at, f.user_id,
            u.name as author_name, u.email as author_email, u.image_url as author_image_url,
            CASE WHEN $3 IS NULL THEN FALSE
                 ELSE EXISTS(
                   SELECT 1 FROM public.votes v 
                   WHERE v.feature_id = f.id AND v.user_id = $3
                 )
            END as voted_by_me,
            $4::bigint as total_count
     FROM public.features f
     JOIN public.users u ON u.id = f.user_id
     JOIN public.statuses s ON s.id = f.status_id
     WHERE 1=1 ' ||
     case when p_filter = 'mine' and v_user_id is not null then ' AND f.user_id = $1' else '' end ||
     case when p_filter not in ('all', 'mine') then ' AND s.slug = $2' else '' end ||
     v_search_condition ||
     ' ORDER BY ' ||
     case 
       when p_sort = 'new' then 'f.created_at DESC, f.id DESC'
       when p_sort = 'top' then 'f.votes_count DESC, f.created_at DESC, f.id DESC'
       else 'f.votes_count DESC, f.created_at DESC, f.id DESC' -- trending (default)
     end ||
     ' LIMIT $5 OFFSET $6'
  using v_user_id, 
        case when p_filter = 'open' then 'under_review' else p_filter end,
        v_user_id, 
        v_total_count, 
        p_limit, 
        p_offset;
end;
$$;

-- 6.1) Enhanced comments view with user-specific like status WITH PAGINATION
create or replace function public.get_comments_with_user_likes(
  p_email text,
  p_feature_id uuid default null,
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset integer default 0
) returns table (
  id uuid,
  feature_id uuid,
  parent_id uuid,
  content text,
  is_deleted boolean,
  likes_count integer,
  replies_count integer,
  created_at timestamptz,
  edited_at timestamptz,
  author_name text,
  author_email text,
  author_image_url text,
  user_has_liked boolean,
  total_count bigint
) language plpgsql stable as $$
declare 
  v_user_id uuid;
  v_email_param text;
  v_total_count bigint;
begin
  -- Store the email parameter in a local variable to avoid any conflicts
  v_email_param := lower(trim(coalesce(p_email, '')));
  
  -- Get user ID from email (create user if doesn't exist)
  select u.id into v_user_id
  from public.users u
  where u.email = v_email_param;

  -- If no user found and email provided, return empty (don't create user here)
  if v_user_id is null and v_email_param is not null and v_email_param <> '' then
    return;
  end if;

  -- Get total count for pagination metadata (only top-level comments)
  select count(*) into v_total_count
  from public.comments c
  where (p_feature_id is null or c.feature_id = p_feature_id)
    and (c.parent_id is null); -- Only top-level comments for activity feed

  -- Validate and sanitize pagination parameters
  p_limit := greatest(1, least(coalesce(p_limit, 10), 50)); -- Between 1 and 50
  p_offset := greatest(0, coalesce(p_offset, 0)); -- Non-negative

  return query
  select
    c.id,
    c.feature_id,
    c.parent_id,
    case when c.is_deleted then null else c.content end as content,
    c.is_deleted,
    c.likes_count,
    c.replies_count,
    c.created_at,
    c.edited_at,
    u.name as author_name,
    u.email as author_email,
    u.image_url as author_image_url,
    case when v_user_id is null then false
         else exists(
           select 1 from public.comment_reactions cr
           where cr.comment_id = c.id
             and cr.user_id = v_user_id
             and cr.reaction = 'like'
         )
    end as user_has_liked,
    v_total_count as total_count
  from public.comments c
  join public.users u on u.id = c.user_id
  where (p_feature_id is null or c.feature_id = p_feature_id)
    and (c.parent_id is null) -- Only top-level comments for activity feed
  order by
    case when p_sort = 'oldest' then c.created_at end asc,
    case when p_sort = 'oldest' then c.id end asc, -- Secondary sort for stability
    case when p_sort <> 'oldest' then c.created_at end desc,
    case when p_sort <> 'oldest' then c.id end desc -- Secondary sort for stability
  limit p_limit
  offset p_offset;
end;
$$;

-- (D) get_comments_with_replies - Get comments with paginated replies (including nested) in flat structure
create or replace function public.get_comments_with_replies(
  p_email text,
  p_feature_id uuid,
  p_sort text default 'newest',
  p_limit integer default 10,
  p_offset integer default 0,
  p_replies_limit integer default 5
) returns json language plpgsql stable as $$
declare
  v_user_id uuid;
  v_email_param text;
  v_result json;
begin
  -- Store the email parameter in a local variable to avoid any conflicts
  v_email_param := lower(trim(coalesce(p_email, '')));

  -- Get user ID from email (create user if doesn't exist)
  select u.id into v_user_id
  from public.users u
  where u.email = v_email_param;

  -- If no user found and email provided, return empty (don't create user here)
  if v_user_id is null and v_email_param is not null and v_email_param <> '' then
    return '[]'::json;
  end if;

  -- Validate and sanitize pagination parameters
  p_limit := greatest(1, least(coalesce(p_limit, 10), 50)); -- Between 1 and 50
  p_offset := greatest(0, coalesce(p_offset, 0)); -- Non-negative
  p_replies_limit := greatest(1, least(coalesce(p_replies_limit, 5), 20)); -- Between 1 and 20

  -- Get top-level comments with paginated replies (including nested replies in flat structure)
  select json_agg(
    json_build_object(
      'id', paginated_comments.id,
      'feature_id', paginated_comments.feature_id,
      'parent_id', paginated_comments.parent_id,
      'content', paginated_comments.content,
      'is_deleted', paginated_comments.is_deleted,
      'likes_count', paginated_comments.likes_count,
      'replies_count', paginated_comments.replies_count,
      'created_at', paginated_comments.created_at,
      'edited_at', paginated_comments.edited_at,
      'author_name', paginated_comments.author_name,
      'author_email', paginated_comments.author_email,
      'author_image_url', paginated_comments.author_image_url,
      'user_has_liked', paginated_comments.user_has_liked,
      'replies', coalesce((
        (
          select json_build_object(
            'items', coalesce(json_agg(
              json_build_object(
                'id', flat_replies.id,
                'feature_id', flat_replies.feature_id,
                'parent_id', flat_replies.parent_id,
                'content', case when flat_replies.is_deleted then null else flat_replies.content end,
                'is_deleted', flat_replies.is_deleted,
                'likes_count', flat_replies.likes_count,
                'replies_count', flat_replies.replies_count,
                'created_at', flat_replies.created_at,
                'edited_at', flat_replies.edited_at,
                'author_name', flat_replies.name,
                'author_email', flat_replies.email,
                'author_image_url', flat_replies.image_url,
                'user_has_liked', case when v_user_id is null then false
                                     else exists(
                                       select 1 from public.comment_reactions cr
                                       where cr.comment_id = flat_replies.id
                                         and cr.user_id = v_user_id
                                         and cr.reaction = 'like'
                                     )
                                     end
              )
              order by flat_replies.created_at asc
            ), '[]'::json),
            'has_more', (
              -- Count total replies for this comment and check if more than limit
              with recursive total_reply_tree as (
                select id from public.comments 
                where parent_id = paginated_comments.id and is_deleted = false
                
                union all
                
                select c.id from public.comments c
                inner join total_reply_tree trt on c.parent_id = trt.id
                where c.is_deleted = false
              )
              select count(*) > p_replies_limit from total_reply_tree
            ),
            'total_count', (
              -- Count total replies for this comment
              with recursive total_reply_tree as (
                select id from public.comments 
                where parent_id = paginated_comments.id and is_deleted = false
                
                union all
                
                select c.id from public.comments c
                inner join total_reply_tree trt on c.parent_id = trt.id
                where c.is_deleted = false
              )
              select count(*) from total_reply_tree
            )
          )
          from (
            -- Get all replies in chronological order (flat structure) with pagination
            with recursive reply_tree as (
              -- Direct replies to main comment
              select r.id, r.feature_id, r.parent_id, r.content, r.is_deleted, 
                     r.likes_count, r.replies_count, r.created_at, r.edited_at, r.user_id,
                     ru.name, ru.email, ru.image_url, r.created_at as sort_time
              from public.comments r
              join public.users ru on ru.id = r.user_id
              where r.parent_id = paginated_comments.id and r.is_deleted = false
              
              union all
              
              -- Replies to replies (recursive) - maintain chronological order
              select c.id, c.feature_id, c.parent_id, c.content, c.is_deleted,
                     c.likes_count, c.replies_count, c.created_at, c.edited_at, c.user_id,
                     cu.name, cu.email, cu.image_url, c.created_at as sort_time
              from public.comments c
              join public.users cu on cu.id = c.user_id
              inner join reply_tree rt on c.parent_id = rt.id
              where c.is_deleted = false
            )
            select * from reply_tree
            order by sort_time asc
            limit p_replies_limit
          ) flat_replies
        )
      ), json_build_object('items', '[]'::json, 'has_more', false, 'total_count', 0))
    )
  ) into v_result
  from (
    select
      c.id,
      c.feature_id,
      c.parent_id,
      case when c.is_deleted then null else c.content end as content,
      c.is_deleted,
      c.likes_count,
      c.replies_count,
      c.created_at,
      c.edited_at,
      u.name as author_name,
      u.email as author_email,
      u.image_url as author_image_url,
      case when v_user_id is null then false
           else exists(
             select 1 from public.comment_reactions cr
             where cr.comment_id = c.id
               and cr.user_id = v_user_id
               and cr.reaction = 'like'
           )
      end as user_has_liked
    from public.comments c
    join public.users u on u.id = c.user_id
    where c.feature_id = p_feature_id
      and c.parent_id is null -- Only top-level comments
      and c.is_deleted = false
    order by
      case when p_sort = 'oldest' then c.created_at end asc,
      case when p_sort = 'newest' then c.created_at end desc,
      c.id asc -- Secondary sort for stability
    limit p_limit
    offset p_offset
  ) paginated_comments;

  return coalesce(v_result, '[]'::json);
end;
$$;

-- (E) get_comment_replies - Get paginated replies (including ALL nested) for a specific comment in flat structure
create or replace function public.get_comment_replies(
  p_email text,
  p_comment_id uuid,
  p_limit integer default 10,
  p_offset integer default 0
) returns json language plpgsql stable as $$
declare
  v_user_id uuid;
  v_email_param text;
  v_parent_feature uuid;
  v_result json;
  v_total_count integer;
begin
  -- Store the email parameter in a local variable to avoid any conflicts
  v_email_param := lower(trim(coalesce(p_email, '')));

  -- Get user ID from email (create user if doesn't exist)
  select u.id into v_user_id
  from public.users u
  where u.email = v_email_param;

  -- Validate comment exists and get its feature
  select c.feature_id into v_parent_feature
  from public.comments c
  where c.id = p_comment_id and c.is_deleted = false;

  if v_parent_feature is null then
    return json_build_object('error', 'Comment not found', 'replies', '[]'::json, 'has_more', false);
  end if;

  -- Validate and sanitize pagination parameters
  p_limit := greatest(1, least(coalesce(p_limit, 10), 50)); -- Between 1 and 50
  p_offset := greatest(0, coalesce(p_offset, 0)); -- Non-negative

  -- Get total count of ALL replies in thread
  with recursive total_reply_tree as (
    -- Direct replies to comment
    select id from public.comments 
    where parent_id = p_comment_id and is_deleted = false
    
    union all
    
    -- Replies to replies (recursive)
    select c.id from public.comments c
    inner join total_reply_tree trt on c.parent_id = trt.id
    where c.is_deleted = false
  )
  select count(*) into v_total_count from total_reply_tree;

  -- Get replies with pagination (all nested replies in flat chronological order)
  select json_build_object(
    'replies', coalesce(json_agg(
      json_build_object(
        'id', flat_replies.id,
        'feature_id', flat_replies.feature_id,
        'parent_id', flat_replies.parent_id,
        'content', case when flat_replies.is_deleted then null else flat_replies.content end,
        'is_deleted', flat_replies.is_deleted,
        'likes_count', flat_replies.likes_count,
        'replies_count', flat_replies.replies_count,
        'created_at', flat_replies.created_at,
        'edited_at', flat_replies.edited_at,
        'author_name', flat_replies.name,
        'author_email', flat_replies.email,
        'author_image_url', flat_replies.image_url,
        'user_has_liked', case when v_user_id is null then false
                             else exists(
                               select 1 from public.comment_reactions cr
                               where cr.comment_id = flat_replies.id
                                 and cr.user_id = v_user_id
                                 and cr.reaction = 'like'
                             )
                             end
      )
      order by flat_replies.created_at asc
    ), '[]'::json),
    'has_more', (v_total_count > (p_offset + p_limit)),
    'total_count', v_total_count
  ) into v_result
  from (
    -- Get all replies in chronological order (flat structure) with pagination
    with recursive reply_tree as (
      -- Direct replies to comment
      select r.id, r.feature_id, r.parent_id, r.content, r.is_deleted, 
             r.likes_count, r.replies_count, r.created_at, r.edited_at, r.user_id,
             ru.name, ru.email, ru.image_url, r.created_at as sort_time
      from public.comments r
      join public.users ru on ru.id = r.user_id
      where r.parent_id = p_comment_id and r.is_deleted = false
      
      union all
      
      -- Replies to replies (recursive) - maintain chronological order
      select c.id, c.feature_id, c.parent_id, c.content, c.is_deleted,
             c.likes_count, c.replies_count, c.created_at, c.edited_at, c.user_id,
             cu.name, cu.email, cu.image_url, c.created_at as sort_time
      from public.comments c
      join public.users cu on cu.id = c.user_id
      inner join reply_tree rt on c.parent_id = rt.id
      where c.is_deleted = false
    )
    select * from reply_tree
    order by sort_time asc
    limit p_limit
    offset p_offset
  ) flat_replies;

  return coalesce(v_result, json_build_object('replies', '[]'::json, 'has_more', false, 'total_count', 0));
end;
$$;

grant select on public.comments_public to anon, authenticated;

-- =========================================================
-- RPC: Get feature with initial comments (optimized single query)
-- =========================================================
create or replace function public.get_feature_with_comments(
  p_email text,
  p_feature_id uuid,
  p_comments_limit integer default 10
) returns table (
  -- Feature fields
  feature_id uuid,
  feature_title text,
  feature_description text,
  feature_status text,
  feature_status_label text,
  feature_votes_count integer,
  feature_comments_count integer,
  feature_created_at timestamptz,
  feature_updated_at timestamptz,
  feature_author_name text,
  feature_author_email text,
  feature_author_image_url text,
  feature_user_voted boolean,
  -- Comments fields (null if no comments)
  comment_id uuid,
  comment_content text,
  comment_is_deleted boolean,
  comment_likes_count integer,
  comment_replies_count integer,
  comment_created_at timestamptz,
  comment_edited_at timestamptz,
  comment_author_name text,
  comment_author_email text,
  comment_author_image_url text,
  comment_user_has_liked boolean,
  -- Pagination metadata
  comments_total_count bigint,
  comments_has_more boolean
) language plpgsql stable as $$
declare 
  v_user_id uuid;
  v_email_param text;
  v_total_comments_count bigint;
begin
  -- Store the email parameter in a local variable
  v_email_param := lower(trim(coalesce(p_email, '')));
  
  -- Get user ID from email
  select u.id into v_user_id
  from public.users u
  where u.email = v_email_param;

  -- If no user found and email provided, return empty
  if v_user_id is null and v_email_param is not null and v_email_param <> '' then
    return;
  end if;

  -- Get total comments count for pagination metadata
  select count(*) into v_total_comments_count
  from public.comments c
  where c.feature_id = p_feature_id
    and c.parent_id is null; -- Only top-level comments
    
  -- Validate pagination parameters
  p_comments_limit := greatest(1, least(coalesce(p_comments_limit, 10), 50));

  return query
  with feature_data as (
    select 
      f.id,
      f.title,
      f.description,
      f.status,
      f.status_label,
      f.votes_count,
      f.comments_count,
      f.created_at,
      f.updated_at,
      f.author_name,
      f.author_email,
      f.author_image_url,
      case when v.id is not null then true else false end as user_voted
    from public.features_public f
    left join public.votes v on v.feature_id = f.id and v.user_id = v_user_id
    where f.id = p_feature_id
  ),
  comments_data as (
    select
      (value->>'id')::uuid as id,
      value->>'content' as content,
      (value->>'is_deleted')::boolean as is_deleted,
      (value->>'likes_count')::integer as likes_count,
      (value->>'replies_count')::integer as replies_count,
      (value->>'created_at')::timestamptz as created_at,
      (value->>'edited_at')::timestamptz as edited_at,
      value->>'author_name' as author_name,
      value->>'author_email' as author_email,
      value->>'author_image_url' as author_image_url,
      (value->>'user_has_liked')::boolean as user_has_liked,
      row_number() over (order by (value->>'created_at')::timestamptz desc) as rn
    from json_array_elements((
      select json_agg(
        json_build_object(
          'id', c.id,
          'content', case when c.is_deleted then null else c.content end,
          'is_deleted', c.is_deleted,
          'likes_count', c.likes_count,
          'replies_count', c.replies_count,
          'created_at', c.created_at,
          'edited_at', c.edited_at,
          'author_name', u.name,
          'author_email', u.email,
          'author_image_url', u.image_url,
          'user_has_liked', case when v_user_id is null then false
                               else exists(
                                 select 1 from public.comment_reactions cr
                                 where cr.comment_id = c.id
                                   and cr.user_id = v_user_id
                                   and cr.reaction = 'like'
                               )
                               end,
          'replies', json_build_object(
            'items', coalesce((
              select json_agg(
                json_build_object(
                  'id', r.id,
                  'content', case when r.is_deleted then null else r.content end,
                  'is_deleted', r.is_deleted,
                  'likes_count', r.likes_count,
                  'replies_count', r.replies_count,
                  'created_at', r.created_at,
                  'edited_at', r.edited_at,
                  'author_name', r.name,
                  'author_email', r.email,
                  'author_image_url', r.image_url,
                  'user_has_liked', case when v_user_id is null then false
                                       else exists(
                                         select 1 from public.comment_reactions cr
                                         where cr.comment_id = r.id
                                           and cr.user_id = v_user_id
                                           and cr.reaction = 'like'
                                       )
                                       end
                )
                order by r.created_at asc
              )
              from (
                select r.id, r.feature_id, r.parent_id, r.content, r.is_deleted, r.likes_count, 
                       r.replies_count, r.created_at, r.edited_at, r.user_id,
                       ru.name, ru.email, ru.image_url
                from public.comments r
                join public.users ru on ru.id = r.user_id
                where r.parent_id = c.id and r.is_deleted = false
                order by r.created_at asc
                limit 3
              ) r
            ), '[]'::json),
            'has_more', (select count(*) > 3 from public.comments where parent_id = c.id and is_deleted = false),
            'total_count', (select count(*) from public.comments where parent_id = c.id and is_deleted = false)
          )
        )
        order by c.created_at desc
      )
      from public.comments c
      join public.users u on u.id = c.user_id
      where c.feature_id = p_feature_id
        and c.parent_id is null -- Only top-level comments
        and c.is_deleted = false
    )) as value
  )
  select
    fd.id as feature_id,
    fd.title as feature_title,
    fd.description as feature_description,
    fd.status as feature_status,
    fd.status_label as feature_status_label,
    fd.votes_count as feature_votes_count,
    fd.comments_count as feature_comments_count,
    fd.created_at as feature_created_at,
    fd.updated_at as feature_updated_at,
    fd.author_name as feature_author_name,
    fd.author_email as feature_author_email,
    fd.author_image_url as feature_author_image_url,
    fd.user_voted as feature_user_voted,
    cd.id as comment_id,
    cd.content as comment_content,
    cd.is_deleted as comment_is_deleted,
    cd.likes_count as comment_likes_count,
    cd.replies_count as comment_replies_count,
    cd.created_at as comment_created_at,
    cd.edited_at as comment_edited_at,
    cd.author_name as comment_author_name,
    cd.author_email as comment_author_email,
    cd.author_image_url as comment_author_image_url,
    cd.user_has_liked as comment_user_has_liked,
    v_total_comments_count as comments_total_count,
    case when v_total_comments_count > p_comments_limit then true else false end as comments_has_more
  from feature_data fd
  left join comments_data cd on true  -- Cartesian join to include all comments with feature data
  where fd.id is not null -- Ensure feature exists
  limit p_comments_limit;
end $$;

-- 7) Grants for new RPCs
grant execute on function
  public.add_comment(text,text,text,uuid,text,uuid),
  public.toggle_comment_like(text,text,text,uuid),
  public.soft_delete_comment_by_owner(text,uuid),
  public.admin_soft_delete_comment(text,text,uuid),
  public.get_comments_with_user_likes(text,uuid,text,integer,integer),
  public.get_features_with_user_votes(text,text,text,text,integer,integer),
  public.get_feature_with_comments(text,uuid,integer),
  public.get_comments_with_replies(text,uuid,text,integer,integer,integer),
  public.get_comment_replies(text,uuid,integer,integer)
to anon, authenticated;
