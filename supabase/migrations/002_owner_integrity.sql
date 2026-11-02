-- Prevent tasks from referencing a document owned by a different account.
alter table public.documents add constraint documents_id_owner_unique unique (id, owner_id);
alter table public.tasks add constraint tasks_document_owner_fk
  foreign key (document_id, owner_id) references public.documents (id, owner_id) on delete cascade;

revoke all on public.documents, public.tasks from anon;
grant select, insert, update, delete on public.documents, public.tasks to authenticated;
create index documents_owner_idx on public.documents(owner_id);
create index tasks_owner_date_idx on public.tasks(owner_id, due_date);

-- Restrict optional originals to images and a bounded upload size.
update storage.buckets set file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'vault-images';
