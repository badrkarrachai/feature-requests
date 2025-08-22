-- Run this in Supabase SQL editor

create type feature_status as enum ('open','planned','in_progress','done');

create table if not exists public.features (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  status feature_status not null default 'open',
  votes_count int not null default 0,
  comments_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.features(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  unique (feature_id, email)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  feature_id uuid not null references public.features(id) on delete cascade,
  email text not null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Keep updated_at fresh
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_features_updated on public.features;
create trigger trg_features_updated
before update on public.features
for each row execute procedure set_updated_at();

-- Maintain votes_count
create or replace function sync_votes_count()
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
for each row execute procedure sync_votes_count();

-- Maintain comments_count
create or replace function sync_comments_count()
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
for each row execute procedure sync_comments_count();

-- RLS: lock tables (API uses service role)
alter table public.features enable row level security;
alter table public.votes enable row level security;
alter table public.comments enable row level security;

drop policy if exists features_read on public.features;
drop policy if exists votes_read on public.votes;
drop policy if exists comments_read on public.comments;

create policy features_read on public.features
for select using (true);  -- safe to read publicly if you ever expose anon key

create policy votes_read on public.votes
for select using (true);

create policy comments_read on public.comments
for select using (true);

-- No insert/update/delete policies for anon; only service role (API) can write.
