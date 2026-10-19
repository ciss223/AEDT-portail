-- AEDT V2 : tables logement et justificatifs.
create table if not exists public.housing_requests(
 id uuid primary key default gen_random_uuid(),
 dossier_code text not null unique,
 user_id uuid references auth.users(id) on delete set null,
 nom text not null, prenom text not null, matricule text not null,
 telephone text not null, email text, etablissement text not null,
 filiere text, niveau text not null, sexe text not null,
 logement text not null, adresse text, message text,
 status text not null default 'En attente',
 admin_note text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.request_documents(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.housing_requests(id) on delete cascade,
 request_code text not null,
 file_type text not null,
 file_path text not null unique,
 original_name text not null,
 created_at timestamptz not null default now()
);

alter table public.housing_requests enable row level security;
alter table public.request_documents enable row level security;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('dossiers','dossiers',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update
set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];

-- AEDT V3 : actualités, profil du Président et galerie.
create table if not exists public.news(
 id uuid primary key default gen_random_uuid(),
 title text not null, category text default 'Actualité', excerpt text, content text,
 image_url text, published boolean default false, published_at timestamptz, created_at timestamptz default now()
);
create table if not exists public.president_profile(
 id uuid primary key default gen_random_uuid(), name text not null,
 role text, quote text, education text, professional text, association text,
 active boolean default true, updated_at timestamptz default now()
);
create table if not exists public.gallery(
 id uuid primary key default gen_random_uuid(), image_url text not null, caption text,
 published boolean default true, created_at timestamptz default now()
);
alter table public.news enable row level security;
alter table public.president_profile enable row level security;
alter table public.gallery enable row level security;

drop policy if exists "public_read_news" on public.news;
create policy "public_read_news" on public.news for select to anon,authenticated using (published=true);
drop policy if exists "admin_manage_news" on public.news;
create policy "admin_manage_news" on public.news for all to authenticated using (true) with check (true);

drop policy if exists "public_read_president" on public.president_profile;
create policy "public_read_president" on public.president_profile for select to anon,authenticated using (active=true);
drop policy if exists "admin_manage_president" on public.president_profile;
create policy "admin_manage_president" on public.president_profile for all to authenticated using (true) with check (true);

drop policy if exists "public_read_gallery" on public.gallery;
create policy "public_read_gallery" on public.gallery for select to anon,authenticated using (published=true);
drop policy if exists "admin_manage_gallery" on public.gallery;
create policy "admin_manage_gallery" on public.gallery for all to authenticated using (true) with check (true);

-- Les tables logement V2 sont définies au début de ce fichier.


-- V3.1 : stockage des photos de galerie
insert into storage.buckets (id,name,public) values ('gallery','gallery',true)
on conflict (id) do update set public=true;
drop policy if exists "admins_upload_gallery" on storage.objects;
create policy "admins_upload_gallery" on storage.objects for insert to authenticated with check (bucket_id='gallery');
drop policy if exists "public_read_gallery_images" on storage.objects;
create policy "public_read_gallery_images" on storage.objects for select to anon,authenticated using (bucket_id='gallery');
drop policy if exists "admins_delete_gallery" on storage.objects;
create policy "admins_delete_gallery" on storage.objects for delete to authenticated using (bucket_id='gallery');

-- Photos et vidéos des actualités et du profil du Président.
-- Aucune restriction de type MIME : le bucket accepte images et vidéos.
-- Limite portée à 50 Mo pour permettre des clips courts.
insert into storage.buckets (id,name,public,file_size_limit)
values ('media','media',true,52428800)
on conflict (id) do update set public=true, file_size_limit=52428800;
drop policy if exists "admins_upload_media" on storage.objects;
create policy "admins_upload_media" on storage.objects for insert to authenticated
with check (bucket_id='media' and public.is_admin());
drop policy if exists "public_read_media" on storage.objects;
create policy "public_read_media" on storage.objects for select to anon,authenticated
using (bucket_id='media');
drop policy if exists "admins_delete_media" on storage.objects;
create policy "admins_delete_media" on storage.objects for delete to authenticated
using (bucket_id='media' and public.is_admin());

-- ============================================================
-- AEDT V4 : espace étudiant, profils, notifications et rôles
-- ============================================================
create table if not exists public.profiles(
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text, prenom text, nom text, telephone text, matricule text, etablissement text,
 filiere text, niveau text, role text not null default 'student',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.notifications(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null, message text not null,
 read_at timestamptz, created_at timestamptz not null default now()
);

alter table public.housing_requests add column if not exists user_id uuid references auth.users(id) on delete set null;
-- Coordonnées du tuteur / responsable de l'étudiant (formulaire simplifié).
alter table public.housing_requests add column if not exists email_tuteur text;
alter table public.housing_requests add column if not exists telephone_tuteur text;

-- Médias des actualités et du profil du Président.
alter table public.news add column if not exists video_url text;
alter table public.news add column if not exists video_caption text;
alter table public.president_profile add column if not exists photo_url text;
alter table public.president_profile add column if not exists video_url text;

alter table public.profiles enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role in ('admin', 'super_admin')) $$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create or replace function public.is_super_admin()
returns boolean language sql security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='super_admin') $$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare full_name text := trim(coalesce(new.raw_user_meta_data->>'full_name',''));
begin
 insert into public.profiles(id,first_name,prenom,nom)
 values(new.id,split_part(full_name,' ',1),split_part(full_name,' ',1),
        nullif(trim(substr(full_name,length(split_part(full_name,' ',1))+1)),''))
 on conflict (id) do nothing;
 return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.can_attach_housing_document(
 p_request_id uuid,p_request_code text,p_file_path text
) returns boolean language sql security definer set search_path=public,pg_temp
as $$
 select exists(
  select 1 from public.housing_requests h
  where h.id=p_request_id and h.dossier_code=p_request_code
    and p_file_path like p_request_code || '/%'
    and ((auth.uid() is null and h.user_id is null) or h.user_id=auth.uid())
 )
