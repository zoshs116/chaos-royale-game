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
