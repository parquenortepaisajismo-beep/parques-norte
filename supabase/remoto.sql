-- =====================================================================
-- PARQUES NORTE · seguridad para Supabase (correr DESPUÉS de app/sql/001_esquema.sql)
-- NO correr 000_local_auth.sql ni local_perfil.sql en Supabase.
-- =====================================================================

-- 1) Nadie lee ni escribe tablas directo: todo pasa por las funciones (que validan y exigen admin).
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'parques' loop
    execute format('alter table parques.%I enable row level security', t);
  end loop;
end $$;
revoke all on all tables in schema parques from anon, authenticated, public;
revoke all on all sequences in schema parques from anon, authenticated, public;
revoke execute on all functions in schema parques from anon, authenticated, public;
alter default privileges in schema parques revoke execute on functions from public;
grant usage on schema parques to authenticated;

-- 2) Solo las funciones de la API, y solo para usuarios logueados (además exigen perfil admin).
grant execute on function
  parques.generar_trabajos(date),
  parques.guardar_cliente(jsonb),
  parques.cambiar_estado_cliente(uuid, text, text),
  parques.guardar_servicio(jsonb),
  parques.asignar_jardineros(uuid, uuid[]),
  parques.marcar_realizado(uuid, date, numeric, uuid[]),
  parques.deshacer_realizado(uuid),
  parques.cancelar_trabajo(uuid, text, text),
  parques.reprogramar_trabajo(uuid, date, text, text, boolean),
  parques.reprogramar_dia(date, date, text, text),
  parques.agregar_observacion(uuid, text),
  parques.editar_trabajo(uuid, jsonb),
  parques.crear_trabajo(jsonb),
  parques.registrar_pago(uuid[], text, date, numeric, text),
  parques.anular_pago(uuid),
  parques.editar_cargo(uuid, numeric, text),
  parques.guardar_jardinero(jsonb),
  parques.guardar_tipo_servicio(jsonb),
  parques.cambiar_tarifa(uuid, text, numeric, date),
  parques.guardar_config(text, jsonb),
  parques.api_trabajos(date, date, jsonb),
  parques.api_trabajo(uuid),
  parques.api_clientes(text, text),
  parques.api_cliente(uuid),
  parques.api_config(),
  parques.api_inicio(),
  parques.api_estadisticas(date, date),
  parques.api_cobros(boolean),
  parques.api_exportar(),
  parques.api_importar(jsonb),
  parques.borrar_demo()
to authenticated;

-- 3) Dar de alta al administrador (primero crear el usuario en Authentication → Users → Add user).
--    Reemplazar el mail y el nombre:
-- insert into parques.perfiles (user_id, nombre, rol)
-- select id, 'Rober', 'admin' from auth.users where email = 'MAIL-DEL-ADMIN';
