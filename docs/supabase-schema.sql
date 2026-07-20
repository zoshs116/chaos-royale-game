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

drop policy if exists "profiles own read" on public.profiles;
drop policy if exists "profiles own insert" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
drop policy if exists "clans member read" on public.clans;
drop policy if exists "clans authenticated create" on public.clans;
drop policy if exists "clans owner update" on public.clans;
drop policy if exists "clans owner delete" on public.clans;
drop policy if exists "members clan read" on public.clan_members;
drop policy if exists "members owner manage" on public.clan_members;
drop policy if exists "invites participant read" on public.clan_invites;
drop policy if exists "invites member create" on public.clan_invites;
drop policy if exists "invites participant update" on public.clan_invites;
drop policy if exists "invites sender delete" on public.clan_invites;
drop policy if exists "messages member read" on public.clan_messages;
drop policy if exists "messages member create" on public.clan_messages;
drop policy if exists "rooms participant read" on public.friendly_rooms;
drop policy if exists "rooms host create" on public.friendly_rooms;
drop policy if exists "results participant read" on public.match_results;

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

-- Authentication and profile hardening (2026-07-18)
alter table public.profiles
    add column if not exists profile_complete boolean not null default false;

alter table public.profiles
    drop constraint if exists profiles_selected_deck_shape;
alter table public.profiles
    add constraint profiles_selected_deck_shape check (
        jsonb_typeof(selected_deck) = 'array'
        and jsonb_array_length(selected_deck) <= 8
    );

create or replace function public.default_profile_nickname(user_id uuid)
returns text language sql immutable set search_path = public as $$
    select 'player_' || left(replace(user_id::text, '-', ''), 8);
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
    insert into public.profiles(id, nickname)
    values(new.id, public.default_profile_nickname(new.id))
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_auth_user();

insert into public.profiles(id, nickname)
select users.id, public.default_profile_nickname(users.id)
from auth.users users
where not exists (select 1 from public.profiles profile where profile.id = users.id)
on conflict do nothing;

create or replace function public.ensure_own_profile()
returns public.profiles language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    result public.profiles;
begin
    if actor is null then raise exception 'authentication required'; end if;
    insert into public.profiles(id, nickname)
    values(actor, public.default_profile_nickname(actor))
    on conflict (id) do nothing;
    select * into result from public.profiles where id = actor;
    return result;
end;
$$;

create or replace function public.update_own_profile(
    profile_nickname text,
    profile_avatar_unit text,
    profile_selected_deck jsonb
) returns public.profiles language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    clean_nickname text := trim(profile_nickname);
    clean_avatar text := trim(profile_avatar_unit);
    deck_count integer;
    unique_deck_count integer;
    result public.profiles;
begin
    if actor is null then raise exception 'authentication required'; end if;
    if char_length(clean_nickname) < 2 or char_length(clean_nickname) > 16 then
        raise exception 'nickname must be between 2 and 16 characters';
    end if;
    if clean_avatar !~ '^[a-z0-9_]{1,64}$' then
        raise exception 'invalid avatar unit';
    end if;
    if jsonb_typeof(profile_selected_deck) <> 'array' or jsonb_array_length(profile_selected_deck) > 8 then
        raise exception 'invalid deck';
    end if;
    if exists (
        select 1 from jsonb_array_elements(profile_selected_deck) item
        where jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 64
    ) then
        raise exception 'invalid deck item';
    end if;
    select count(*), count(distinct value)
    into deck_count, unique_deck_count
    from jsonb_array_elements_text(profile_selected_deck);
    if deck_count <> unique_deck_count then raise exception 'duplicate deck item'; end if;

    perform public.ensure_own_profile();
    update public.profiles
    set nickname = clean_nickname,
        avatar_unit = clean_avatar,
        selected_deck = profile_selected_deck,
        profile_complete = true,
        updated_at = now()
    where id = actor
    returning * into result;
    return result;
exception
    when unique_violation then raise exception 'nickname already exists' using errcode = '23505';
end;
$$;

drop policy if exists "profiles own insert" on public.profiles;
drop policy if exists "profiles own update" on public.profiles;
revoke insert, update, delete on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;

revoke all on function public.ensure_own_profile() from public, anon;
grant execute on function public.ensure_own_profile() to authenticated;
revoke all on function public.update_own_profile(text, text, jsonb) from public, anon;
grant execute on function public.update_own_profile(text, text, jsonb) to authenticated;

-- Clan and social hardening (2026-07-18)
alter table public.clan_invites
    add column if not exists clan_name text,
    add column if not exists from_user_name text;

