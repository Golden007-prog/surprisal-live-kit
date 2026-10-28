-- Surprisal Live Kit: the database. Run this once in the SQL editor of your Supabase project.
-- Safe to run twice.
--
-- RLS is on with no policies, so only the service role (api/live.ts, with SUPABASE_SERVICE_ROLE_KEY) reads and
-- writes. Times are epoch milliseconds (bigint) set by the function, so quiz timing compares one clock with itself.
-- A participant is a random id from the phone's localStorage plus a nickname: no account, no email.

create table if not exists public.live_sessions (
  code text primary key check (code ~ '^[A-Z]{4}$'),
  title text not null check (char_length(title) between 1 and 160),
  deck jsonb not null,
  idx integer not null default 0,
  phase text not null default 'live' check (phase in ('live', 'ended')),
  accepting boolean not null default false,
  show_results boolean not null default true,
  timers jsonb not null default '{}'::jsonb,
  hidden jsonb not null default '[]'::jsonb,
  host_hash text not null,
  created_at bigint not null
);

create table if not exists public.live_participants (
  session_code text not null references public.live_sessions (code) on delete cascade,
  participant_id text not null check (participant_id ~ '^[a-z0-9]{8,32}$'),
  name text not null check (char_length(name) between 1 and 32),
  joined_at timestamptz not null default now(),
  primary key (session_code, participant_id)
);

-- One answer per person per slide: the primary key is the rule.
create table if not exists public.live_responses (
  session_code text not null references public.live_sessions (code) on delete cascade,
  slide_id text not null check (char_length(slide_id) between 1 and 24),
  participant_id text not null,
  value jsonb not null,
  at bigint not null,
  primary key (session_code, slide_id, participant_id)
);

create table if not exists public.live_questions (
  id text primary key,
  session_code text not null references public.live_sessions (code) on delete cascade,
  slide_id text not null,
  participant_id text not null,
  text text not null check (char_length(text) between 1 and 240),
  answered boolean not null default false,
  hidden boolean not null default false,
  -- Caught by the word filter in a deck with `hold` on: off the screen until the host approves it.
  held boolean not null default false,
  at bigint not null
);
create index if not exists live_questions_session on public.live_questions (session_code, slide_id);

create table if not exists public.live_votes (
  question_id text not null references public.live_questions (id) on delete cascade,
  participant_id text not null,
  session_code text not null references public.live_sessions (code) on delete cascade,
  primary key (question_id, participant_id)
);

create table if not exists public.live_reactions (
  id text primary key,
  session_code text not null references public.live_sessions (code) on delete cascade,
  participant_id text not null,
  emoji text not null check (char_length(emoji) <= 8),
  at bigint not null
);
create index if not exists live_reactions_recent on public.live_reactions (session_code, at);

-- The shared deck library (the host page's "Your decks"), written with LIVE_ADMIN_KEY.
create table if not exists public.live_decks (
  id text primary key check (id ~ '^[a-z0-9]{6,32}$'),
  title text not null,
  deck jsonb not null,
  updated_at bigint not null,
  updated_by text not null default ''
);

-- Columns added after the first version: a re-run brings an older database up to date.
alter table public.live_sessions add column if not exists hidden jsonb not null default '[]'::jsonb;
alter table public.live_questions add column if not exists held boolean not null default false;

alter table public.live_sessions enable row level security;
alter table public.live_participants enable row level security;
alter table public.live_responses enable row level security;
alter table public.live_questions enable row level security;
alter table public.live_votes enable row level security;
alter table public.live_reactions enable row level security;
alter table public.live_decks enable row level security;

comment on table public.live_sessions is 'Surprisal Live Kit sessions. Written only by /api/live. code is the 4-letter join code.';

notify pgrst, 'reload schema';
