create extension if not exists pgcrypto;

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    nickname text not null unique check (char_length(nickname) between 1 and 16),
    avatar_unit text not null default 'stone_cold',
    level integer not null default 1 check (level between 1 and 100),
    trophies integer not null default 0 check (trophies >= 0),
    gold integer not null default 0 check (gold >= 0),
    gems integer not null default 0 check (gems >= 0),
    wins integer not null default 0 check (wins >= 0),
    losses integer not null default 0 check (losses >= 0),
    selected_deck jsonb not null default '[]'::jsonb,
    updated_at timestamptz not null default now()
);

create table if not exists public.clans (
    id uuid primary key default gen_random_uuid(),
    name text not null check (char_length(name) between 2 and 20),
    owner_id uuid not null references public.profiles(id) on delete restrict,
    invite_code text not null unique,
    created_at timestamptz not null default now()
);

create table if not exists public.clan_members (
    clan_id uuid not null references public.clans(id) on delete cascade,
    profile_id uuid not null unique references public.profiles(id) on delete cascade,
    nickname text not null,
    level integer not null default 1,
    trophies integer not null default 0,
    role text not null default 'member' check (role in ('owner', 'member')),
    online boolean not null default true,
    ready boolean not null default false,
    joined_at timestamptz not null default now(),
    primary key (clan_id, profile_id)
);

create table if not exists public.clan_invites (
    id uuid primary key default gen_random_uuid(),
    clan_id uuid not null references public.clans(id) on delete cascade,
    from_user_id uuid not null references public.profiles(id) on delete cascade,
    to_user_id uuid not null references public.profiles(id) on delete cascade,
    to_nickname text not null,
    status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled', 'expired')),
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '24 hours')
);

create unique index if not exists clan_invites_one_pending_idx
    on public.clan_invites(clan_id, to_user_id)
    where status = 'pending';

create table if not exists public.clan_messages (
    id uuid primary key default gen_random_uuid(),
    clan_id uuid not null references public.clans(id) on delete cascade,
    author_id uuid not null references public.profiles(id) on delete cascade,
    author_name text not null,
    text text not null check (char_length(text) between 1 and 300),
    type text not null default 'chat' check (type in ('chat', 'friendly_request', 'system')),
    created_at timestamptz not null default now()
);

create table if not exists public.friendly_rooms (
    id uuid primary key default gen_random_uuid(),
    clan_id uuid not null references public.clans(id) on delete cascade,
    host_user_id uuid not null references public.profiles(id) on delete cascade,
    guest_user_id uuid not null references public.profiles(id) on delete cascade,
    host_name text not null,
    guest_name text not null,
    host_team text not null check (host_team in ('blue', 'red')),
    guest_team text not null check (guest_team in ('blue', 'red') and guest_team <> host_team),
    host_ready boolean not null default true,
    guest_ready boolean not null default false,
    status text not null default 'requested'
        check (status in ('requested', 'accepted', 'starting', 'in_battle', 'finished', 'declined', 'canceled', 'expired')),
    revision integer not null default 1,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '10 minutes'),
    check (host_user_id <> guest_user_id)
);

create unique index if not exists friendly_rooms_active_host_idx
    on public.friendly_rooms(host_user_id)
    where status in ('requested', 'accepted', 'starting', 'in_battle');
create unique index if not exists friendly_rooms_active_guest_idx
    on public.friendly_rooms(guest_user_id)
    where status in ('requested', 'accepted', 'starting', 'in_battle');

create table if not exists public.match_results (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null unique references public.friendly_rooms(id) on delete restrict,
    winner_team text not null check (winner_team in ('blue', 'red', 'draw')),
    blue_crowns integer not null check (blue_crowns between 0 and 3),
    red_crowns integer not null check (red_crowns between 0 and 3),
    result_digest text not null,
    started_at timestamptz not null,
    ended_at timestamptz not null,
    created_at timestamptz not null default now(),
    check (ended_at >= started_at)
);

alter table public.profiles enable row level security;
alter table public.clans enable row level security;
alter table public.clan_members enable row level security;
alter table public.clan_invites enable row level security;
alter table public.clan_messages enable row level security;
alter table public.friendly_rooms enable row level security;
alter table public.match_results enable row level security;

