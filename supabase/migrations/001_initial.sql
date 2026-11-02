-- Run in the Supabase SQL editor before connecting the app.
create table if not exists public.documents (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('scan', 'photo', 'manual')),
  category text not null check (category in ('bill', 'deadline', 'general')),
  details jsonb not null default '{}'::jsonb,
  retention text not null check (retention in ('details_only', 'image_and_details', 'discard_after_task')),
  image_path text,
  status text not null default 'active' check (status in ('active', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null references public.documents(id) on delete cascade,
  position integer not null,
  title text not null,
  due_date date,
  completed boolean not null default false,
  recommendation_source text not null,
  reminder_days integer[] not null default array[7,3,1],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.documents enable row level security;
alter table public.tasks enable row level security;

create policy "Users manage only their documents" on public.documents for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "Users manage only their tasks" on public.tasks for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

insert into storage.buckets (id, name, public) values ('vault-images', 'vault-images', false) on conflict (id) do nothing;
create policy "Users read their vault images" on storage.objects for select using (bucket_id = 'vault-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users upload their vault images" on storage.objects for insert with check (bucket_id = 'vault-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users update their vault images" on storage.objects for update using (bucket_id = 'vault-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete their vault images" on storage.objects for delete using (bucket_id = 'vault-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- Create a protected Edge Function named delete-account to remove the auth identity.
-- The app first removes local cache and invokes this function with the current access token.
