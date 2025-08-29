-- =====================================================================================
-- FEATURE REQUEST SYSTEM — FULL FIXED SCHEMA (App delete cascades + Admin moderation)
-- =====================================================================================

-- --------------------------------------
-- Extensions & Schemas
-- --------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;

-- --------------------------------------
-- Enum(s)
-- --------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('user','admin');
  end if;
end $$;

-- --------------------------------------
-- Generic updated_at trigger
-- --------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- --------------------------------------
-- USERS
-- --------------------------------------
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  name          text not null,
  image_url     text,
  role          user_role not null default 'user',
  password_hash text,                                 -- bcrypt for admins only
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint users_email_lowercase check (email = lower(email)),
  constraint admin_has_password check ((role <> 'admin') or (password_hash is not null))
);

drop trigger if exists trg_users_updated on public.users;
create trigger trg_users_updated
before update on public.users
for each row execute procedure public.set_updated_at();

-- Public safe view (no password)
create or replace view public.users_public
with (security_invoker = on) as
select id, email, name, image_url, role, created_at, updated_at
from public.users;

-- --------------------------------------
-- APPS (multi-app)
-- --------------------------------------
create table if not exists public.apps (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,               -- stable key for URLs/APIs
  name        text not null,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint apps_slug_format check (slug ~ '^[a-z0-9_]+$')
);

create or replace function public._apps_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_apps_updated on public.apps;
create trigger trg_apps_updated before update on public.apps
for each row execute procedure public._apps_touch_updated_at();


-- --------------------------------------
-- STATUSES lookup
-- --------------------------------------
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
begin new.updated_at := now(); return new; end $$;

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

grant select on public.statuses to anon, authenticated;
alter table public.statuses enable row level security;
drop policy if exists statuses_select on public.statuses;
create policy statuses_select on public.statuses for select using (true);

-- --------------------------------------
-- FEATURES / VOTES / COMMENTS
-- --------------------------------------
create table if not exists public.features (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.apps(id) on delete cascade, -- CHANGED to CASCADE
  user_id         uuid not null references public.users(id) on delete cascade,
  title           text not null,
  description     text not null,
  status_id       smallint not null default 1 references public.statuses(id),
  votes_count     int  not null default 0,
  comments_count  int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Drop legacy enum column if present
alter table public.features drop column if exists status;
do $$ begin
  if exists (select 1 from pg_type where typname='feature_status') then
    drop type feature_status;
  end if;
end $$;

-- Ensure app_id exists & is not null (backfill to 'default' if needed)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='features' and column_name='app_id'
  ) then
    alter table public.features add column app_id uuid;
  end if;
end $$;

do $$
declare v_default uuid;
begin
  select id into v_default from public.apps where slug='default';
  update public.features set app_id = v_default where app_id is null;
end $$;

alter table public.features alter column app_id set not null;

create unique index if not exists features_app_user_lower_title_uniq
  on public.features (app_id, user_id, (lower(title)));

create index if not exists idx_features_app_created  on public.features (app_id, created_at desc);
create index if not exists idx_features_app_status   on public.features (app_id, status_id);

drop trigger if exists trg_features_updated on public.features;
create trigger trg_features_updated
before update on public.features
for each row execute procedure public.set_updated_at();

-- enforce CASCADE on features.user_id if older FK existed
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'features'
      and constraint_name like '%user_id%'
      and table_schema = 'public'
  ) then
    begin
      alter table public.features drop constraint features_user_id_fkey;
    exception when undefined_object then null;
    end;
  end if;
  alter table public.features
  add constraint features_user_id_fkey
  foreign key (user_id) references public.users(id) on delete cascade;
end $$;

create table if not exists public.votes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  feature_id uuid not null references public.features(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (feature_id, user_id)
);

create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users(id) on delete cascade,
  feature_id    uuid not null references public.features(id) on delete cascade,
  content       text not null,
  parent_id     uuid references public.comments(id) on delete set null,
  is_deleted    boolean not null default false,
  deleted_at    timestamptz,
  edited_at     timestamptz,
  likes_count   integer not null default 0,
  replies_count integer not null default 0,
  created_at    timestamptz not null default now()
);

-- Parent cannot reference self
do $$ begin
  if not exists (select 1 from pg_constraint where conname='comments_parent_not_self') then
    alter table public.comments
      add constraint comments_parent_not_self check (parent_id is null or parent_id <> id);
  end if;
end $$;

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

create index if not exists idx_comment_reactions_comment on public.comment_reactions(comment_id);

-- --------------------------------------
-- Counters / touchers
-- --------------------------------------
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

create or replace function public.comments_touch_edited_at()
returns trigger language plpgsql as $$
begin
  if new.content is distinct from old.content then
    new.edited_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_comments_touch_edited on public.comments;
create trigger trg_comments_touch_edited
before update on public.comments
for each row execute procedure public.comments_touch_edited_at();

-- --------------------------------------
-- NOTIFICATIONS (carry app_id; grouped)
-- --------------------------------------
create table if not exists public.notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade, -- recipient
  app_id           uuid references public.apps(id) on delete cascade,           -- CHANGED to CASCADE
  type             text not null check (type in ('comment','status_change','feature_deleted','vote','comment_like','reply')),
  title            text not null,
  message          text not null,
  feature_id       uuid references public.features(id) on delete cascade,       -- CHANGED to CASCADE
  comment_id       uuid,
  group_key        text,
  group_count      integer not null default 1,
  latest_actor_id  uuid references public.users(id) on delete set null,
  read             boolean not null default false,
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Keep app_id in sync from feature if omitted
create or replace function public.notifications_set_app_from_feature()
returns trigger language plpgsql as $$
begin
  if (new.app_id is null) and (new.feature_id is not null) then
    select f.app_id into new.app_id from public.features f where f.id = new.feature_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_notifications_app_sync on public.notifications;
create trigger trg_notifications_app_sync
before insert or update on public.notifications
for each row execute procedure public.notifications_set_app_from_feature();

