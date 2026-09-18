create extension if not exists pgcrypto;

create table public.dinner_rooms (
  code text primary key check (code ~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  participants jsonb not null check (jsonb_typeof(participants) = 'array'),
  restaurants jsonb not null check (jsonb_typeof(restaurants) = 'array'),
  preferences jsonb not null check (jsonb_typeof(preferences) = 'object'),
  meta jsonb not null check (jsonb_typeof(meta) = 'object'),
  votes jsonb not null default '{}'::jsonb check (jsonb_typeof(votes) = 'object'),
  result_restaurant_id text,
  result_support integer not null default 0,
  fallback boolean not null default false,
  realtime_token uuid not null default gen_random_uuid(),
  revision bigint not null default 0
);

create index dinner_rooms_expires_at_idx on public.dinner_rooms (expires_at);

alter table public.dinner_rooms enable row level security;

revoke all on table public.dinner_rooms from public, anon, authenticated;
grant select, insert, update, delete on table public.dinner_rooms to service_role;

create or replace function public.girl_dinner_create_room(
  p_code text,
  p_expires_at timestamptz,
  p_participants jsonb,
  p_restaurants jsonb,
  p_preferences jsonb,
  p_meta jsonb
)
returns public.dinner_rooms
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.dinner_rooms;
begin
  delete from public.dinner_rooms where expires_at <= now();

  insert into public.dinner_rooms (
    code,
    expires_at,
    participants,
    restaurants,
    preferences,
    meta
  ) values (
    upper(p_code),
    p_expires_at,
    p_participants,
    p_restaurants,
    p_preferences,
    p_meta
  )
  returning * into v_room;

  return v_room;
end;
$$;

create or replace function public.girl_dinner_join_room(
  p_code text,
  p_slot integer
)
returns public.dinner_rooms
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.dinner_rooms;
  v_joined_at bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  select * into v_room
  from public.dinner_rooms
  where code = upper(p_code) and expires_at > now()
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_slot < 0 or p_slot >= jsonb_array_length(v_room.participants) then
    raise exception 'SEAT_NOT_FOUND' using errcode = '22023';
  end if;

  if (v_room.participants #> array[p_slot::text, 'joinedAt']) <> 'null'::jsonb then
    raise exception 'SEAT_TAKEN' using errcode = 'P0001';
  end if;

  update public.dinner_rooms
  set
    participants = jsonb_set(
      participants,
      array[p_slot::text, 'joinedAt'],
      to_jsonb(v_joined_at),
      false
    ),
    revision = revision + 1
  where code = v_room.code
  returning * into v_room;

  return v_room;
end;
$$;

create or replace function public.girl_dinner_record_vote(
  p_code text,
  p_participant_id text,
  p_restaurant_id text,
  p_vote text
)
returns public.dinner_rooms
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_room public.dinner_rooms;
  v_votes jsonb;
  v_participants jsonb;
  v_participant_index integer;
  v_all_completed boolean;
  v_restaurant jsonb;
  v_participant jsonb;
  v_reaction text;
  v_supporters integer;
  v_passes integer;
  v_table_score integer;
  v_restaurant_score numeric;
  v_best_restaurant_id text;
  v_best_supporters integer := -1;
  v_best_passes integer := 0;
  v_best_table_score integer := -100000;
  v_best_restaurant_score numeric := -1;
  v_required_support integer;
  v_result_restaurant_id text;
  v_result_support integer := 0;
  v_fallback boolean := false;
  v_completed_at bigint := floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if p_vote not in ('pass', 'interested', 'love') then
    raise exception 'INVALID_VOTE' using errcode = '22023';
  end if;

  select * into v_room
  from public.dinner_rooms
  where code = upper(p_code) and expires_at > now()
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002';
  end if;

  select (entry.ordinality - 1)::integer into v_participant_index
  from jsonb_array_elements(v_room.participants) with ordinality as entry(value, ordinality)
  where entry.value ->> 'id' = p_participant_id
  limit 1;

  if v_participant_index is null then
    raise exception 'PARTICIPANT_NOT_FOUND' using errcode = '42501';
  end if;

  if (v_room.participants #> array[v_participant_index::text, 'completedAt']) <> 'null'::jsonb then
    raise exception 'VOTING_COMPLETE' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_room.restaurants) as restaurant(value)
    where restaurant.value ->> 'id' = p_restaurant_id
  ) then
    raise exception 'RESTAURANT_NOT_FOUND' using errcode = '22023';
  end if;

  v_votes := jsonb_set(
    v_room.votes,
    array[p_participant_id],
    coalesce(v_room.votes -> p_participant_id, '{}'::jsonb)
      || jsonb_build_object(p_restaurant_id, p_vote),
    true
  );
  v_participants := v_room.participants;

  if jsonb_object_length(v_votes -> p_participant_id) >= jsonb_array_length(v_room.restaurants) then
    v_participants := jsonb_set(
      v_participants,
      array[v_participant_index::text, 'completedAt'],
      to_jsonb(v_completed_at),
      false
    );
  end if;

  select bool_and((entry.value -> 'completedAt') <> 'null'::jsonb)
  into v_all_completed
  from jsonb_array_elements(v_participants) as entry(value);

  if v_all_completed then
    for v_restaurant in
      select entry.value from jsonb_array_elements(v_room.restaurants) as entry(value)
    loop
      v_supporters := 0;
      v_passes := 0;
      v_table_score := 0;
      v_restaurant_score := coalesce((v_restaurant ->> 'score')::numeric, 0);

      for v_participant in
        select entry.value from jsonb_array_elements(v_participants) as entry(value)
      loop
        v_reaction := v_votes #>> array[v_participant ->> 'id', v_restaurant ->> 'id'];

        if v_reaction = 'love' then
          v_supporters := v_supporters + 1;
          v_table_score := v_table_score + 2;
        elsif v_reaction = 'interested' then
          v_supporters := v_supporters + 1;
          v_table_score := v_table_score + 1;
        else
          v_passes := v_passes + 1;
          v_table_score := v_table_score - 1;
        end if;
      end loop;

      if
        v_supporters > v_best_supporters
        or (v_supporters = v_best_supporters and v_table_score > v_best_table_score)
        or (
          v_supporters = v_best_supporters
          and v_table_score = v_best_table_score
          and v_restaurant_score > v_best_restaurant_score
        )
      then
        v_best_restaurant_id := v_restaurant ->> 'id';
        v_best_supporters := v_supporters;
        v_best_passes := v_passes;
        v_best_table_score := v_table_score;
        v_best_restaurant_score := v_restaurant_score;
      end if;
    end loop;

    v_required_support := ceil(jsonb_array_length(v_participants) * 0.6)::integer;

    if
      v_best_restaurant_id is not null
      and v_best_supporters >= v_required_support
      and v_best_table_score > 0
      and v_best_passes <= 1
    then
      v_result_restaurant_id := v_best_restaurant_id;
      v_result_support := v_best_supporters;
    else
      v_fallback := true;
    end if;
  end if;

  update public.dinner_rooms
  set
    participants = v_participants,
    votes = v_votes,
    result_restaurant_id = v_result_restaurant_id,
    result_support = v_result_support,
    fallback = v_fallback,
    revision = revision + 1
  where code = v_room.code
  returning * into v_room;

  return v_room;
end;
$$;

revoke all on function public.girl_dinner_create_room(text, timestamptz, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.girl_dinner_join_room(text, integer) from public, anon, authenticated;
revoke all on function public.girl_dinner_record_vote(text, text, text, text) from public, anon, authenticated;

grant execute on function public.girl_dinner_create_room(text, timestamptz, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.girl_dinner_join_room(text, integer) to service_role;
grant execute on function public.girl_dinner_record_vote(text, text, text, text) to service_role;
