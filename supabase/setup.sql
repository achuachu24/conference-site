-- USYS 2026 registration backend for Supabase
-- Run this once in Supabase Dashboard -> SQL Editor.

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  paper_id text not null check (char_length(trim(paper_id)) between 1 and 100),
  first_author_name text not null check (char_length(trim(first_author_name)) between 1 and 120),
  payment_path text not null check (char_length(payment_path) between 1 and 500),
  payment_file_name text not null check (char_length(payment_file_name) between 1 and 255),
  payment_mime_type text not null check (payment_mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  payment_size bigint not null check (payment_size > 0 and payment_size <= 5242880),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

alter table public.registrations enable row level security;

-- Least privilege for the public website: visitors may submit only.
revoke all on table public.registrations from anon;
grant insert on table public.registrations to anon;

-- Re-running this script is safe.
drop policy if exists "public_can_submit_registration" on public.registrations;
create policy "public_can_submit_registration"
on public.registrations
for insert
to anon
with check (
  char_length(trim(paper_id)) between 1 and 100
  and char_length(trim(first_author_name)) between 1 and 120
  and payment_mime_type in ('image/png', 'image/jpeg', 'image/webp')
  and payment_size > 0
  and payment_size <= 5242880
  and status = 'pending'
);

-- Private Storage bucket for payment screenshots.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Public visitors can upload a new file, but cannot list, read, overwrite or delete files.
drop policy if exists "public_can_upload_payment_proof" on storage.objects;
create policy "public_can_upload_payment_proof"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'payment-proofs'
  and (storage.foldername(name))[1] = 'submissions'
  and lower(storage.extension(name)) in ('png', 'jpg', 'jpeg', 'webp')
);