-- Backfill historical
update public.notifications n
set app_id = f.app_id
from public.features f
where n.feature_id = f.id
  and n.app_id is null;

-- Indexes
create index if not exists idx_notifications_user_id            on public.notifications(user_id);
create index if not exists idx_notifications_user_read          on public.notifications(user_id, read) where read = false;
create index if not exists idx_notifications_feature_id         on public.notifications(feature_id);
create index if not exists idx_notifications_created_at         on public.notifications(created_at desc);
create index if not exists idx_notifications_updated_at         on public.notifications(updated_at desc);
create index if not exists idx_notifications_user_type          on public.notifications(user_id, type);
create index if not exists idx_notifications_group_key          on public.notifications(group_key);
create index if not exists idx_notifications_feature_type       on public.notifications(feature_id, type);
create index if not exists idx_notifications_app_created        on public.notifications(app_id, created_at desc);
create index if not exists idx_notifications_user_read_updated  on public.notifications(user_id, read, updated_at desc);

-- read_at & updated_at
create or replace function public.set_read_at()
returns trigger language plpgsql as $$
begin
  if new.read = true AND (old.read is distinct from true) AND new.read_at is null then
    new.read_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_notifications_read_at on public.notifications;
create trigger trg_notifications_read_at
before update on public.notifications
for each row execute procedure public.set_read_at();

drop trigger if exists trg_notifications_touch_updated on public.notifications;
create trigger trg_notifications_touch_updated
before update on public.notifications
for each row execute procedure public.set_updated_at();

-- --------------------------------------
-- RLS setup (writes via SECURITY DEFINER RPCs)
-- --------------------------------------
alter table public.users              enable row level security;
alter table public.apps               enable row level security;
alter table public.statuses           enable row level security;
alter table public.features           enable row level security;
alter table public.votes              enable row level security;
alter table public.comments           enable row level security;
alter table public.comment_reactions  enable row level security;
alter table public.notifications      enable row level security;

-- reset existing policies to avoid duplicates
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname
           from pg_policies where schemaname='public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Read policies for lookups
create policy apps_read_all      on public.apps      for select using (true);
create policy statuses_read_all  on public.statuses  for select using (true);
create policy comment_reactions_select on public.comment_reactions for select using (true);
create policy notifications_read_all   on public.notifications     for select using (true);

