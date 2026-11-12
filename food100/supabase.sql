-- 全民公投美食地圖：社群投稿／投票／官方店下架（Supabase 免費方案）
-- 請在既有專案 vuzfdndkushfoiljlxpv（花壇備品倉儲同一專案）的 SQL Editor 整份執行。
-- 只新增 food100_* 物件，不改動 wh_* 倉儲資料與函式。
-- 前端只使用 anon key；本檔不含 service_role。
-- 公開上架／下架條件一律由本檔的 view 在伺服器端判定，前端不可自行宣稱達標。

create table if not exists food100_stores (
  id text primary key,
  kind text not null check (kind in ('official','community')),
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  district text,
  category text,
  item text,
  price integer,
  hours_note text,
  note text,
  submitter_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_reason text,
  constraint food100_name_len check (char_length(name) between 1 and 40),
  constraint food100_addr_len check (char_length(address) between 1 and 80),
  constraint food100_item_len check (item is null or char_length(item) <= 40),
  constraint food100_note_len check (note is null or char_length(note) <= 200),
  constraint food100_hours_len check (hours_note is null or char_length(hours_note) <= 120),
  constraint food100_district_len check (district is null or char_length(district) <= 20),
  constraint food100_category_len check (category is null or char_length(category) <= 20),
  constraint food100_price_ok check (price is null or (price >= 1 and price <= 100)),
  constraint food100_community_submitter check (kind <> 'community' or submitter_id is not null)
);

create table if not exists food100_votes (
  store_id text not null references food100_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  vote smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);

create table if not exists food100_reports (
  store_id text not null references food100_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  reason text,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id),
  constraint food100_reason_len check (reason is null or char_length(reason) <= 200)
);

create or replace view food100_vote_tally as
select store_id,
  count(*) filter (where vote = 1)::int as upvotes,
  count(*) filter (where vote = -1)::int as downvotes
from food100_votes
group by store_id;

create or replace view food100_report_tally as
select store_id, count(*)::int as reports
from food100_reports
group by store_id;

-- 官方店：預設已上架；總票數滿 50 且不推薦超過 4 成，或隱藏／檢舉滿 10 則下架。
-- 網友投稿：推薦票 >= 100、未達下架比例、未隱藏且檢舉未滿 10 才公開。
-- 下架比例：total = up+down >= 50 且 down/total > 0.4（以 down*5 > total*2 計算，避免除以 0）。
-- 例：4000 推薦 / 250 不推薦 → 仍上架；20 / 40 → 下架；10 / 30（總 40）→ 仍上架。
create or replace view food100_public_shops as
select s.id, s.kind, s.name, s.address, s.lat, s.lng, s.district, s.category,
       s.item, s.price, s.hours_note, s.note, s.created_at,
       coalesce(v.upvotes,0) as upvotes,
       coalesce(v.downvotes,0) as downvotes
from food100_stores s
left join food100_vote_tally v on v.store_id = s.id
left join food100_report_tally r on r.store_id = s.id
where s.hidden_at is null
  and coalesce(r.reports,0) < 10
  and not (
    (coalesce(v.upvotes,0) + coalesce(v.downvotes,0)) >= 50
    and coalesce(v.downvotes,0) * 5 > (coalesce(v.upvotes,0) + coalesce(v.downvotes,0)) * 2
  )
  and (
    s.kind = 'official'
    or (s.kind = 'community' and coalesce(v.upvotes,0) >= 100)
  );

create or replace view food100_official_status as
select s.id,
       coalesce(v.upvotes,0) as upvotes,
       coalesce(v.downvotes,0) as downvotes,
       coalesce(r.reports,0) as reports,
       (s.hidden_at is null
         and coalesce(r.reports,0) < 10
         and not (
           (coalesce(v.upvotes,0) + coalesce(v.downvotes,0)) >= 50
           and coalesce(v.downvotes,0) * 5 > (coalesce(v.upvotes,0) + coalesce(v.downvotes,0)) * 2
         )) as listed
from food100_stores s
left join food100_vote_tally v on v.store_id = s.id
left join food100_report_tally r on r.store_id = s.id
where s.kind = 'official';

create or replace view food100_candidates as
select s.id, s.kind, s.name, s.address, s.lat, s.lng, s.district, s.category,
       s.item, s.price, s.hours_note, s.note, s.created_at,
       coalesce(v.upvotes,0) as upvotes,
       coalesce(v.downvotes,0) as downvotes
from food100_stores s
left join food100_vote_tally v on v.store_id = s.id
where s.hidden_at is null
  and s.kind = 'community'
  and not (
    (coalesce(v.upvotes,0) + coalesce(v.downvotes,0)) >= 50
    and coalesce(v.downvotes,0) * 5 > (coalesce(v.upvotes,0) + coalesce(v.downvotes,0)) * 2
  );

create or replace function food100_clean_text(t text, max_len int)
returns text language sql immutable as $$
  select nullif(left(trim(regexp_replace(coalesce(t,''), '<[^>]*>', '', 'g')), max_len), '');