$$;

revoke all on function public.can_attach_housing_document(uuid,text,text) from public;
grant execute on function public.can_attach_housing_document(uuid,text,text) to anon,authenticated;

drop function if exists public.track_housing_request(text);
create function public.track_housing_request(p_code text)
returns table(dossier_code text,status text)
language sql security definer set search_path=public,pg_temp
as $$
 select h.dossier_code,h.status
 from public.housing_requests h
 where h.dossier_code=trim(p_code)
 limit 1
$$;

revoke all on function public.track_housing_request(text) from public;
grant execute on function public.track_housing_request(text) to anon,authenticated;

drop policy if exists "public_submit_housing_request" on public.housing_requests;
create policy "public_submit_housing_request" on public.housing_requests
for insert to anon,authenticated
with check (user_id is null or user_id=auth.uid());

drop policy if exists "housing_student_select" on public.housing_requests;
create policy "housing_student_select" on public.housing_requests
for select to authenticated using (user_id=auth.uid() or public.is_admin());
drop policy if exists "housing_student_update" on public.housing_requests;
drop policy if exists "housing_admin_update" on public.housing_requests;
create policy "housing_admin_update" on public.housing_requests
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "housing_documents_submit" on public.request_documents;
create policy "housing_documents_submit" on public.request_documents
for insert to anon,authenticated
with check (public.can_attach_housing_document(request_id,request_code,file_path));
drop policy if exists "housing_documents_admin_read" on public.request_documents;
create policy "housing_documents_admin_read" on public.request_documents
for select to authenticated using (public.is_admin());

drop policy if exists "dossiers_public_upload" on storage.objects;
create policy "dossiers_public_upload" on storage.objects
for insert to anon,authenticated with check (bucket_id='dossiers');
drop policy if exists "dossiers_admin_read" on storage.objects;
create policy "dossiers_admin_read" on storage.objects
for select to authenticated using (bucket_id='dossiers' and public.is_admin());

-- Restreint également l'upload galerie au rôle administrateur.
drop policy if exists "admins_upload_gallery" on storage.objects;
create policy "admins_upload_gallery" on storage.objects
for insert to authenticated with check (bucket_id='gallery' and public.is_admin());
drop policy if exists "admins_delete_gallery" on storage.objects;
create policy "admins_delete_gallery" on storage.objects
for delete to authenticated using (bucket_id='gallery' and public.is_admin());

drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles for select to authenticated using (id=auth.uid() or public.is_admin());
drop policy if exists "profiles_self_write" on public.profiles;
create policy "profiles_self_write" on public.profiles for insert to authenticated with check (id=auth.uid() and role='student');
drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert" on public.profiles for insert to authenticated with check (public.is_admin());
drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update" on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check (public.is_super_admin() or (public.is_admin() and role in ('student','admin')) or (id=auth.uid() and role='student'));

drop policy if exists "notifications_self_read" on public.notifications;
create policy "notifications_self_read" on public.notifications for select to authenticated using (user_id=auth.uid() or public.is_admin());
drop policy if exists "notifications_admin_insert" on public.notifications;
create policy "notifications_admin_insert" on public.notifications for insert to authenticated with check (public.is_admin());
drop policy if exists "notifications_self_update" on public.notifications;
create policy "notifications_self_update" on public.notifications for update to authenticated using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());

-- Remplace les anciennes politiques V3 trop larges par un contrôle admin.
drop policy if exists "admin_manage_news" on public.news;
create policy "admin_manage_news" on public.news for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin_manage_president" on public.president_profile;
create policy "admin_manage_president" on public.president_profile for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin_manage_gallery" on public.gallery;
create policy "admin_manage_gallery" on public.gallery for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Les étudiants voient leur propre dossier ; les administrateurs voient tout.
-- AEDT V5 : notifications et messagerie
create table if not exists public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,title text not null,message text not null,read boolean default false,created_at timestamptz default now());
create table if not exists public.messages(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,subject text not null,body text not null,admin_reply text,replied_at timestamptz,created_at timestamptz default now());
alter table public.notifications enable row level security; alter table public.messages enable row level security;
drop policy if exists "students_read_own_notifications" on public.notifications; create policy "students_read_own_notifications" on public.notifications for select to authenticated using(auth.uid()=user_id);
drop policy if exists "students_update_own_notifications" on public.notifications; create policy "students_update_own_notifications" on public.notifications for update to authenticated using(auth.uid()=user_id);
drop policy if exists "students_create_messages" on public.messages; create policy "students_create_messages" on public.messages for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "students_read_own_messages" on public.messages; create policy "students_read_own_messages" on public.messages for select to authenticated using(auth.uid()=user_id);
create or replace function public.notify_housing_status() returns trigger language plpgsql security definer set search_path=public as $$ begin if new.user_id is not null and old.status is distinct from new.status then insert into public.notifications(user_id,title,message) values(new.user_id,'Mise à jour de votre dossier','Le statut de votre demande '||coalesce(new.dossier_code,'')||' est maintenant : '||coalesce(new.status,'')); end if; return new; end $$;
drop trigger if exists housing_status_notification on public.housing_requests; create trigger housing_status_notification after update of status on public.housing_requests for each row execute function public.notify_housing_status();


-- AEDT V6 : accès administrateur aux messages et notification après réponse.
drop policy if exists "admins_read_messages" on public.messages;
create policy "admins_read_messages" on public.messages for select to authenticated
using (public.is_admin());
drop policy if exists "admins_update_messages" on public.messages;
create policy "admins_update_messages" on public.messages for update to authenticated
using (public.is_admin())
with check (public.is_admin());
create or replace function public.notify_message_reply() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.user_id is not null and new.admin_reply is distinct from old.admin_reply and new.admin_reply is not null and length(trim(new.admin_reply))>0 then
  insert into public.notifications(user_id,title,message) values(new.user_id,'Réponse de l’AEDT',new.admin_reply);
 end if; return new;
end; $$;
drop trigger if exists message_reply_notification on public.messages;
create trigger message_reply_notification after update of admin_reply on public.messages for each row execute function public.notify_message_reply();

