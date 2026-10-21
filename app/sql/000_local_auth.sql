-- SOLO base local (PGlite): simula el usuario logueado de Supabase.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select '00000000-0000-0000-0000-000000000001'::uuid
$$;