update public.clan_invites invite
set clan_name = clan.name,
    from_user_name = profile.nickname
from public.clans clan, public.profiles profile
where invite.clan_id = clan.id
  and invite.from_user_id = profile.id
  and (invite.clan_name is null or invite.from_user_name is null);

alter table public.clan_invites
    alter column clan_name set not null,
    alter column from_user_name set not null;

alter table public.clan_members alter column online set default false;
update public.clan_members set online = false;

create unique index if not exists profiles_nickname_ci_uidx
    on public.profiles(lower(nickname));

create or replace view public.clan_member_directory
with (security_invoker = false) as
select member.clan_id,
       member.profile_id,
       profile.nickname,
       profile.level,
       profile.trophies,
       member.role,
       member.ready,
       member.joined_at
from public.clan_members member
join public.profiles profile on profile.id = member.profile_id
where public.is_clan_member(member.clan_id);
revoke all on public.clan_member_directory from public, anon;
grant select on public.clan_member_directory to authenticated;

drop function if exists public.create_clan(text, text);
create or replace function public.create_clan(clan_name text)
returns public.clans language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    clean_name text := trim(clan_name);
    profile public.profiles;
    created public.clans;
    generated_code text;
begin
    if actor is null then raise exception 'authentication required'; end if;
    if char_length(clean_name) < 2 or char_length(clean_name) > 20 then
        raise exception 'clan name must be between 2 and 20 characters';
    end if;
    if exists (select 1 from public.clan_members where profile_id = actor) then
        raise exception 'already in clan';
    end if;
    select * into profile from public.profiles where id = actor;
    if profile.id is null then raise exception 'profile required'; end if;

    loop
        generated_code := 'CHAOS-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
        exit when not exists (select 1 from public.clans where invite_code = generated_code);
    end loop;

    insert into public.clans(name, owner_id, invite_code)
    values(clean_name, actor, generated_code)
    returning * into created;
    insert into public.clan_members(clan_id, profile_id, nickname, level, trophies, role, online, ready)
    values(created.id, actor, profile.nickname, profile.level, profile.trophies, 'owner', false, true);
    insert into public.clan_messages(clan_id, author_id, author_name, text, type)
    values(created.id, actor, '시스템', clean_name || ' 클랜이 만들어졌습니다.', 'system');
    return created;
end;
$$;

create or replace function public.create_clan_invite(target_nickname text)
returns public.clan_invites language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    clean_nickname text := trim(target_nickname);
    actor_profile public.profiles;
    target_profile public.profiles;
    membership public.clan_members;
    clan public.clans;
    created public.clan_invites;
begin
    if actor is null then raise exception 'authentication required'; end if;
    select * into actor_profile from public.profiles where id = actor;
    select * into membership from public.clan_members where profile_id = actor;
    if membership.profile_id is null then raise exception 'clan membership required'; end if;
    select * into clan from public.clans where id = membership.clan_id;
    select * into target_profile from public.profiles where lower(nickname) = lower(clean_nickname);
    if target_profile.id is null then raise exception 'target profile not found'; end if;
    if target_profile.id = actor then raise exception 'cannot invite yourself'; end if;
    if exists (select 1 from public.clan_members where profile_id = target_profile.id) then
        raise exception 'target already belongs to a clan';
    end if;

    update public.clan_invites
    set status = 'expired'
    where status = 'pending' and expires_at <= now();
    if exists (
        select 1 from public.clan_invites
        where clan_id = clan.id and to_user_id = target_profile.id and status = 'pending'
    ) then
        raise exception 'pending invite already exists';
    end if;

    insert into public.clan_invites(
        clan_id, from_user_id, to_user_id, to_nickname, clan_name, from_user_name, status
    ) values (
        clan.id, actor, target_profile.id, target_profile.nickname, clan.name, actor_profile.nickname, 'pending'
    ) returning * into created;
    return created;
end;
$$;

