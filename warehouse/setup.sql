-- 花壇備品倉儲 Supabase setup (paste into Supabase SQL Editor once)
create table if not exists wh_state(id text primary key, data jsonb not null, rev bigint not null default 1, updated_at timestamptz default now());
alter table wh_state enable row level security; -- no policies: anon cannot touch table directly
create or replace function wh_ok(d jsonb,u text,ph text,roles text[]) returns boolean language sql immutable as $$
 select coalesce(d->'users'->u->>'h' = ph and (d->'users'->u->>'role') = any(roles), false) $$;
create or replace function wh_get(u text, ph text) returns jsonb language plpgsql security definer set search_path=public as $$
declare r wh_state; begin select * into r from wh_state where id='main';
 if r is null then return jsonb_build_object('empty',true); end if;
 if not wh_ok(r.data,u,ph,array['admin','stock','viewer']) then raise exception 'auth'; end if;
 return jsonb_build_object('data',r.data,'rev',r.rev); end $$;
create or replace function wh_rev(u text, ph text) returns bigint language plpgsql security definer set search_path=public as $$
declare r wh_state; begin select * into r from wh_state where id='main'; if r is null then return 0; end if;
 if not wh_ok(r.data,u,ph,array['admin','stock','viewer']) then raise exception 'auth'; end if; return r.rev; end $$;
create or replace function wh_put(u text, ph text, d jsonb) returns bigint language plpgsql security definer set search_path=public as $$
declare r wh_state; begin select * into r from wh_state where id='main' for update;
 if r is null then
   if not wh_ok(d,u,ph,array['admin']) then raise exception 'auth'; end if;
   insert into wh_state(id,data) values('main',d); return 1; end if;
 if not wh_ok(r.data,u,ph,array['admin','stock']) then raise exception 'auth'; end if;
 if coalesce(r.data->'users'->u->>'role','')<>'admin' and d->'users' is distinct from r.data->'users' then raise exception 'users-admin-only'; end if;
 update wh_state set data=d, rev=r.rev+1, updated_at=now() where id='main'; return r.rev+1; end $$;
revoke all on function wh_get,wh_rev,wh_put from public; grant execute on function wh_get,wh_rev,wh_put to anon;
