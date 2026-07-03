-- Drop existing tables to start fresh
drop table if exists reply_analytics cascade;
drop table if exists monitored_threads cascade;
drop table if exists keywords cascade;
drop table if exists usage_logs cascade;
drop table if exists profiles cascade;

-- Core tables
create table profiles (
  id uuid primary key references auth.users(id),
  business_name text,
  business_description text,
  business_url text,
  business_type text,
  writing_style text,
  reddit_username text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
  last_polled_at timestamptz,
  created_at timestamptz default now()
);

create table keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  term text not null,
  platform text not null default 'reddit' check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  target text not null, -- subreddit name, bluesky search query, x query, threads query
  is_active boolean default true,
  created_at timestamptz default now()
);

create table monitored_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  keyword_id uuid references keywords(id) on delete set null,
  platform text not null check (platform in ('reddit', 'bluesky', 'x', 'threads')),
  external_id text not null,
  author text,
  text_content text,
  url text,
  intent_score numeric,
  status text default 'pending' check (status in ('pending', 'drafted', 'needs_manual_reply', 'dismissed', 'replied')),
  created_at timestamptz default now(),
  unique (platform, external_id)
);

create table reply_analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  thread_id uuid references monitored_threads(id) on delete cascade,
  draft_text text,
  edited_text text,
  was_sent boolean default false,
  sent_at timestamptz,
  created_at timestamptz default now()
);

-- AI usage budgeting (see Section 4.3)
create table usage_logs (
  user_id uuid references profiles(id) on delete cascade,
  date date default current_date,
  gemini_calls int default 0,
  claude_calls int default 0,
  primary key (user_id, date)
);

-- Row Level Security — enable from day one, not retrofitted
alter table profiles enable row level security;
alter table keywords enable row level security;
alter table monitored_threads enable row level security;
alter table reply_analytics enable row level security;
alter table usage_logs enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id);
create policy "own keywords" on keywords for all using (auth.uid() = user_id);
create policy "own threads" on monitored_threads for all using (auth.uid() = user_id);
create policy "own analytics" on reply_analytics for all using (auth.uid() = user_id);
create policy "own usage" on usage_logs for all using (auth.uid() = user_id);

-- Atomic budget check
create or replace function increment_usage_if_under_limit(
  p_user_id uuid, p_service text, p_limit int
) returns boolean
language plpgsql
as $$
declare current_count int;
begin
  insert into usage_logs (user_id, date) values (p_user_id, current_date)
    on conflict (user_id, date) do nothing;

  if p_service = 'gemini' then
    select gemini_calls into current_count from usage_logs where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set gemini_calls = gemini_calls + 1 where user_id = p_user_id and date = current_date;
  else
    select claude_calls into current_count from usage_logs where user_id = p_user_id and date = current_date for update;
    if current_count >= p_limit then return false; end if;
    update usage_logs set claude_calls = claude_calls + 1 where user_id = p_user_id and date = current_date;
  end if;
  return true;
end;
$$;