create or replace function public.is_clan_member(target_clan_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.clan_members
        where clan_id = target_clan_id and profile_id = target_user_id
    );
$$;

create or replace function public.is_clan_owner(target_clan_id uuid, target_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
    select exists (
        select 1 from public.clans
        where id = target_clan_id and owner_id = target_user_id
    );
$$;

grant execute on function public.is_clan_member(uuid, uuid) to authenticated;
grant execute on function public.is_clan_owner(uuid, uuid) to authenticated;

create policy "profiles own read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles own insert" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles own update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "clans member read" on public.clans for select to authenticated using (
    owner_id = auth.uid() or public.is_clan_member(id)
);
create policy "clans authenticated create" on public.clans for insert to authenticated with check (owner_id = auth.uid());
create policy "clans owner update" on public.clans for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "clans owner delete" on public.clans for delete to authenticated using (owner_id = auth.uid());

create policy "members clan read" on public.clan_members for select to authenticated using (
    profile_id = auth.uid() or public.is_clan_member(clan_id)
);
create policy "members owner manage" on public.clan_members for all to authenticated using (
    public.is_clan_owner(clan_id)
) with check (
    profile_id = auth.uid() or public.is_clan_owner(clan_id)
);

create policy "invites participant read" on public.clan_invites for select to authenticated using (
    from_user_id = auth.uid() or to_user_id = auth.uid()
);
create policy "invites member create" on public.clan_invites for insert to authenticated with check (
    from_user_id = auth.uid()
    and public.is_clan_member(clan_id)
);
create policy "invites participant update" on public.clan_invites for update to authenticated using (
    from_user_id = auth.uid() or to_user_id = auth.uid()
);
create policy "invites sender delete" on public.clan_invites for delete to authenticated using (
    from_user_id = auth.uid()
);

create policy "messages member read" on public.clan_messages for select to authenticated using (
    public.is_clan_member(clan_id)
);
create policy "messages member create" on public.clan_messages for insert to authenticated with check (
    author_id = auth.uid()
    and public.is_clan_member(clan_id)
);

create policy "rooms participant read" on public.friendly_rooms for select to authenticated using (
    host_user_id = auth.uid() or guest_user_id = auth.uid()
);
create policy "rooms host create" on public.friendly_rooms for insert to authenticated with check (host_user_id = auth.uid());
create policy "results participant read" on public.match_results for select to authenticated using (
    exists (
        select 1 from public.friendly_rooms room
        where room.id = room_id and (room.host_user_id = auth.uid() or room.guest_user_id = auth.uid())
    )
);

create or replace view public.profile_directory
with (security_invoker = false) as
select id, nickname, avatar_unit, level, trophies
from public.profiles;
revoke all on public.profile_directory from public, anon;
grant select on public.profile_directory to authenticated;

create or replace function public.accept_clan_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
    target public.clan_invites;
    target_profile public.profiles;
begin
    select * into target from public.clan_invites where id = invite_id for update;
    if target.id is null or target.to_user_id <> auth.uid() or target.status <> 'pending' or target.expires_at <= now() then
        raise exception 'invalid invite';
    end if;
    select * into target_profile from public.profiles where id = auth.uid();
    insert into public.clan_members(clan_id, profile_id, nickname, level, trophies, role)
    values(target.clan_id, auth.uid(), target_profile.nickname, target_profile.level, target_profile.trophies, 'member');
    update public.clan_invites set status = 'accepted' where id = invite_id;
end;
$$;

grant execute on function public.accept_clan_invite(uuid) to authenticated;

create or replace function public.create_clan(clan_name text, clan_invite_code text)
returns public.clans language plpgsql security definer set search_path = public as $$
declare
    profile public.profiles;
    created public.clans;
begin
    if auth.uid() is null then raise exception 'authentication required'; end if;
    if exists (select 1 from public.clan_members where profile_id = auth.uid()) then
        raise exception 'already in clan';
    end if;
    select * into profile from public.profiles where id = auth.uid();
    if profile.id is null then raise exception 'profile required'; end if;

    insert into public.clans(name, owner_id, invite_code)
    values(left(trim(clan_name), 20), auth.uid(), clan_invite_code)
    returning * into created;
    insert into public.clan_members(clan_id, profile_id, nickname, level, trophies, role, ready)
    values(created.id, auth.uid(), profile.nickname, profile.level, profile.trophies, 'owner', true);
    return created;
end;
$$;

grant execute on function public.create_clan(text, text) to authenticated;

create or replace function public.transition_friendly_room(
    target_room_id uuid,
    expected_revision integer,
    next_status text
) returns integer language plpgsql security definer set search_path = public as $$
declare
    room public.friendly_rooms;
    actor uuid := auth.uid();
begin
    select * into room from public.friendly_rooms where id = target_room_id for update;
    if room.id is null or actor not in (room.host_user_id, room.guest_user_id) then
        raise exception 'room not found';
    end if;
    if room.revision <> expected_revision then
        raise exception 'stale room revision';
    end if;
    if room.expires_at <= now() and room.status not in ('finished', 'canceled', 'declined', 'expired') then
        update public.friendly_rooms
        set status = 'expired', revision = revision + 1, updated_at = now()
        where id = room.id;
        raise exception 'room expired';
    end if;

    if not (
        (room.status = 'requested' and next_status = 'accepted' and actor = room.guest_user_id)
        or (room.status = 'requested' and next_status in ('declined', 'canceled') and actor in (room.host_user_id, room.guest_user_id))
        or (room.status = 'accepted' and next_status = 'starting' and actor = room.host_user_id)
        or (room.status in ('accepted', 'starting', 'in_battle') and next_status = 'canceled' and actor in (room.host_user_id, room.guest_user_id))
        or (room.status = 'starting' and next_status = 'in_battle' and actor = room.host_user_id)
        or (room.status = 'in_battle' and next_status = 'finished' and actor in (room.host_user_id, room.guest_user_id))
    ) then
        raise exception 'invalid room transition';
    end if;

    update public.friendly_rooms
    set
        status = next_status,
        guest_ready = case when next_status = 'accepted' then true else guest_ready end,
        revision = revision + 1,
        updated_at = now()
    where id = room.id
    returning revision into expected_revision;
    return expected_revision;
end;
$$;

grant execute on function public.transition_friendly_room(uuid, integer, text) to authenticated;

create or replace function public.apply_match_result(
    result_room_id uuid,
    result_winner text,
    result_blue_crowns integer,
    result_red_crowns integer,
    result_digest text,
    result_started_at timestamptz,
    result_ended_at timestamptz
) returns boolean language plpgsql security definer set search_path = public as $$
declare room public.friendly_rooms;
begin
    select * into room from public.friendly_rooms where id = result_room_id for update;
    if room.id is null or room.status not in ('starting', 'in_battle') then return false; end if;

    insert into public.match_results(
        room_id, winner_team, blue_crowns, red_crowns, result_digest, started_at, ended_at
    ) values (
        result_room_id, result_winner, result_blue_crowns, result_red_crowns,
        result_digest, result_started_at, result_ended_at
    ) on conflict (room_id) do nothing;
    if not found then return true; end if;

    update public.profiles set
        wins = wins + case
            when room.host_team = result_winner and id = room.host_user_id then 1
            when room.guest_team = result_winner and id = room.guest_user_id then 1
            else 0 end,
        losses = losses + case
            when result_winner <> 'draw' and room.host_team <> result_winner and id = room.host_user_id then 1
            when result_winner <> 'draw' and room.guest_team <> result_winner and id = room.guest_user_id then 1
            else 0 end,
        trophies = greatest(0, trophies + case
            when room.host_team = result_winner and id = room.host_user_id then 30
            when room.guest_team = result_winner and id = room.guest_user_id then 30
            when result_winner <> 'draw' then -30
            else 0 end),
        updated_at = now()
    where id in (room.host_user_id, room.guest_user_id);

    update public.friendly_rooms set status = 'finished', revision = revision + 1, updated_at = now()
    where id = result_room_id;
    return true;
end;
$$;

revoke all on function public.apply_match_result(uuid, text, integer, integer, text, timestamptz, timestamptz) from public, anon, authenticated;

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