$$;

create or replace function food100_submit(
  p_name text, p_address text, p_lat double precision, p_lng double precision,
  p_district text, p_category text, p_item text, p_price int, p_hours_note text, p_note text
) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_id text;
  n_today int;
  name_s text;
  addr_s text;
begin
  if uid is null then raise exception 'login-required'; end if;
  name_s := food100_clean_text(p_name, 40);
  addr_s := food100_clean_text(p_address, 80);
  if name_s is null or addr_s is null then
    raise exception 'invalid-input';
  end if;
  if p_price is not null and (p_price < 1 or p_price > 100) then
    raise exception 'invalid-price';
  end if;
  select count(*) into n_today from food100_stores
   where submitter_id = uid and kind = 'community'
     and (created_at at time zone 'Asia/Taipei')::date = (now() at time zone 'Asia/Taipei')::date;
  if n_today >= 5 then raise exception 'daily-limit'; end if;
  new_id := 'c_' || replace(gen_random_uuid()::text, '-', '');
  insert into food100_stores(id, kind, name, address, lat, lng, district, category, item, price, hours_note, note, submitter_id)
  values (
    new_id, 'community', name_s, addr_s, p_lat, p_lng,
    food100_clean_text(p_district, 20),
    food100_clean_text(p_category, 20),
    food100_clean_text(p_item, 40),
    p_price,
    food100_clean_text(p_hours_note, 120),
    food100_clean_text(p_note, 200),
    uid
  );
  return new_id;
end $$;

create or replace function food100_cast_vote(p_store text, p_vote smallint)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'login-required'; end if;
  if p_vote not in (1, -1, 0) then raise exception 'invalid-vote'; end if;
  if not exists (select 1 from food100_stores s where s.id = p_store and s.hidden_at is null) then
    raise exception 'not-found';
  end if;
  if p_vote = 0 then
    delete from food100_votes where store_id = p_store and user_id = uid;
    return;
  end if;
  insert into food100_votes(store_id, user_id, vote)
  values (p_store, uid, p_vote)
  on conflict (store_id, user_id) do update
    set vote = excluded.vote
    where food100_votes.user_id = uid;
end $$;

create or replace function food100_my_votes()
returns table(store_id text, vote smallint)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  return query
    select v.store_id, v.vote
    from food100_votes v
    where v.user_id = uid;
end;
$$;

