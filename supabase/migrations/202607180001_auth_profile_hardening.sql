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
