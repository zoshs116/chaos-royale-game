-- Chaos Royale prototype multiplayer schema.
-- Apply this in Supabase SQL Editor before testing realtime clan features.
-- This is intentionally permissive for a private prototype that only uses the publishable key.
-- Tighten RLS with Supabase Auth before public release.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id text primary key,
    nickname text not null unique,
    avatar_unit text not null default 'stone_cold',
    level integer not null default 1,
    trophies integer not null default 0,
    gold integer not null default 0,
    gems integer not null default 0,
    wins integer not null default 0,
    losses integer not null default 0,
    selected_deck jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.clans (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    owner_id text not null references public.profiles(id) on delete cascade,
    invite_code text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.clan_members (
    clan_id uuid not null references public.clans(id) on delete cascade,
    profile_id text not null references public.profiles(id) on delete cascade,
    nickname text not null,
    level integer not null default 1,
    trophies integer not null default 0,
    role text not null default 'member',
    online boolean not null default true,
    ready boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (clan_id, profile_id)
);

create table if not exists public.clan_invites (
    id uuid primary key default gen_random_uuid(),
    clan_id uuid not null references public.clans(id) on delete cascade,
    from_user_id text not null references public.profiles(id) on delete cascade,
    to_nickname text not null,
    status text not null default 'pending',
    created_at timestamptz not null default now()
);

create table if not exists public.clan_messages (
    id uuid primary key default gen_random_uuid(),
    clan_id uuid not null references public.clans(id) on delete cascade,
    author_id text not null references public.profiles(id) on delete cascade,
    author_name text not null,
    text text not null,
    type text not null default 'chat',
    created_at timestamptz not null default now()
);

create table if not exists public.friendly_rooms (
    id uuid primary key default gen_random_uuid(),
    clan_id uuid not null references public.clans(id) on delete cascade,
    host_user_id text not null references public.profiles(id) on delete cascade,
    guest_user_id text references public.profiles(id) on delete set null,
    host_name text not null,
    guest_name text,
    host_team text not null,
    guest_team text not null,
    status text not null default 'requested',
    created_at timestamptz not null default now()
);

create index if not exists profiles_nickname_idx on public.profiles(nickname);
create index if not exists clan_invites_clan_idx on public.clan_invites(clan_id, created_at desc);
create index if not exists clan_messages_clan_idx on public.clan_messages(clan_id, created_at asc);
create index if not exists friendly_rooms_clan_idx on public.friendly_rooms(clan_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_invites enable row level security;
alter table public.clan_messages enable row level security;
alter table public.friendly_rooms enable row level security;

drop policy if exists "prototype profiles all" on public.profiles;
drop policy if exists "prototype clans all" on public.clans;
drop policy if exists "prototype clan members all" on public.clan_members;
drop policy if exists "prototype clan invites all" on public.clan_invites;
drop policy if exists "prototype clan messages all" on public.clan_messages;
drop policy if exists "prototype friendly rooms all" on public.friendly_rooms;

create policy "prototype profiles all" on public.profiles for all using (true) with check (true);
create policy "prototype clans all" on public.clans for all using (true) with check (true);
create policy "prototype clan members all" on public.clan_members for all using (true) with check (true);
create policy "prototype clan invites all" on public.clan_invites for all using (true) with check (true);
create policy "prototype clan messages all" on public.clan_messages for all using (true) with check (true);
create policy "prototype friendly rooms all" on public.friendly_rooms for all using (true) with check (true);

do $$
begin
    alter publication supabase_realtime add table public.clan_members;
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.clan_invites;
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.clan_messages;
exception when duplicate_object then null;
end $$;

do $$
begin
    alter publication supabase_realtime add table public.friendly_rooms;
exception when duplicate_object then null;
end $$;