create or replace function public.cancel_clan_invite(target_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
    if actor is null then raise exception 'authentication required'; end if;
    update public.clan_invites
    set status = 'canceled'
    where id = target_invite_id and from_user_id = actor and status = 'pending';
    if not found then raise exception 'pending sent invite not found'; end if;
end;
$$;

create or replace function public.decline_clan_invite(target_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
    if actor is null then raise exception 'authentication required'; end if;
    update public.clan_invites
    set status = 'declined'
    where id = target_invite_id and to_user_id = actor and status = 'pending';
    if not found then raise exception 'pending received invite not found'; end if;
end;
$$;

create or replace function public.accept_clan_invite(invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    target public.clan_invites;
    target_profile public.profiles;
begin
    if actor is null then raise exception 'authentication required'; end if;
    select * into target from public.clan_invites where id = invite_id for update;
    if target.id is null
       or target.to_user_id is distinct from actor
       or target.status <> 'pending'
       or target.expires_at <= now() then
        raise exception 'invalid invite';
    end if;
    if exists (select 1 from public.clan_members where profile_id = actor) then
        raise exception 'already in clan';
    end if;
    select * into target_profile from public.profiles where id = actor;
    if target_profile.id is null then raise exception 'profile required'; end if;

    insert into public.clan_members(clan_id, profile_id, nickname, level, trophies, role, online, ready)
    values(target.clan_id, actor, target_profile.nickname, target_profile.level, target_profile.trophies, 'member', false, false);
    update public.clan_invites set status = 'accepted' where id = invite_id;
    update public.clan_invites
    set status = 'declined'
    where to_user_id = actor and id <> invite_id and status = 'pending';
    insert into public.clan_messages(clan_id, author_id, author_name, text, type)
    values(target.clan_id, actor, '시스템', target_profile.nickname || ' 님이 클랜에 가입했습니다.', 'system');
end;
$$;

create or replace function public.remove_clan_member(target_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    clan public.clans;
    target_profile public.profiles;
begin
    if actor is null then raise exception 'authentication required'; end if;
    select * into clan from public.clans where owner_id = actor;
    if clan.id is null then raise exception 'clan owner required'; end if;
    if target_profile_id = actor then raise exception 'owner cannot remove self'; end if;
    select * into target_profile from public.profiles where id = target_profile_id;
    update public.friendly_rooms
    set status = 'canceled', revision = revision + 1, updated_at = now()
    where clan_id = clan.id
      and target_profile_id in (host_user_id, guest_user_id)
      and status in ('requested', 'accepted', 'starting', 'in_battle');
    delete from public.clan_members
    where clan_id = clan.id and profile_id = target_profile_id and role <> 'owner';
    if not found then raise exception 'clan member not found'; end if;
    insert into public.clan_messages(clan_id, author_id, author_name, text, type)
    values(clan.id, actor, '시스템', coalesce(target_profile.nickname, '멤버') || ' 님이 클랜에서 나갔습니다.', 'system');
end;
$$;

create or replace function public.leave_clan()
returns void language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    membership public.clan_members;
    profile public.profiles;
    member_count integer;
begin
    if actor is null then raise exception 'authentication required'; end if;
    select * into membership from public.clan_members where profile_id = actor for update;
    if membership.profile_id is null then raise exception 'clan membership not found'; end if;
    select * into profile from public.profiles where id = actor;
    select count(*) into member_count from public.clan_members where clan_id = membership.clan_id;

    if membership.role = 'owner' then
        if member_count > 1 then raise exception 'owner must remove members before disbanding clan'; end if;
        delete from public.clans where id = membership.clan_id;
        return;
    end if;

    update public.friendly_rooms
    set status = 'canceled', revision = revision + 1, updated_at = now()
    where clan_id = membership.clan_id
      and actor in (host_user_id, guest_user_id)
      and status in ('requested', 'accepted', 'starting', 'in_battle');
    insert into public.clan_messages(clan_id, author_id, author_name, text, type)
    values(membership.clan_id, actor, '시스템', profile.nickname || ' 님이 클랜을 떠났습니다.', 'system');
    delete from public.clan_members where clan_id = membership.clan_id and profile_id = actor;
end;
$$;

create or replace function public.send_clan_message(message_text text)
returns public.clan_messages language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    clean_text text := trim(message_text);
    membership public.clan_members;
    profile public.profiles;
    created public.clan_messages;
begin
    if actor is null then raise exception 'authentication required'; end if;
    if char_length(clean_text) < 1 or char_length(clean_text) > 300 then
        raise exception 'message must be between 1 and 300 characters';
    end if;
    select * into membership from public.clan_members where profile_id = actor;
    if membership.profile_id is null then raise exception 'clan membership required'; end if;
    select * into profile from public.profiles where id = actor;
    insert into public.clan_messages(clan_id, author_id, author_name, text, type)
    values(membership.clan_id, actor, profile.nickname, clean_text, 'chat')
    returning * into created;
    return created;
end;
$$;

create or replace function public.create_friendly_room(target_profile_id uuid)
returns public.friendly_rooms language plpgsql security definer set search_path = public as $$
declare
    actor uuid := auth.uid();
    actor_membership public.clan_members;
    target_membership public.clan_members;
    actor_profile public.profiles;
    target_profile public.profiles;
    host_team_value text;
    created public.friendly_rooms;
begin
    if actor is null then raise exception 'authentication required'; end if;
    if target_profile_id = actor then raise exception 'cannot challenge yourself'; end if;

    perform 1
    from public.clan_members
    where profile_id in (actor, target_profile_id)
    order by profile_id
    for update;

    select * into actor_membership from public.clan_members where profile_id = actor;
    select * into target_membership from public.clan_members where profile_id = target_profile_id;
    if actor_membership.profile_id is null
       or target_membership.profile_id is null
       or actor_membership.clan_id <> target_membership.clan_id then
        raise exception 'friendly battle requires members of the same clan';
    end if;

    select * into actor_profile from public.profiles where id = actor;
    select * into target_profile from public.profiles where id = target_profile_id;
    if actor_profile.id is null or target_profile.id is null then raise exception 'profile required'; end if;

    update public.friendly_rooms
    set status = 'expired', revision = revision + 1, updated_at = now()
    where status in ('requested', 'accepted', 'starting', 'in_battle')
      and expires_at <= now()
      and (actor in (host_user_id, guest_user_id) or target_profile_id in (host_user_id, guest_user_id));

    if exists (
        select 1 from public.friendly_rooms
        where status in ('requested', 'accepted', 'starting', 'in_battle')
          and (actor in (host_user_id, guest_user_id) or target_profile_id in (host_user_id, guest_user_id))
    ) then
        raise exception 'one of the players already has an active friendly battle';
    end if;

    host_team_value := case when random() < 0.5 then 'blue' else 'red' end;
    insert into public.friendly_rooms(
        clan_id, host_user_id, guest_user_id, host_name, guest_name,
        host_team, guest_team, status, host_ready, guest_ready
    ) values (
        actor_membership.clan_id, actor, target_profile_id, actor_profile.nickname, target_profile.nickname,
        host_team_value, case when host_team_value = 'blue' then 'red' else 'blue' end,
        'requested', true, false
    ) returning * into created;

    return created;
end;
$$;

drop policy if exists "clans authenticated create" on public.clans;
drop policy if exists "clans owner update" on public.clans;
drop policy if exists "clans owner delete" on public.clans;
drop policy if exists "members owner manage" on public.clan_members;
drop policy if exists "invites member create" on public.clan_invites;
drop policy if exists "invites participant update" on public.clan_invites;
drop policy if exists "invites sender delete" on public.clan_invites;
drop policy if exists "messages member create" on public.clan_messages;
drop policy if exists "rooms host create" on public.friendly_rooms;

revoke insert, update, delete on public.clans from public, anon, authenticated;
revoke insert, update, delete on public.clan_members from public, anon, authenticated;
revoke insert, update, delete on public.clan_invites from public, anon, authenticated;
revoke insert, update, delete on public.clan_messages from public, anon, authenticated;
revoke insert, update, delete on public.friendly_rooms from public, anon, authenticated;
grant select on public.clans, public.clan_members, public.clan_invites, public.clan_messages to authenticated;
grant select on public.friendly_rooms to authenticated;

revoke all on function public.create_clan(text) from public, anon;
revoke all on function public.create_clan_invite(text) from public, anon;
revoke all on function public.cancel_clan_invite(uuid) from public, anon;
revoke all on function public.decline_clan_invite(uuid) from public, anon;
revoke all on function public.accept_clan_invite(uuid) from public, anon;
revoke all on function public.remove_clan_member(uuid) from public, anon;
revoke all on function public.leave_clan() from public, anon;
revoke all on function public.send_clan_message(text) from public, anon;
revoke all on function public.create_friendly_room(uuid) from public, anon;
revoke all on function public.transition_friendly_room(uuid, integer, text) from public, anon;
grant execute on function public.create_clan(text) to authenticated;
grant execute on function public.create_clan_invite(text) to authenticated;
grant execute on function public.cancel_clan_invite(uuid) to authenticated;
grant execute on function public.decline_clan_invite(uuid) to authenticated;
grant execute on function public.accept_clan_invite(uuid) to authenticated;
grant execute on function public.remove_clan_member(uuid) to authenticated;
grant execute on function public.leave_clan() to authenticated;
grant execute on function public.send_clan_message(text) to authenticated;
grant execute on function public.create_friendly_room(uuid) to authenticated;
grant execute on function public.transition_friendly_room(uuid, integer, text) to authenticated;