-- AEDT V11 : indicateurs réels et journal administratif en lecture seule.
create table if not exists public.activity_log(
 id uuid primary key default gen_random_uuid(),
 action_type text not null,
 entity_type text not null,
 entity_id uuid not null,
 summary text not null,
 actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists housing_requests_created_at_idx on public.housing_requests(created_at desc);
create index if not exists housing_requests_status_created_at_idx on public.housing_requests(status,created_at desc);
create index if not exists housing_requests_user_id_idx on public.housing_requests(user_id);
create index if not exists housing_requests_dossier_code_idx on public.housing_requests(dossier_code);
create index if not exists profiles_role_created_at_idx on public.profiles(role,created_at desc);
create index if not exists request_documents_created_at_idx on public.request_documents(created_at desc);
create index if not exists request_documents_request_id_idx on public.request_documents(request_id);
create index if not exists messages_created_at_idx on public.messages(created_at desc);
create index if not exists activity_log_created_at_idx on public.activity_log(created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log(entity_type,entity_id,created_at desc);
alter table public.activity_log enable row level security;
drop policy if exists "activity_log_admin_read" on public.activity_log;
create policy "activity_log_admin_read" on public.activity_log
for select to authenticated using (public.is_admin());
revoke insert,update,delete,truncate,references,trigger on public.activity_log from anon,authenticated;

create or replace function public.record_admin_activity()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
declare
 entity_key uuid;
 action text;
 entity text := tg_table_name;
 message text;
begin
 if tg_op='DELETE' then entity_key := old.id; else entity_key := new.id; end if;
 if tg_table_name='housing_requests' then
  action := 'status_changed';
  message := 'Statut du dossier '||coalesce(new.dossier_code,'')||' modifié : '||
    coalesce(old.status,'')||' → '||coalesce(new.status,'');
 elsif tg_table_name='messages' then
  action := 'reply_saved';
  message := 'Réponse AEDT enregistrée pour un message étudiant.';
 elsif tg_table_name='news' then
  action := lower(tg_op)||'_news';
  message := case when tg_op='INSERT' then 'Actualité publiée.' when tg_op='DELETE' then 'Actualité supprimée.' else 'Actualité modifiée.' end;
 elsif tg_table_name='president_profile' then
  action := lower(tg_op)||'_president_profile';
  message := case when tg_op='INSERT' then 'Profil du Président créé.' when tg_op='DELETE' then 'Profil du Président supprimé.' else 'Profil du Président modifié.' end;
 elsif tg_table_name='gallery' then
  action := lower(tg_op)||'_gallery';
  message := case when tg_op='INSERT' then 'Photo ajoutée à la galerie.' when tg_op='DELETE' then 'Photo supprimée de la galerie.' else 'Photo de la galerie modifiée.' end;
 elsif tg_table_name='profiles' then
  action := 'profile_updated';
  message := 'Profil étudiant modifié.';
 else
  if tg_op='DELETE' then return old; end if;
  return new;
 end if;
 insert into public.activity_log(action_type,entity_type,entity_id,summary,actor_id)
 values(action,entity,entity_key,message,auth.uid());
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function public.record_admin_activity() from public,anon,authenticated;

drop trigger if exists admin_activity_housing_status on public.housing_requests;
create trigger admin_activity_housing_status after update of status on public.housing_requests
for each row when (old.status is distinct from new.status)
execute function public.record_admin_activity();
drop trigger if exists admin_activity_message_reply on public.messages;
create trigger admin_activity_message_reply after update of admin_reply on public.messages
for each row when (old.admin_reply is distinct from new.admin_reply)
execute function public.record_admin_activity();
drop trigger if exists admin_activity_news on public.news;
create trigger admin_activity_news after insert or update or delete on public.news
for each row execute function public.record_admin_activity();
drop trigger if exists admin_activity_president_profile on public.president_profile;
create trigger admin_activity_president_profile after insert or update or delete on public.president_profile
for each row execute function public.record_admin_activity();
drop trigger if exists admin_activity_gallery on public.gallery;
create trigger admin_activity_gallery after insert or update or delete on public.gallery
for each row execute function public.record_admin_activity();
drop trigger if exists admin_activity_student_profile on public.profiles;
create trigger admin_activity_student_profile after update on public.profiles
for each row when (old.first_name is distinct from new.first_name
 or old.prenom is distinct from new.prenom or old.nom is distinct from new.nom
 or old.telephone is distinct from new.telephone or old.matricule is distinct from new.matricule
 or old.etablissement is distinct from new.etablissement or old.filiere is distinct from new.filiere
 or old.niveau is distinct from new.niveau or old.role is distinct from new.role)
execute function public.record_admin_activity();

-- Les champs de vérification doivent exister avant la création de la synthèse.
alter table public.request_documents
 add column if not exists verification_status text not null default 'À vérifier',
 add column if not exists verified_at timestamptz,
 add column if not exists verified_by uuid references auth.users(id) on delete set null;
create index if not exists request_documents_verification_status_idx
 on public.request_documents(verification_status);

do $$
begin
 if not exists (
  select 1 from pg_constraint
  where conname='request_documents_verification_status_check'
    and conrelid='public.request_documents'::regclass
 ) then
  alter table public.request_documents
   add constraint request_documents_verification_status_check
   check (verification_status in ('À vérifier','Vérifié','À revoir'));
 end if;
end;
$$;

create or replace function public.admin_dashboard_summary()
returns jsonb language plpgsql security definer set search_path=public,pg_temp
as $$
declare result jsonb;
begin
 if not public.is_admin() then
  raise exception 'Accès administrateur requis.' using errcode='42501';
 end if;
 select jsonb_build_object(
  'students',(select count(*) from public.profiles where role='student'),
  'requests',(select count(*) from public.housing_requests),
  'pending',(select count(*) from public.housing_requests where status='En attente'),
  'review',(select count(*) from public.housing_requests where status='En étude'),
  'accepted',(select count(*) from public.housing_requests where status='Acceptée'),
  'refused',(select count(*) from public.housing_requests where status='Refusée'),
  'documents',(select count(*) from public.request_documents),
  'documents_pending',(select count(*) from public.request_documents where verification_status='À vérifier'),
  'messages_pending',(select count(*) from public.messages where admin_reply is null or length(trim(admin_reply))=0),
  'monthly',coalesce((
   select jsonb_agg(jsonb_build_object('month',to_char(month_start,'YYYY-MM'),'count',request_count,'processed',processed_count) order by month_start)
   from (
    select months.month_start,count(h.id)::integer as request_count,
      (select count(*)::integer from public.activity_log a
       where a.entity_type='housing_requests' and a.action_type='status_changed'
       and a.created_at>=months.month_start and a.created_at<months.month_start+interval '1 month') as processed_count
    from generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') months(month_start)
    left join public.housing_requests h on h.created_at>=months.month_start
      and h.created_at<months.month_start+interval '1 month'
    group by months.month_start
   ) monthly_counts
  ),'[]'::jsonb),
  'recent_requests',coalesce((
   select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
   from (
    select id,dossier_code,nom,prenom,etablissement,status,created_at
    from public.housing_requests order by created_at desc limit 5
   ) recent
  ),'[]'::jsonb),
  'recent_messages',coalesce((
   select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
   from (
    select subject,left(body,140) as body,(admin_reply is not null and length(trim(admin_reply))>0) as replied,created_at
    from public.messages order by created_at desc limit 5
   ) recent
  ),'[]'::jsonb),
  'recent_activity',coalesce((
   select jsonb_agg(to_jsonb(recent) order by recent.created_at desc)
   from (
    select action_type,entity_type,entity_id,summary,actor_id,created_at
    from public.activity_log order by created_at desc limit 5
   ) recent
  ),'[]'::jsonb)
 ) into result;
 return result;
end;
$$;
revoke all on function public.admin_dashboard_summary() from public,anon;
grant execute on function public.admin_dashboard_summary() to authenticated;

-- AEDT V12 : vérification administrative des pièces et traçabilité des contenus.
drop policy if exists "housing_documents_admin_update" on public.request_documents;
create policy "housing_documents_admin_update" on public.request_documents
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.set_document_review_metadata()
returns trigger language plpgsql set search_path=public,pg_temp
as $$
begin
 if new.verification_status='À vérifier' then
  new.verified_at := null;
  new.verified_by := null;
 else
  new.verified_at := now();
  new.verified_by := auth.uid();
 end if;
 return new;
end;
$$;
revoke all on function public.set_document_review_metadata() from public,anon,authenticated;
drop trigger if exists set_document_review_metadata on public.request_documents;
create trigger set_document_review_metadata before update of verification_status,verified_at,verified_by on public.request_documents
for each row execute function public.set_document_review_metadata();

create or replace function public.record_document_review_activity()
returns trigger language plpgsql security definer set search_path=public,pg_temp
as $$
begin
 insert into public.activity_log(action_type,entity_type,entity_id,summary,actor_id)
 values(
  'document_reviewed',
  'request_documents',
  new.id,
  'Vérification d’une pièce du dossier '||coalesce(new.request_code,'')||' : '||new.verification_status||'.',
  auth.uid()
 );
 return new;
end;
$$;
revoke all on function public.record_document_review_activity() from public,anon,authenticated;
drop trigger if exists admin_activity_document_review on public.request_documents;
create trigger admin_activity_document_review after update of verification_status on public.request_documents
for each row when (old.verification_status is distinct from new.verification_status)
execute function public.record_document_review_activity();

-- ============================================================
-- AEDT V14 : Gestion des connexions par le Super Administrateur
-- ============================================================
-- Validation immédiate d'e-mail pour les comptes créés dans l'administration
create or replace function public.admin_confirm_user_email(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,auth,pg_temp
as $$
begin
 if not public.is_admin() then
  raise exception 'Action réservée aux administrateurs.' using errcode='42501';
 end if;
 update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = p_user_id;
 return true;
end;
$$;
revoke all on function public.admin_confirm_user_email(uuid) from public,anon;
grant execute on function public.admin_confirm_user_email(uuid) to authenticated;

-- ============================================================
-- AEDT V15 : Création directe de comptes administrateurs
-- ============================================================
-- Compatible avec toutes les versions Supabase (pgcrypto dans extensions)
create or replace function public.admin_create_user(
  p_email      text,
  p_password   text,
  p_first_name text,
  p_last_name  text,
  p_phone      text default null,
  p_role       text default 'admin'
)
returns uuid
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_uid      uuid;
  v_now      timestamptz := now();
  v_enc_pass text;
begin
  -- Seuls les administrateurs peuvent appeler cette fonction
  if not public.is_admin() then
    raise exception 'Action reservee aux administrateurs.' using errcode = '42501';
  end if;

  -- Seul un super_admin peut créer un super_admin
  if p_role = 'super_admin' and not public.is_super_admin() then
    raise exception 'Seul un Super Administrateur peut creer des comptes Super Administrateurs.' using errcode = '42501';
  end if;

  -- Rôle valide
  if p_role not in ('admin', 'super_admin') then
    raise exception 'Role invalide.' using errcode = '22023';
  end if;

  -- Vérifier doublon email
  if exists (select 1 from auth.users where email = lower(trim(p_email))) then
    raise exception 'Un compte existe deja avec cette adresse e-mail.' using errcode = '23505';
  end if;

  -- Hacher le mot de passe via pgcrypto (schema extensions sur Supabase)
  v_enc_pass := extensions.crypt(p_password, extensions.gen_salt('bf'));
  v_uid      := gen_random_uuid();

  -- Insertion dans auth.users
  insert into auth.users (
    id, instance_id, aud, role,
    email, encrypted_password,
    email_confirmed_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    is_sso_user
  ) values (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    lower(trim(p_email)),
    v_enc_pass,
    v_now,
    '', '', '', '', '', '', '', '',
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object(
      'first_name', p_first_name,
      'prenom',     p_first_name,
      'nom',        p_last_name,
      'full_name',  trim(p_first_name || ' ' || p_last_name),
      'telephone',  p_phone,
      'role',       p_role
    ),
    v_now, v_now,
    false
  );

  -- Profil
  insert into public.profiles (id, first_name, prenom, nom, telephone, role, updated_at)
  values (v_uid, p_first_name, p_first_name, p_last_name, p_phone, p_role, v_now)
  on conflict (id) do update set
    first_name = excluded.first_name,
    prenom     = excluded.prenom,
    nom        = excluded.nom,
    telephone  = excluded.telephone,
    role       = excluded.role,
    updated_at = excluded.updated_at;

  return v_uid;
end;
$$;

revoke all on function public.admin_create_user(text,text,text,text,text,text) from public, anon;
grant execute on function public.admin_create_user(text,text,text,text,text,text) to authenticated;

-- Pour définir le premier Super Administrateur du projet :
-- update public.profiles set role='super_admin' where id='VOTRE_USER_ID';
