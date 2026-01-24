-- Create intents table
create table intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  query text not null,
  version text not null default 'v1',
  created_at timestamptz default now()
);

-- Enable RLS for intents
alter table intents enable row level security;

create policy "Users can insert their own intents"
  on intents for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own intents"
  on intents for select
  using (auth.uid() = user_id);

-- Create intent_cards table
create table intent_cards (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid references intents(id) on delete cascade not null,
  type text not null check (type in ('forecast', 'reflection')),
  title text not null,
  payload_json jsonb not null, -- Must contain version and window {start, end}
  dismissed_at timestamptz,
  created_at timestamptz default now()
);

-- Enable RLS for intent_cards
alter table intent_cards enable row level security;

create policy "Users can view cards for their intents"
  on intent_cards for select
  using (
    exists (
      select 1 from intents
      where intents.id = intent_cards.intent_id
      and intents.user_id = auth.uid()
    )
  );

create policy "System can insert cards"
  on intent_cards for insert
  with check (
    exists (
      select 1 from intents
      where intents.id = intent_cards.intent_id
      and intents.user_id = auth.uid()
    )
  );
  
create policy "Users can update their own cards (e.g. dismiss)"
  on intent_cards for update
  using (
    exists (
      select 1 from intents
      where intents.id = intent_cards.intent_id
      and intents.user_id = auth.uid()
    )
  );

-- Create intent_feedback table
create table intent_feedback (
  id uuid primary key default gen_random_uuid(),
  intent_card_id uuid references intent_cards(id) on delete cascade not null,
  action text not null check (action in ('save', 'dismiss')),
  created_at timestamptz default now()
);

-- Enable RLS for intent_feedback
alter table intent_feedback enable row level security;

create policy "Users can insert feedback for their cards"
  on intent_feedback for insert
  with check (
    exists (
      select 1 from intent_cards
      join intents on intents.id = intent_cards.intent_id
      where intent_cards.id = intent_feedback.intent_card_id
      and intents.user_id = auth.uid()
    )
  );

create policy "Users can view their own feedback"
  on intent_feedback for select
  using (
    exists (
      select 1 from intent_cards
      join intents on intents.id = intent_cards.intent_id
      where intent_cards.id = intent_feedback.intent_card_id
      and intents.user_id = auth.uid()
    )
  );
