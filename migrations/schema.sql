create table if not exists users (
  username text primary key,
  password_hash text not null,
  status text not null default 'Hey there! I am using Cipher.',
  created_at timestamptz not null default now()
);

-- IF NOT EXISTS on CREATE TABLE above is a no-op once the table already
-- exists, so new columns added after the first deploy need an explicit
-- ALTER to actually land on existing databases.
alter table users add column if not exists status text not null default 'Hey there! I am using Cipher.';
alter table users add column if not exists fcm_token text;

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  sender text not null references users(username),
  -- Only ciphertext is ever stored; the server never sees plaintext or the
  -- shared code used to encrypt/decrypt it client-side. For image/voice
  -- messages, this holds the base64 ciphertext of the encrypted media bytes.
  ciphertext text not null,
  type text not null default 'text' check (type in ('text', 'image', 'voice')),
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_id_idx on messages (conversation_id, created_at);

-- IF NOT EXISTS on CREATE TABLE above is a no-op once the table already
-- exists, so columns added after the first deploy need an explicit ALTER.
alter table messages add column if not exists type text not null default 'text';

create table if not exists friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester text not null references users(username),
  recipient text not null references users(username),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now()
);

create index if not exists friend_requests_recipient_idx on friend_requests (recipient, status);
create index if not exists friend_requests_requester_idx on friend_requests (requester, status);