-- Helper GUC for RPCs
create or replace function public.app_activate(
  p_user_id uuid, p_is_admin boolean, p_app_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.authorized','true', true);
  perform set_config('app.user_id', coalesce(p_user_id::text,''), true);
  perform set_config('app.admin', case when p_is_admin then 'true' else 'false' end, true);
  perform set_config('app.app_id', coalesce(p_app_id::text,''), true);
end; $$;

create or replace function public.app_activate(p_user_id uuid, p_is_admin boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.app_activate(p_user_id, p_is_admin, null);
end $$;

-- Write policies guarded by GUC
create policy users_write_authorized on public.users
for all using (current_setting('app.authorized', true) = 'true')
with check (current_setting('app.authorized', true) = 'true');

create policy features_write_authorized on public.features
for all using (current_setting('app.authorized', true) = 'true')
with check (current_setting('app.authorized', true) = 'true');

create policy votes_insert_authorized on public.votes
for insert with check (current_setting('app.authorized', true) = 'true');

create policy votes_delete_owner_or_admin on public.votes
for delete using (
  current_setting('app.authorized', true) = 'true'
  and ((user_id::text = current_setting('app.user_id', true)) or current_setting('app.admin', true) = 'true')
);

create policy comments_insert_authorized on public.comments
for insert with check (current_setting('app.authorized', true) = 'true');

create policy comments_update_owner_or_admin on public.comments
for update using (
  current_setting('app.authorized', true) = 'true'
  and ((user_id::text = current_setting('app.user_id', true)) or current_setting('app.admin', true) = 'true')
) with check (true);

create policy comments_delete_owner_or_admin on public.comments
for delete using (
  current_setting('app.authorized', true) = 'true'
  and ((user_id::text = current_setting('app.user_id', true)) or current_setting('app.admin', true) = 'true')
);

create policy comment_reactions_insert on public.comment_reactions
  for insert with check (current_setting('app.authorized', true) = 'true');

create policy comment_reactions_delete_owner on public.comment_reactions
  for delete using (
    current_setting('app.authorized', true) = 'true'
    and (user_id::text = current_setting('app.user_id', true) or current_setting('app.admin', true) = 'true')
  );

-- --------------------------------------
-- Identity/Admin helpers (bcrypt lives in extensions schema)
-- --------------------------------------
create or replace function public.ensure_user(
  p_email     text,
  p_name      text,
  p_image_url text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  p_email := lower(trim(p_email));
  if coalesce(p_email,'') = '' then raise exception 'email is required'; end if;
  if coalesce(p_name,'')  = '' then raise exception 'name is required and cannot be empty'; end if;

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

create or replace function public.verify_admin_return_id(
  p_email    text,
  p_password text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  select u.id into v_id
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

create or replace function public.admin_change_password(
  p_admin_email text,
  p_old_password text,
  p_new_password text
) returns boolean
language plpgsql security definer set search_path = public, extensions
as $$
declare v_admin_id uuid;
begin
  if coalesce(p_new_password,'') = '' then raise exception 'new password required'; end if;

  v_admin_id := public.verify_admin_return_id(p_admin_email, p_old_password);

  update public.users
     set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_admin_id;

  return true;
end;
$$;

create or replace function public.admin_upsert(
  p_email     text,
  p_name      text,
  p_image_url text,
  p_password  text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if coalesce(p_password,'') = '' then
    raise exception 'password required for admin';
  end if;

  v_id := public.ensure_user(p_email, p_name, p_image_url);

  update public.users
     set role = 'admin',
         password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_id;

  return v_id;
end;
$$;

-- --------------------------------------
-- Public RPCs (app-aware creators/toggles)
-- --------------------------------------
create or replace function public.create_feature(
  p_app_slug    text,
  p_email       text,
  p_name        text,
  p_image_url   text,
  p_title       text,
  p_description text
) returns public.features
language plpgsql security definer set search_path = public
as $$
declare v_user uuid; v_app_id uuid; v_row public.features;
begin
  if coalesce(p_title,'') = '' or coalesce(p_description,'') = '' then
    raise exception 'title and description are required';
  end if;

  select id into v_app_id from public.apps where slug = lower(trim(p_app_slug));
  if v_app_id is null then raise exception 'unknown app slug: %', p_app_slug; end if;

  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false, v_app_id);

  insert into public.features (app_id, user_id, title, description)
  values (v_app_id, v_user, p_title, p_description)
  returning * into v_row;

  insert into public.votes (user_id, feature_id) values (v_user, v_row.id); -- auto-vote
  return v_row;
end;
$$;

create or replace function public.toggle_vote(
  p_email     text,
  p_name      text,
  p_image_url text,
  p_feature_id uuid
) returns text
language plpgsql security definer set search_path = public
as $$
declare v_user uuid; v_exists boolean; v_app uuid;
begin
  select app_id into v_app from public.features where id = p_feature_id;
  if v_app is null then raise exception 'feature not found'; end if;

  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false, v_app);

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
  p_content    text,
  p_parent_comment_id uuid default null
) returns public.comments
language plpgsql security definer set search_path = public
as $$
declare v_user uuid; v_row public.comments; v_parent_feature uuid; v_app uuid;
begin
  if coalesce(p_content,'') = '' then raise exception 'content required'; end if;
  select app_id into v_app from public.features where id = p_feature_id;
  if v_app is null then raise exception 'feature not found'; end if;

  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false, v_app);

  if p_parent_comment_id is not null then
    select feature_id into v_parent_feature from public.comments where id = p_parent_comment_id;
    if v_parent_feature is null then raise exception 'parent comment not found'; end if;
    if v_parent_feature <> p_feature_id then raise exception 'parent belongs to different feature'; end if;
  end if;

  insert into public.comments (user_id, feature_id, content, parent_id)
  values (v_user, p_feature_id, p_content, p_parent_comment_id)
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.delete_comment_by_owner(
  p_email      text,
  p_comment_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_user uuid; v_cnt int;
begin
  select id into v_user from public.users where email = lower(trim(p_email));
  if v_user is null then raise exception 'user not found'; end if;
  perform public.app_activate(v_user, false, null);

  delete from public.comments where id = p_comment_id and user_id = v_user;
  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

create or replace function public.soft_delete_comment_by_owner(
  p_email      text,
  p_comment_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_user uuid; v_cnt int;
begin
  select id into v_user from public.users where email = lower(trim(p_email));
  if v_user is null then raise exception 'user not found'; end if;
  perform public.app_activate(v_user, false, null);

  update public.comments
     set is_deleted = true, content = '', deleted_at = now()
   where id = p_comment_id and user_id = v_user and is_deleted = false;

  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

create or replace function public.toggle_comment_like(
  p_email      text,
  p_name       text,
  p_image_url  text,
  p_comment_id uuid
) returns text
language plpgsql security definer set search_path = public
as $$
declare v_user uuid; v_exists boolean;
begin
  v_user := public.ensure_user(p_email, p_name, p_image_url);
  perform public.app_activate(v_user, false, null);

  if not exists (select 1 from public.comments where id = p_comment_id and is_deleted = false) then
    raise exception 'comment not found';
  end if;

  select true into v_exists
  from public.comment_reactions
  where comment_id = p_comment_id and user_id = v_user and reaction = 'like';

  if v_exists then
    delete from public.comment_reactions where comment_id = p_comment_id and user_id = v_user and reaction = 'like';
    return 'removed';
  else
    insert into public.comment_reactions (comment_id, user_id, reaction) values (p_comment_id, v_user, 'like');
    return 'added';
  end if;
end;
$$;

-- --------------------------------------
-- Notifications: helpers + triggers
-- --------------------------------------
create or replace function public.create_grouped_notification(
  p_user_id         uuid,
  p_type            text,
  p_title           text,
  p_message         text,
  p_feature_id      uuid default null,
  p_comment_id      uuid default null,
  p_trigger_user_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare notification_id uuid; group_key_val text; existing record; actor_name text; v_app uuid;
begin
  if p_feature_id is not null then
    select app_id into v_app from public.features where id = p_feature_id;
  elsif p_comment_id is not null then
    select f.app_id into v_app
    from public.comments c
    join public.features f on f.id = c.feature_id
    where c.id = p_comment_id;
  end if;

  group_key_val := p_type || '_' ||
    case
      when p_feature_id is not null then 'feature_' || p_feature_id::text
      when p_comment_id is not null then 'comment_' || p_comment_id::text
      else 'general'
    end;

  actor_name := coalesce((select u.name from public.users u where u.id = p_trigger_user_id), 'Someone');

  select * into existing
  from public.notifications
  where group_key = group_key_val
    and user_id   = p_user_id
    and type      = p_type
  order by read asc, updated_at desc
  limit 1;

  if existing.id is not null then
    update public.notifications
       set group_count     = existing.group_count + 1,
           latest_actor_id = p_trigger_user_id,
           updated_at      = now(),
           title           = p_title,
           message         = case p_type
             when 'vote' then actor_name || ' and ' || existing.group_count || ' other people voted on your feature request'
             when 'comment' then actor_name || ' and ' || existing.group_count || ' other people commented on your feature request'
             when 'comment_like' then actor_name || ' and ' || existing.group_count || ' other people liked your comment'
             when 'reply' then actor_name || ' and ' || existing.group_count || ' other people replied to your comment'
             else actor_name || ' and ' || existing.group_count || ' other people interacted with your content'
           end,
           read            = false,
           read_at         = null
     where id = existing.id
     returning id into notification_id;
  else
    insert into public.notifications (
      user_id, app_id, type, title, message, feature_id, comment_id, group_key, group_count, latest_actor_id
    ) values (
      p_user_id, v_app, p_type,
      coalesce(p_title, 'Notification'),
      coalesce(p_message, actor_name || ' interacted with your content'),
      p_feature_id, p_comment_id, group_key_val, 1, p_trigger_user_id
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
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare notification_id uuid; v_app uuid;
begin
  if p_feature_id is not null then
    select app_id into v_app from public.features where id = p_feature_id;
  end if;

  insert into public.notifications (user_id, app_id, type, title, message, feature_id, comment_id)
  values (p_user_id, v_app, p_type, p_title, p_message, p_feature_id, p_comment_id)
  returning id into notification_id;

  return notification_id;
end;
$$;

-- status change / vote / delete / comment like / reply notifiers (unchanged logic)
create or replace function public.notify_on_feature_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare status_new text; status_old text; msg text;
begin
  if old.status_id = new.status_id then return new; end if;
  select label into status_new from public.statuses where id = new.status_id;
  select label into status_old from public.statuses where id = old.status_id;

  msg := case
    when status_old is not null then 'Your feature request moved by an admin from **' || status_old || '** to **' || coalesce(status_new,'(unknown)') || '**'
    else 'Moved to **' || coalesce(status_new,'(unknown)') || '**'
  end;

  perform public.create_notification(
    new.user_id,
    'status_change',
    'Your feature request status was updated',
    msg,
    new.id,
    null
  );
  return new;
end;
$$;

create or replace function public.notify_on_new_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid;
begin
  select f.user_id into owner_id from public.features f where f.id = new.feature_id;
  if owner_id is null or owner_id = new.user_id then return new; end if;

  perform public.create_grouped_notification(
    owner_id, 'vote', 'Someone voted on your feature request',
    'New vote on your feature request', new.feature_id, null, new.user_id
  );
  return new;
end;
$$;

create or replace function public.notify_on_feature_deleted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.create_notification(
    old.user_id, 'feature_deleted',
    'Your feature request was removed',
    'Removed by an admin.',
    old.id, null
  );
  return old;
end;
$$;

create or replace function public.notify_on_new_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare feature_owner_id uuid;
begin
  if new.parent_id is not null then return new; end if; -- replies handled elsewhere
  select f.user_id into feature_owner_id from public.features f where f.id = new.feature_id;
  if feature_owner_id is null or feature_owner_id = new.user_id then return new; end if;

  perform public.create_grouped_notification(
    feature_owner_id, 'comment',
    'Someone commented on your feature request',
    'New comment on your feature request',
    new.feature_id, null, new.user_id
  );
  return new;
end;
$$;

create or replace function public.notify_on_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare comment_author_id uuid; v_feature_id uuid;
begin
  select c.user_id, c.feature_id into comment_author_id, v_feature_id
  from public.comments c where c.id = new.comment_id;

  if comment_author_id is null or comment_author_id = new.user_id then
    return new;
  end if;

  perform public.create_grouped_notification(
    comment_author_id, 'comment_like', 'Someone liked your comment',
    'New like on your comment', v_feature_id, null, new.user_id
  );
  return new;
end;
$$;

create or replace function public.notify_on_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent_author uuid; feature_id uuid;
begin
  if new.parent_id is null then return new; end if;

  select c.user_id, c.feature_id into parent_author, feature_id
  from public.comments c where c.id = new.parent_id;

  if parent_author is null or parent_author = new.user_id then return new; end if;

  perform public.create_grouped_notification(
    parent_author, 'reply', 'Someone replied to your comment',
    'New reply to your comment', feature_id, null, new.user_id
  );
  return new;
end;
$$;

-- attach notification triggers
drop trigger if exists trigger_feature_status_change_notification on public.features;
create trigger trigger_feature_status_change_notification
  after update on public.features
  for each row execute function public.notify_on_feature_status_change();

drop trigger if exists trigger_new_vote_notification on public.votes;
create trigger trigger_new_vote_notification
  after insert on public.votes
  for each row execute function public.notify_on_new_vote();

drop trigger if exists trigger_feature_deleted_notification on public.features;
create trigger trigger_feature_deleted_notification
  before delete on public.features
  for each row execute function public.notify_on_feature_deleted();

drop trigger if exists trigger_new_comment_notification on public.comments;
create trigger trigger_new_comment_notification
  after insert on public.comments
  for each row execute function public.notify_on_new_comment();

drop trigger if exists trigger_reply_notification on public.comments;
create trigger trigger_reply_notification
  after insert on public.comments
  for each row execute function public.notify_on_reply();

drop trigger if exists trigger_comment_like_notification on public.comment_reactions;
create trigger trigger_comment_like_notification
  after insert on public.comment_reactions
  for each row execute function public.notify_on_comment_like();

-- --------------------------------------
-- Notification list/read RPCs
-- --------------------------------------
create or replace function public.list_notifications(
  p_email text,
  p_limit integer default 50,
  p_offset integer default 0,
  p_app_slug text default null
)
returns table (
  id uuid, type text, title text, message text,
  feature_id uuid, comment_id uuid,
  group_key text, group_count integer,
  latest_actor_name text, feature_title text, app_slug text,
  read boolean, created_at text, updated_at text
)
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid;
begin
  select u.id into v_user_id from public.users u where u.email = lower(trim(p_email));
  if v_user_id is null then return; end if;

  return query
  select
    n.id, n.type, n.title, n.message, n.feature_id, n.comment_id,
    n.group_key, n.group_count,
    case when n.latest_actor_id is not null then u.name else null end as latest_actor_name,
    case when n.feature_id is not null then f.title else null end as feature_title,
    a.slug as app_slug,
    n.read,
    to_char(n.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
    to_char(n.updated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as updated_at
  from public.notifications n
  left join public.users u on u.id = n.latest_actor_id
  left join public.features f on f.id = n.feature_id
  left join public.apps a on a.id = n.app_id
  where n.user_id = v_user_id
    and (p_app_slug is null or a.slug = p_app_slug)
  order by n.read asc, n.updated_at desc
  limit p_limit offset p_offset;
end;
$$;

create or replace function public.get_unread_notification_count(p_email text, p_app_slug text default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_count integer;
begin
  select u.id into v_user_id from public.users u where u.email = lower(trim(p_email));
  if v_user_id is null then return 0; end if;
  select count(*) into v_count
  from public.notifications n
  left join public.apps a on a.id = n.app_id
  where n.user_id = v_user_id
    and n.read = false
    and (p_app_slug is null or a.slug = p_app_slug);
  return v_count;
end;
$$;

create or replace function public.mark_all_notifications_read(p_email text, p_app_slug text default null)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_updated_count integer;
begin
  select u.id into v_user_id from public.users u where u.email = lower(trim(p_email));
  if v_user_id is null then return 0; end if;

  update public.notifications set read = true, read_at = now()
  where user_id = v_user_id
    and read = false
    and (p_app_slug is null or app_id in (
      select id from public.apps where slug = p_app_slug
    ));
  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid, p_email text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_user_id uuid; v_updated_count integer;
begin
  select u.id into v_user_id from public.users u where u.email = lower(trim(p_email));
  if v_user_id is null then return false; end if;

  update public.notifications set read = true, read_at = now()
  where id = p_notification_id and user_id = v_user_id;

  get diagnostics v_updated_count = row_count;
  return v_updated_count > 0;
end;
$$;

-- Cleanup read notifications older than 24h (cron hourly)
create or replace function public.cleanup_old_notifications()
returns integer language plpgsql security definer set search_path = public as $$
declare deleted_count integer;
begin
  delete from public.notifications
   where read = true and read_at is not null
     and read_at < (now() - interval '24 hours');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

do $$
declare v_jobid bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_jobid from cron.job where jobname = 'cleanup-old-notifications';
    if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
    perform cron.schedule('cleanup-old-notifications', '0 * * * *', 'select public.cleanup_old_notifications();');
  end if;
end;
$$;

-- --------------------------------------
-- Admin moderation (features + comments)
-- --------------------------------------
create or replace function public.admin_update_feature_status(
  p_admin_id    uuid,
  p_feature_id  uuid,
  p_new_status  text
) returns public.features
language plpgsql security definer set search_path = public
as $$
declare v_row public.features; v_status_id smallint; v_app uuid;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'invalid admin user';
  end if;

  select app_id into v_app from public.features where id = p_feature_id;
  perform public.app_activate(p_admin_id, true, v_app);

  select id into v_status_id from public.statuses where slug = replace(lower(trim(p_new_status)),' ','_');
  if v_status_id is null then
    raise exception 'invalid status slug: % (under_review, planned, in_progress, done)', p_new_status;
  end if;

  update public.features
     set status_id = v_status_id, updated_at = now()
   where id = p_feature_id
  returning * into v_row;

  if v_row.id is null then raise exception 'feature not found'; end if;
  return v_row;
end;
$$;

create or replace function public.admin_edit_feature(
  p_admin_id    uuid,
  p_feature_id  uuid,
  p_title       text,
  p_description text,
  p_status_slug text default null
) returns public.features
language plpgsql security definer set search_path = public
as $$
declare v_status_id smallint; v_row public.features; v_app uuid;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'invalid admin user';
  end if;

  select app_id into v_app from public.features where id = p_feature_id;
  perform public.app_activate(p_admin_id, true, v_app);

  if p_status_slug is not null then
    select id into v_status_id from public.statuses where slug = replace(lower(trim(p_status_slug)),' ','_');
    if v_status_id is null then raise exception 'invalid status slug: %', p_status_slug; end if;
  end if;

  update public.features
     set title = coalesce(nullif(trim(p_title),''), title),
         description = coalesce(nullif(trim(p_description),''), description),
         status_id = coalesce(v_status_id, status_id),
         updated_at = now()
   where id = p_feature_id
  returning * into v_row;

  if v_row.id is null then raise exception 'feature not found'; end if;
  return v_row;
end;
$$;

create or replace function public.admin_delete_feature(
  p_admin_id   uuid,
  p_feature_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_cnt int; v_app uuid;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'invalid admin user';
  end if;

  select app_id into v_app from public.features where id = p_feature_id;
  perform public.app_activate(p_admin_id, true, v_app);

  delete from public.features where id = p_feature_id;
  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

create or replace function public.admin_delete_comment(
  p_comment_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_cnt int;
begin
  delete from public.comments where id = p_comment_id;
  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

create or replace function public.admin_edit_comment(
  p_comment_id uuid,
  p_content text
) returns table (
  id uuid,
  content text,
  edited_at timestamptz,
  author_name text,
  author_email text,
  author_image_url text,
  author_role text
)
language plpgsql security definer set search_path = public
as $$
begin
  update public.comments
     set content = p_content, edited_at = now()
   where id = p_comment_id and is_deleted = false;

  return query
  select
    c.id, c.content, c.edited_at,
    u.name, u.email, u.image_url,
    u.role::text
  from public.comments c
  join public.users u on u.id = c.user_id
  where c.id = p_comment_id;
end;
$$;

-- --------------------------------------
-- READ Views
-- --------------------------------------
drop view if exists public.features_public;
create view public.features_public with (security_invoker = on) as
select
  f.id, f.user_id, f.title, f.description,
  s.slug  as status, s.label as status_label,
  f.votes_count, f.comments_count,
  f.created_at, f.updated_at,
  f.app_id, a.slug as app_slug,
  u.name as author_name, u.email as author_email, u.image_url as author_image_url,
  u.role::text as author_role
from public.features f
join public.users u on u.id = f.user_id
join public.statuses s on s.id = f.status_id
join public.apps a on a.id = f.app_id;

drop view if exists public.comments_public;
create view public.comments_public with (security_invoker = on) as
select
  c.id, c.feature_id, c.parent_id,
  case when c.is_deleted then null else c.content end as content,
  c.is_deleted, c.likes_count, c.replies_count,
  c.created_at, c.edited_at,
  u.name as author_name, u.email as author_email, u.image_url as author_image_url,
  u.role::text as author_role
from public.comments c
join public.users u on u.id = c.user_id;

drop view if exists public.notifications_public;
create view public.notifications_public with (security_invoker = on) as
select
  n.id, n.user_id, n.app_id, n.type, n.title, n.message, n.feature_id, n.comment_id,
  n.group_key, n.group_count,
  n.latest_actor_id,
  (select u.name  from public.users u where u.id = n.latest_actor_id) as latest_actor_name,
  (select u.email from public.users u where u.id = n.latest_actor_id) as latest_actor_email,
  (select f.title from public.features f where f.id = n.feature_id)   as feature_title,
  n.read, n.created_at, n.updated_at
from public.notifications n;

-- --------------------------------------
-- Trends (per-app) + scheduler
-- --------------------------------------
create table if not exists public.trends (
  id              uuid primary key default gen_random_uuid(),
  app_id          uuid not null references public.apps(id) on delete cascade,
  metric_name     text         not null,
  current_value   integer      not null,
  previous_value  integer      not null,
  trend_percent   numeric(7,2) not null,
  period_start    timestamptz  not null,
  period_end      timestamptz  not null,
  computed_at     timestamptz  not null default now(),
  constraint trends_period_nonempty check (period_end > period_start)
);

create unique index if not exists trends_metric_window_uq
  on public.trends (app_id, metric_name, period_start, period_end);

create index if not exists trends_metric_computed_desc_idx on public.trends (app_id, metric_name, computed_at desc);
create index if not exists trends_period_end_idx          on public.trends (app_id, period_end desc);

create or replace function public.calculate_trend_percentage(p_current integer, p_previous integer)
returns numeric(7,2) language plpgsql immutable as $$
begin
  if coalesce(p_current,0)=0 and coalesce(p_previous,0)=0 then return 0.00; end if;
  if p_previous = 0 then
    return round(200.0 * (p_current::numeric - p_previous::numeric) / nullif(p_current::numeric + p_previous::numeric, 0), 2);
  end if;
  return round(((p_current - p_previous)::numeric / p_previous::numeric) * 100, 2);
end;
$$;

create index if not exists features_created_at_idx on public.features (created_at);
create index if not exists votes_created_at_idx    on public.votes    (created_at);
create index if not exists comments_created_at_idx on public.comments (created_at);

create or replace function public.refresh_trends(retention_days integer default 365)
returns void language plpgsql security definer set search_path = public as $$
declare
  tz text := 'Africa/Casablanca';
  now_utc timestamptz := now();
  local_now timestamp := now_utc at time zone tz;
  local_today_start timestamp := date_trunc('day', local_now);
  current_start timestamptz := (local_today_start - interval '7 days') at time zone tz;
  current_end   timestamptz := local_today_start at time zone tz;
  previous_end   timestamptz := current_start;
  previous_start timestamptz := previous_end - interval '7 days';
  v_app record;
  cur_features int; prv_features int;
  cur_votes    int; prv_votes int;
  cur_comments int; prv_comments int;
begin
  for v_app in select id from public.apps loop
    select count(*) into cur_features from public.features f
      where f.app_id = v_app.id and f.created_at >= current_start and f.created_at < current_end;
    select count(*) into prv_features from public.features f
      where f.app_id = v_app.id and f.created_at >= previous_start and f.created_at < previous_end;

    select count(*) into cur_votes from public.votes v
      join public.features f on f.id = v.feature_id
      where f.app_id = v_app.id and v.created_at >= current_start and v.created_at < current_end;
    select count(*) into prv_votes from public.votes v
      join public.features f on f.id = v.feature_id
      where f.app_id = v_app.id and v.created_at >= previous_start and v.created_at < previous_end;

    select count(*) into cur_comments from public.comments c
      join public.features f on f.id = c.feature_id
      where f.app_id = v_app.id and c.created_at >= current_start and c.created_at < current_end;
    select count(*) into prv_comments from public.comments c
      join public.features f on f.id = c.feature_id
      where f.app_id = v_app.id and c.created_at >= previous_start and c.created_at < previous_end;

    insert into public.trends (app_id, metric_name, current_value, previous_value, trend_percent, period_start, period_end)
    values
      (v_app.id, 'total_features', cur_features, prv_features, public.calculate_trend_percentage(cur_features, prv_features), current_start, current_end),
      (v_app.id, 'total_votes',    cur_votes,    prv_votes,    public.calculate_trend_percentage(cur_votes,    prv_votes),    current_start, current_end),
      (v_app.id, 'total_comments', cur_comments, prv_comments, public.calculate_trend_percentage(cur_comments, prv_comments), current_start, current_end)
    on conflict (app_id, metric_name, period_start, period_end)
    do update
      set current_value = excluded.current_value,
          previous_value = excluded.previous_value,
          trend_percent  = excluded.trend_percent,
          computed_at    = now();
  end loop;

  delete from public.trends where period_end < (now_utc - make_interval(days => retention_days));
end;
$$;

create or replace view public.trends_latest with (security_invoker = true, security_barrier = true) as
with ranked as (
  select t.*, row_number() over (partition by t.metric_name order by t.period_end desc, t.computed_at desc) rn
  from public.trends t
)
select id, metric_name, current_value, previous_value, trend_percent, period_start, period_end, computed_at
from ranked where rn = 1;

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
  select metric_name, current_value, previous_value, trend_percent, period_start, period_end, computed_at
  from public.trends_latest
  order by metric_name;
$$;

alter table public.trends enable row level security;
drop policy if exists trends_read_all on public.trends;
create policy trends_read_all on public.trends for select using (true);

-- hourly refresh (minute 7)
do $$
declare v_jobid bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_jobid from cron.job where jobname='trends_hourly';
    if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
    perform cron.schedule('trends_hourly','7 * * * *',$job$SELECT public.refresh_trends();$job$);
  end if;
end;
$$;

-- Seed one run (idempotent)
select public.refresh_trends();

-- --------------------------------------
-- Legacy admin function signature cleanup (idempotent)
-- --------------------------------------
do $$
begin
  drop function if exists public.admin_update_feature_status(text,text,uuid,text);
  drop function if exists public.admin_delete_feature(text,text,uuid);
end $$;

-- --------------------------------------
-- Default Admin
-- --------------------------------------
do $$
declare v_default_admin_exists boolean;
begin
  select exists(select 1 from public.users where email='admin@admin.com' and role='admin')
    into v_default_admin_exists;
  if not v_default_admin_exists then
    perform public.admin_upsert('admin@admin.com','Admin',null,'admin');
  end if;
end $$;

-- --------------------------------------
-- USER DELETE helper (cascade everything owned by the user)
-- --------------------------------------
create or replace function public.delete_user_cascade(p_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_user_exists boolean; v_user_email text;
begin
  select exists(select 1 from public.users where id = p_user_id) into v_user_exists;
  if not v_user_exists then raise exception 'User with ID % does not exist', p_user_id; end if;

  select email into v_user_email from public.users where id = p_user_id;

  delete from public.notifications where user_id = p_user_id;
  delete from public.votes where user_id = p_user_id;
  delete from public.comment_reactions where user_id = p_user_id;
  delete from public.comments where user_id = p_user_id;
  delete from public.features where user_id = p_user_id;
  update public.apps set created_by = null where created_by = p_user_id;
  delete from public.users where id = p_user_id;

  return true;
exception when others then
  return false;
end;
$$;

-- --------------------------------------
-- *** NEW *** ADMIN DELETE APP (with user cleanup)
-- --------------------------------------
create or replace function public.admin_delete_app(
  p_admin_id uuid,
  p_app_slug text,
  p_delete_shared_users boolean default false   -- DANGER: if true, deletes users even if active elsewhere
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_app_id uuid;
  v_user_ids uuid[];
begin
  -- verify admin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'invalid admin user';
  end if;

  -- resolve app
  select id into v_app_id from public.apps where slug = lower(trim(p_app_slug));
  if v_app_id is null then raise exception 'app not found: %', p_app_slug; end if;

  -- collect users linked to this app (before deletes) for optional forced removal
  if p_delete_shared_users then
    select array_agg(distinct u_id) into v_user_ids
    from (
      select f.user_id as u_id from public.features f where f.app_id = v_app_id
      union select c.user_id from public.comments c join public.features f on f.id = c.feature_id where f.app_id = v_app_id
      union select v.user_id from public.votes v join public.features f on f.id = v.feature_id where f.app_id = v_app_id
      union select cr.user_id from public.comment_reactions cr join public.comments c on c.id = cr.comment_id join public.features f on f.id = c.feature_id where f.app_id = v_app_id
      union select n.user_id from public.notifications n where n.app_id = v_app_id
      union select a.created_by from public.apps a where a.id = v_app_id
    ) s;
  end if;

  -- hard delete everything for this app (FK cascades do the work)
  delete from public.notifications where app_id = v_app_id; -- redundant but fast to prune first
  delete from public.features where app_id = v_app_id;      -- cascades votes/comments/reactions
  delete from public.trends   where app_id = v_app_id;
  delete from public.apps     where id     = v_app_id;      -- final

  -- remove ORPHAN users (non-admin) that have no remaining data anywhere
  delete from public.users u
  where u.role <> 'admin'
    and not exists (select 1 from public.features           f where f.user_id = u.id)
    and not exists (select 1 from public.comments           c where c.user_id = u.id)
    and not exists (select 1 from public.votes              v where v.user_id = u.id)
    and not exists (select 1 from public.comment_reactions cr where cr.user_id = u.id)
    and not exists (select 1 from public.notifications      n where n.user_id = u.id)
    and not exists (select 1 from public.apps               a where a.created_by = u.id);

  -- optionally force-delete captured users even if they still have data elsewhere (dangerous)
  if p_delete_shared_users and v_user_ids is not null then
    delete from public.users u
    where u.id = any (v_user_ids)
      and u.role <> 'admin';
    -- this will cascade (features.user_id ON DELETE CASCADE etc.)
  end if;

  return true;
end;
$$;


-- =====================================================================================
-- CONTINUATION: tighten admin moderation for comments + convenience admin-by-email RPCs
-- and finish RLS + GRANTS so the file is fully runnable end-to-end.
-- =====================================================================================

-- --------------------------------------
-- FIX: Require admin for comment moderation (replace earlier permissive versions)
-- --------------------------------------
drop function if exists public.admin_edit_comment(uuid, text);
drop function if exists public.admin_delete_comment(uuid);

create or replace function public.admin_edit_comment(
  p_admin_id  uuid,
  p_comment_id uuid,
  p_content    text
) returns table (
  id uuid,
  content text,
  edited_at timestamptz,
  author_name text,
  author_email text,
  author_image_url text,
  author_role text
)
language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'invalid admin user';
  end if;

  update public.comments
     set content = p_content, edited_at = now()
   where id = p_comment_id and is_deleted = false;

  return query
  select
    c.id, c.content, c.edited_at,
    u.name, u.email, u.image_url,
    u.role::text
  from public.comments c
  join public.users u on u.id = c.user_id
  where c.id = p_comment_id;
end;
$$;

create or replace function public.admin_delete_comment(
  p_admin_id  uuid,
  p_comment_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_cnt int;
begin
  if not exists (select 1 from public.users where id = p_admin_id and role = 'admin') then
    raise exception 'invalid admin user';
  end if;

  delete from public.comments where id = p_comment_id;
  get diagnostics v_cnt = row_count;
  return v_cnt > 0;
end;
$$;

-- --------------------------------------
-- Convenience wrappers: admin actions by email+password
-- --------------------------------------
create or replace function public.admin_id_from_credentials(
  p_email text,
  p_password text
) returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
begin
  return public.verify_admin_return_id(p_email, p_password);
end;
$$;

create or replace function public.admin_update_feature_status_by_email(
  p_admin_email text,
  p_admin_password text,
  p_feature_id uuid,
  p_new_status text
) returns public.features
language plpgsql security definer set search_path = public
as $$
declare v_admin_id uuid;
begin
  v_admin_id := public.admin_id_from_credentials(p_admin_email, p_admin_password);
  return public.admin_update_feature_status(v_admin_id, p_feature_id, p_new_status);
end;
$$;

create or replace function public.admin_edit_feature_by_email(
  p_admin_email text,
  p_admin_password text,
  p_feature_id uuid,
  p_title text,
  p_description text,
  p_status_slug text default null
) returns public.features
language plpgsql security definer set search_path = public
as $$
declare v_admin_id uuid;
begin
  v_admin_id := public.admin_id_from_credentials(p_admin_email, p_admin_password);
  return public.admin_edit_feature(v_admin_id, p_feature_id, p_title, p_description, p_status_slug);
end;
$$;

create or replace function public.admin_delete_feature_by_email(
  p_admin_email text,
  p_admin_password text,
  p_feature_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_admin_id uuid;
begin
  v_admin_id := public.admin_id_from_credentials(p_admin_email, p_admin_password);
  return public.admin_delete_feature(v_admin_id, p_feature_id);
end;
$$;

create or replace function public.admin_edit_comment_by_email(
  p_admin_email text,
  p_admin_password text,
  p_comment_id uuid,
  p_content text
) returns table (
  id uuid,
  content text,
  edited_at timestamptz,
  author_name text,
  author_email text,
  author_image_url text,
  author_role text
)
language plpgsql security definer set search_path = public
as $$
declare v_admin_id uuid;
begin
  v_admin_id := public.admin_id_from_credentials(p_admin_email, p_admin_password);
  return query select * from public.admin_edit_comment(v_admin_id, p_comment_id, p_content);
end;
$$;

create or replace function public.admin_delete_comment_by_email(
  p_admin_email text,
  p_admin_password text,
  p_comment_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_admin_id uuid;
begin
  v_admin_id := public.admin_id_from_credentials(p_admin_email, p_admin_password);
  return public.admin_delete_comment(v_admin_id, p_comment_id);
end;
$$;

create or replace function public.admin_delete_app_by_email(
  p_admin_email text,
  p_admin_password text,
  p_app_slug text,
  p_delete_shared_users boolean default false
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_admin_id uuid;
begin
  v_admin_id := public.admin_id_from_credentials(p_admin_email, p_admin_password);
  return public.admin_delete_app(v_admin_id, p_app_slug, p_delete_shared_users);
end;
$$;

-- --------------------------------------
-- RLS: Add explicit SELECT policies for primary tables (reads allowed)
-- --------------------------------------
drop policy if exists features_select_all on public.features;
create policy features_select_all on public.features for select using (true);

drop policy if exists votes_select_all on public.votes;
create policy votes_select_all on public.votes for select using (true);

drop policy if exists comments_select_all on public.comments;
create policy comments_select_all on public.comments for select using (true);

-- --------------------------------------
-- GRANTS (adjust to your roles; typical Supabase roles shown)
-- --------------------------------------
do $$
begin
  -- Views readable by everyone
  grant select on public.users_public, public.features_public, public.comments_public, public.notifications_public to anon, authenticated;

  -- Tables read via RLS select policies
  grant select on public.apps, public.statuses, public.features, public.votes, public.comments, public.comment_reactions, public.notifications, public.trends to anon, authenticated;

  -- Allow calling RPCs (SECURITY DEFINER handles auth semantics)
  grant execute on function
    public.ensure_user(text,text,text),
    public.create_feature(text,text,text,text,text,text),
    public.toggle_vote(text,text,text,uuid),
    public.add_comment(text,text,text,uuid,text,uuid),
    public.delete_comment_by_owner(text,uuid),
    public.soft_delete_comment_by_owner(text,uuid),
    public.toggle_comment_like(text,text,text,uuid),
    public.list_notifications(text,integer,integer),
    public.get_unread_notification_count(text),
    public.mark_all_notifications_read(text),
    public.mark_notification_read(uuid,text),
    public.get_latest_trends(),
    public.refresh_trends(integer)
  to anon, authenticated;

  -- Admin-only RPCs (you can restrict to service_role if preferred)
  grant execute on function
    public.admin_upsert(text,text,text,text),
    public.admin_change_password(text,text,text),
    public.admin_update_feature_status(uuid,uuid,text),
    public.admin_edit_feature(uuid,uuid,text,text,text),
    public.admin_delete_feature(uuid,uuid),
    public.admin_edit_comment(uuid,uuid,text),
    public.admin_delete_comment(uuid,uuid),
    public.admin_update_feature_status_by_email(text,text,uuid,text),
    public.admin_edit_feature_by_email(text,text,uuid,text,text,text),
    public.admin_delete_feature_by_email(text,text,uuid),
    public.admin_edit_comment_by_email(text,text,uuid,text),
    public.admin_delete_comment_by_email(text,text,uuid),
    public.admin_delete_app(uuid,text,boolean),
    public.admin_delete_app_by_email(text,text,text,boolean),
    public.delete_user_cascade(uuid)
  to authenticated;

  -- Trends maintenance via cron (service role)
  -- (No-op if you don't have a separate service role in your environment)
exception when others then
  -- ignore grant errors in environments without these roles
  null;
end $$;

-- --------------------------------------
-- FINAL CHECKS / ANALYZE HINTS (optional)
-- --------------------------------------
-- You can uncomment the following lines if you want to force a trends refresh now
-- select public.refresh_trends();

-- Done ✅
