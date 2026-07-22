create table public.gidget_conversations (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.gidget_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.gidget_conversations(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  source text not null default 'text' check (source in ('text', 'voice')),
  content text not null check (char_length(content) between 1 and 12000),
  citations jsonb not null default '[]'::jsonb check (jsonb_typeof(citations) = 'array'),
  created_at timestamptz not null default now()
);

create table public.gidget_memories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  source_conversation_id uuid references public.gidget_conversations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gidget_conversations_owner_recent_idx
  on public.gidget_conversations (shop_id, user_id, last_message_at desc);
create index gidget_messages_conversation_created_idx
  on public.gidget_messages (conversation_id, created_at);
create index gidget_messages_owner_idx
  on public.gidget_messages (shop_id, user_id);
create index gidget_memories_owner_recent_idx
  on public.gidget_memories (shop_id, user_id, updated_at desc);
create index gidget_memories_source_conversation_idx
  on public.gidget_memories (source_conversation_id);

create trigger gidget_conversations_set_updated_at
before update on public.gidget_conversations
for each row execute function public.set_updated_at();

create trigger gidget_memories_set_updated_at
before update on public.gidget_memories
for each row execute function public.set_updated_at();

alter table public.gidget_conversations enable row level security;
alter table public.gidget_messages enable row level security;
alter table public.gidget_memories enable row level security;

revoke all on public.gidget_conversations from anon;
revoke all on public.gidget_messages from anon;
revoke all on public.gidget_memories from anon;
grant select, insert, update, delete on public.gidget_conversations to authenticated;
grant select, insert, update, delete on public.gidget_messages to authenticated;
grant select, insert, update, delete on public.gidget_memories to authenticated;

create policy "Staff manage their own Gidget conversations"
on public.gidget_conversations
for all
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_active_shop_staff(shop_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_active_shop_staff(shop_id)
);

create policy "Staff manage their own Gidget messages"
on public.gidget_messages
for all
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_active_shop_staff(shop_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_active_shop_staff(shop_id)
  and exists (
    select 1
    from public.gidget_conversations conversation
    where conversation.id = conversation_id
      and conversation.shop_id = shop_id
      and conversation.user_id = (select auth.uid())
  )
);

create policy "Staff manage their own explicit Gidget memories"
on public.gidget_memories
for all
to authenticated
using (
  user_id = (select auth.uid())
  and public.is_active_shop_staff(shop_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_active_shop_staff(shop_id)
);
