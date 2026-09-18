create schema if not exists private;

create or replace function private.broadcast_dinner_room_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object('revision', new.revision),
    'room_changed',
    'room:' || new.realtime_token::text,
    false
  );
  return null;
end;
$$;

revoke all on function private.broadcast_dinner_room_update() from public, anon, authenticated;
grant execute on function private.broadcast_dinner_room_update() to service_role;

drop trigger if exists dinner_rooms_broadcast_update on public.dinner_rooms;
create trigger dinner_rooms_broadcast_update
after update on public.dinner_rooms
for each row execute function private.broadcast_dinner_room_update();