create or replace function food100_report_store(p_store text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'login-required'; end if;
  if not exists (select 1 from food100_stores s where s.id = p_store and s.hidden_at is null) then
    raise exception 'not-found';
  end if;
  begin
    insert into food100_reports(store_id, user_id, reason)
    values (p_store, uid, food100_clean_text(p_reason, 200));
  exception when unique_violation then
    raise exception 'already-reported';
  end;
  select count(*) into n from food100_reports where store_id = p_store;
  if n >= 10 then
    update food100_stores
       set hidden_at = now(), hidden_reason = 'reports'
     where id = p_store and hidden_at is null;
  end if;
end $$;

revoke all on table food100_stores, food100_votes, food100_reports from public, anon, authenticated;
revoke all on function food100_submit, food100_cast_vote, food100_my_votes, food100_report_store, food100_clean_text from public, anon, authenticated;

alter table food100_stores enable row level security;
alter table food100_votes enable row level security;
alter table food100_reports enable row level security;

-- 不開放直接讀寫基表；anon／登入者只能讀 view、登入者只能呼叫函式。
-- 票數與上架條件由 view／函式計算。votes 以 primary key (store_id, user_id) 保證一帳一店一票，同一票可改投或收回。

drop policy if exists food100_votes_select_own on food100_votes;
drop policy if exists food100_votes_insert_own on food100_votes;
drop policy if exists food100_votes_update_own on food100_votes;
drop policy if exists food100_votes_delete_own on food100_votes;
-- 即使暫時 grant 也不允許改別人的票；預設不 grant 基表。前端仍只呼叫函式。
create policy food100_votes_select_own on food100_votes
  for select to authenticated using (user_id = auth.uid());
create policy food100_votes_insert_own on food100_votes
  for insert to authenticated with check (user_id = auth.uid());
create policy food100_votes_update_own on food100_votes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy food100_votes_delete_own on food100_votes
  for delete to authenticated using (user_id = auth.uid());

grant select on food100_public_shops, food100_official_status, food100_candidates to anon, authenticated;
grant execute on function food100_submit(text,text,double precision,double precision,text,text,text,int,text,text) to authenticated;
grant execute on function food100_cast_vote(text, smallint) to authenticated;
grant execute on function food100_my_votes() to authenticated;
grant execute on function food100_report_store(text, text) to authenticated;

insert into food100_stores (id, kind, name, address, lat, lng, district, category, item, price)
values
  ('ci-shang-bento','official','慈尚便當','臺中市西屯區西屯路二段華園巷7號1樓',24.165732,120.653986,'西屯區','便當','雙主菜便當',100),
  ('youqing-canteen','official','友青食堂','臺中市西屯區逢甲路8號',24.173909,120.638625,'西屯區','便當','秘醬烤肉飯',100),
  ('jengjong-qinghai','official','正忠排骨飯（青海店）','臺中市西屯區青海路一段36號',24.163681,120.65677,'西屯區','便當','排骨飯',100),
  ('leshi','official','樂蒔','臺中市西區昇平街141號1樓',24.145429,120.659605,'西區','定食','厚切排骨套餐',100),
  ('yutangchun','official','玉堂春魯肉飯','臺中市西區美村路一段220號',24.148797,120.661468,'西區','小吃','魯肉飯',35),
  ('caijia-noodles','official','蔡家麵線','臺中市北區永興街120號',24.161804,120.682477,'北區','麵','綜合麵線（大）',50),
  ('yongsheng-chicken','official','永盛雞肉飯','臺中市北區永興街121號',24.161831,120.682226,'北區','小吃','雞肉飯（大）',35),
  ('zhou-soup-dumpling','official','周湯包','臺中市北區一中街152號',24.15377,120.687027,'北區','小吃','鮮蝦湯包（6 顆）',75),
  ('fat-chicken-cutlet','official','胖子雞排','臺中市北區一中街20號',null,null,'北區','炸物','雞排',80),
  ('mini-stinky-tofu','official','迷你一口臭豆腐','臺中市北區一中街20號',null,null,'北區','小吃','迷你一口臭豆腐',65),
  ('wuji-crispy-baowan','official','吳記脆皮肉圓','臺中市北區太原路一段494號',24.164797,120.670897,'北區','小吃','現炸肉圓',45),
  ('tempura-yicai','official','路邊炸蝦天婦羅','臺中市北區育才北路37號1樓旁',24.152261,120.686446,'北區','炸物','招牌綜合天婦羅',80),
  ('zheng-dongshan-baowan','official','正東山肉圓','臺中市北屯區北平路四段68號',24.170168,120.690908,'北屯區','小吃','Q 皮肉圓',45),
  ('jengjong-changping','official','正忠排骨飯（昌平店）','臺中市北屯區昌平路一段97之7號',24.172723,120.690469,'北屯區','便當','排骨飯',100),
  ('zhedouyou-fried','official','這都有炸物','臺中市北屯區興安路二段43之1號',24.175894,120.69459,'北屯區','炸物','香菇鑲肉',50),
  ('aru-noodle','official','阿汝麵攤','臺中市南屯區大墩二街63號',24.138763,120.652321,'南屯區','便當','肉燥便當（小）',70),
  ('jianhong-bento','official','健宏飯担','臺中市南屯區向上路二段463號',24.146659,120.636694,'南屯區','便當','梅干爌肉便當',null),
  ('jengjong-dongxing','official','正忠排骨飯（東興店）','臺中市南屯區東興路二段356號',24.144824,120.653193,'南屯區','便當','排骨飯',100),
  ('sanshi-egg-pancake','official','三喜蛋餅','臺中市東區東光路64號',24.142918,120.697296,'東區','早午餐','九層塔蛋餅',55),
  ('chenmingtong','official','陳明統爌肉飯','臺中市東區忠孝路304號',24.132017,120.688034,'東區','小吃','爌肉飯',95),
  ('hezuo-damian','official','合作街大麵羹','臺中市南區合作街103號',24.127734,120.682584,'南區','麵','大麵羹',35),
  ('taichung-rouyuan','official','台中肉員','臺中市南區復興路三段529號',24.134475,120.682505,'南區','小吃','肉員',55),
  ('nanxing-baowan','official','南興肉圓（老店）','臺中市南區福德街120號',24.122849,120.663936,'南區','小吃','肉圓',35),
  ('little-pepper-banhmi','official','小辣椒越南麵包','臺中市南區信義南街318號',24.130865,120.68183,'南區','小吃','越南法國綜合麵包',95),
  ('jengjong-gongxue','official','正忠排骨飯（工學店）','臺中市南區工學路56號',24.117056,120.665826,'南區','便當','排骨飯',100),
  ('arashi-minced-pork','official','嵐肉燥專賣店','臺中市中區三民路二段87號',24.142365,120.678741,'中區','小吃','肉燥丸仔飯',70),
  ('dingshan-baowan','official','丁山肉丸','臺中市中區臺灣大道一段370號',24.142786,120.679417,'中區','小吃','肉丸',50),
  ('maochuan-baowan','official','茂川肉丸','臺中市中區臺灣大道一段401號',24.142913,120.678721,'中區','小吃','招牌肉圓',50),
  ('youjian-dumpling','official','有間大湯包','臺中市大里區益民路二段178號',24.108488,120.68409,'大里區','早午餐','大湯包',20),
  ('liangsanshu-baowan','official','涼傘樹肉圓','臺中市大里區大新街49號',24.099245,120.677898,'大里區','小吃','肉圓',25)
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  address = excluded.address,
  lat = excluded.lat,
  lng = excluded.lng,
  district = excluded.district,
  category = excluded.category,
  item = excluded.item,
  price = excluded.price;
