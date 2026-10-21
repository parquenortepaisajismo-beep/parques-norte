-- =====================================================================
-- PARQUES NORTE · esquema de base de datos (Postgres)
-- Portable: el mismo archivo corre en la base local (PGlite) y en Supabase.
-- Toda la lógica de negocio vive acá: la app solo llama funciones.
-- Requiere que exista auth.uid() (Supabase lo trae; en local lo crea 000_local_auth.sql).
-- =====================================================================

create schema if not exists parques;

-- ---------- utilidades base ----------
create or replace function parques.hoy() returns date
language sql stable as $$
  select (now() at time zone 'America/Argentina/Buenos_Aires')::date
$$;

create or replace function parques.tocar_actualizado() returns trigger
language plpgsql as $$
begin new.actualizado := now(); return new; end $$;

-- ---------- tablas ----------
create table parques.perfiles (
  user_id      uuid primary key,
  nombre       text not null,
  rol          text not null default 'admin' check (rol in ('admin','jardinero','lectura')),
  jardinero_id uuid,
  activo       boolean not null default true,
  creado       timestamptz not null default now()
);

create table parques.config (
  clave       text primary key,
  valor       jsonb not null,
  actualizado timestamptz not null default now()
);

create table parques.jardineros (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) between 1 and 60),
  telefono    text,
  color       text not null default '#2f6b3a',
  activo      boolean not null default true,
  creado      timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create unique index jardineros_nombre_uq on parques.jardineros (lower(trim(nombre)));

create table parques.tipos_servicio (
  id                 uuid primary key default gen_random_uuid(),
  codigo             text not null unique,
  nombre             text not null check (length(trim(nombre)) > 0),
  modo_cobro         text not null check (modo_cobro in ('por_visita','abono_mensual','por_bloque')),
  minutos_bloque     int check (minutos_bloque > 0),
  usa_tipo_propiedad boolean not null default true,
  frecuencia_default text not null default 'puntual',
  activo             boolean not null default true,
  orden              int not null default 0,
  creado             timestamptz not null default now(),
  actualizado        timestamptz not null default now(),
  check (modo_cobro <> 'por_bloque' or minutos_bloque is not null)
);

-- Tarifas versionadas: un cambio agrega una fila nueva, nunca pisa la anterior.
create table parques.tarifas (
  id               uuid primary key default gen_random_uuid(),
  tipo_servicio_id uuid not null references parques.tipos_servicio(id),
  tipo_propiedad   text check (tipo_propiedad in ('comun','esquina')),  -- null = cualquier propiedad
  monto            numeric(12,2) not null check (monto >= 0),
  vigente_desde    date not null,
  creado           timestamptz not null default now(),
  creado_por       text
);
create unique index tarifas_uq on parques.tarifas (tipo_servicio_id, (coalesce(tipo_propiedad,'')), vigente_desde);

create table parques.clientes (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null check (length(trim(nombre)) between 1 and 120),
  direccion             text,
  telefono              text,
  whatsapp              text,
  maps_url              text,
  lat                   numeric(9,6),   -- V2: mapa / rutas
  lng                   numeric(9,6),
  tipo_propiedad        text not null default 'comun' check (tipo_propiedad in ('comun','esquina')),
  observaciones         text,
  estado                text not null default 'activo' check (estado in ('activo','pausado','baja')),
  fecha_alta            date not null default parques.hoy(),
  jardinero_habitual_id uuid references parques.jardineros(id),
  demo                  boolean not null default false,
  creado                timestamptz not null default now(),
  actualizado           timestamptz not null default now()
);

create table parques.servicios_cliente (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references parques.clientes(id),
  tipo_servicio_id     uuid not null references parques.tipos_servicio(id),
  precio_personalizado numeric(12,2) check (precio_personalizado >= 0),
  frecuencia           text not null check (frecuencia in ('semanal','cada_10','cada_15','dos_por_mes','mensual','personalizada','puntual')),
  intervalo_dias       int check (intervalo_dias between 1 and 365),
  dias_mes             int[],
  fecha_inicio         date not null,
  ancla                date not null,          -- desde dónde se cuenta la recurrencia
  fecha_fin            date,
  horario              time,
  bloques_estimados    numeric(5,2) check (bloques_estimados > 0),
  duracion_min         int check (duracion_min > 0),   -- V3: agenda inteligente
  prioridad            int not null default 0,         -- V3
  jardinero_id         uuid references parques.jardineros(id),
  estado               text not null default 'activo' check (estado in ('activo','pausado','baja')),
  observaciones        text,
  generado_hasta       date,
  creado               timestamptz not null default now(),
  actualizado          timestamptz not null default now(),
  check (frecuencia <> 'personalizada' or intervalo_dias is not null),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create table parques.trabajos (
  id                    uuid primary key default gen_random_uuid(),
  cliente_id            uuid not null references parques.clientes(id),
  tipo_servicio_id      uuid not null references parques.tipos_servicio(id),
  servicio_cliente_id   uuid references parques.servicios_cliente(id),
  ocurrencia            date,          -- turno de la recurrencia que originó el trabajo
  fecha                 date not null,
  horario               time,
  estado                text not null default 'pendiente'
                        check (estado in ('pendiente','asignado','realizado','reprogramado','cancelado')),
  modo_cobro            text not null check (modo_cobro in ('por_visita','abono_mensual','por_bloque')),
  precio_unitario       numeric(12,2),
  bloques               numeric(5,2) check (bloques > 0),
  precio                numeric(12,2) not null default 0 check (precio >= 0),  -- congelado al realizar
  precio_manual         boolean not null default false,
  observaciones         text,
  fecha_realizado       date,
  fecha_original        date,          -- primera fecha programada (si vino de reprogramaciones)
  origen_id             uuid references parques.trabajos(id) deferrable initially deferred,
  reprogramado_id       uuid references parques.trabajos(id) deferrable initially deferred,
  reprogramado_a        date,
  motivo_reprogramacion text,
  motivo_cancelacion    text,
  creado                timestamptz not null default now(),
  actualizado           timestamptz not null default now(),
  check (estado <> 'reprogramado' or (length(trim(motivo_reprogramacion)) > 0 and reprogramado_a is not null)),
  check (estado <> 'cancelado'    or  length(trim(motivo_cancelacion)) > 0),
  check (estado <> 'realizado'    or  fecha_realizado is not null)
);
create unique index trabajos_ocurrencia_uq on parques.trabajos (servicio_cliente_id, ocurrencia) where ocurrencia is not null;
create index trabajos_fecha_idx on parques.trabajos (fecha);
create index trabajos_cliente_idx on parques.trabajos (cliente_id, fecha);

create table parques.trabajo_jardineros (
  trabajo_id   uuid not null references parques.trabajos(id) on delete cascade,
  jardinero_id uuid not null references parques.jardineros(id),
  primary key (trabajo_id, jardinero_id)
);

-- Historial: solo se agregan filas.
create table parques.historial_trabajo (
  id             uuid primary key default gen_random_uuid(),
  trabajo_id     uuid not null references parques.trabajos(id) on delete cascade,
  tipo           text not null check (tipo in ('creado','asignado','realizado','deshecho','reprogramado','cancelado','observacion','editado')),
  fecha_anterior date,
  fecha_nueva    date,
  motivo         text,
  detalle        text,
  usuario_id     uuid,
  usuario_nombre text,
  creado         timestamptz not null default now()
);
create index historial_trabajo_idx on parques.historial_trabajo (trabajo_id, creado);

-- FACTURADO: un cargo por visita realizada con precio, o uno por mes de abono.
create table parques.cargos (
  id                  uuid primary key default gen_random_uuid(),
  cliente_id          uuid not null references parques.clientes(id),
  servicio_cliente_id uuid references parques.servicios_cliente(id),
  trabajo_id          uuid unique references parques.trabajos(id),
  periodo             date,             -- primer día del mes (abonos)
  concepto            text not null,
  fecha               date not null,
  monto               numeric(12,2) not null check (monto >= 0),
  nota                text,
  creado              timestamptz not null default now()
);
create unique index cargos_periodo_uq on parques.cargos (servicio_cliente_id, periodo) where periodo is not null;
create index cargos_fecha_idx on parques.cargos (fecha);

-- COBRADO
create table parques.pagos (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references parques.clientes(id),
  fecha          date not null,
  monto          numeric(12,2) not null check (monto > 0),
  metodo         text not null check (metodo in ('efectivo','transferencia','otro')),
  nota           text,
  usuario_nombre text,
  creado         timestamptz not null default now()
);
create table parques.pago_cargos (
  pago_id  uuid not null references parques.pagos(id) on delete cascade,
  cargo_id uuid not null references parques.cargos(id),
  monto    numeric(12,2) not null check (monto > 0),
  primary key (pago_id, cargo_id)
);

create trigger t_act before update on parques.jardineros        for each row execute function parques.tocar_actualizado();
create trigger t_act before update on parques.tipos_servicio    for each row execute function parques.tocar_actualizado();
create trigger t_act before update on parques.clientes          for each row execute function parques.tocar_actualizado();
create trigger t_act before update on parques.servicios_cliente for each row execute function parques.tocar_actualizado();
create trigger t_act before update on parques.trabajos          for each row execute function parques.tocar_actualizado();

-- ---------- vistas internas (no expuestas) ----------
create view parques.v_cargos as
select c.*,
       coalesce((select sum(pc.monto) from parques.pago_cargos pc where pc.cargo_id = c.id), 0)::numeric(12,2) as cobrado,
       (c.monto - coalesce((select sum(pc.monto) from parques.pago_cargos pc where pc.cargo_id = c.id), 0))::numeric(12,2) as saldo
from parques.cargos c;

create view parques.v_trabajos as
select t.id, t.fecha, t.horario, t.estado, t.cliente_id, t.tipo_servicio_id, t.servicio_cliente_id,
       c.nombre as cliente_nombre, c.direccion, c.telefono,
       jsonb_build_object(
         'id', t.id, 'fecha', t.fecha, 'horario', to_char(t.horario, 'HH24:MI'), 'estado', t.estado,
         'modo_cobro', t.modo_cobro, 'precio', t.precio, 'precio_unitario', t.precio_unitario, 'bloques', t.bloques,
         'precio_manual', t.precio_manual, 'observaciones', t.observaciones, 'fecha_realizado', t.fecha_realizado,
         'fecha_original', t.fecha_original, 'origen_id', t.origen_id, 'reprogramado_id', t.reprogramado_id,
         'reprogramado_a', t.reprogramado_a, 'motivo_reprogramacion', t.motivo_reprogramacion,
         'motivo_cancelacion', t.motivo_cancelacion, 'servicio_cliente_id', t.servicio_cliente_id,
         'atrasado', (t.estado in ('pendiente','asignado') and t.fecha < parques.hoy()),
         'cliente', jsonb_build_object('id', c.id, 'nombre', c.nombre, 'direccion', c.direccion, 'telefono', c.telefono,
                     'whatsapp', c.whatsapp, 'maps_url', c.maps_url, 'lat', c.lat, 'lng', c.lng,
                     'observaciones', c.observaciones, 'tipo_propiedad', c.tipo_propiedad, 'estado', c.estado),
         'servicio', jsonb_build_object('id', ts.id, 'codigo', ts.codigo, 'nombre', ts.nombre, 'modo_cobro', ts.modo_cobro,
                     'minutos_bloque', ts.minutos_bloque),
         'jardineros', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'nombre', j.nombre, 'color', j.color) order by j.nombre)
                                 from parques.trabajo_jardineros tj join parques.jardineros j on j.id = tj.jardinero_id
                                 where tj.trabajo_id = t.id), '[]'::jsonb),
         'cobro', coalesce(
             (select jsonb_build_object('cargo_id', vc.id, 'monto', vc.monto, 'cobrado', vc.cobrado, 'saldo', vc.saldo, 'abono', false)
                from parques.v_cargos vc where vc.trabajo_id = t.id),
             (select jsonb_build_object('cargo_id', vc.id, 'monto', vc.monto, 'cobrado', vc.cobrado, 'saldo', vc.saldo, 'abono', true,
                                        'concepto', vc.concepto)
                from parques.v_cargos vc
               where t.modo_cobro = 'abono_mensual' and vc.servicio_cliente_id = t.servicio_cliente_id
                 and vc.periodo = date_trunc('month', t.fecha)::date))
       ) as j
from parques.trabajos t
join parques.clientes c on c.id = t.cliente_id
join parques.tipos_servicio ts on ts.id = t.tipo_servicio_id;

-- ---------- seguridad / auditoría ----------
create or replace function parques.es_admin() returns boolean
language sql stable security definer set search_path = parques, public as $$
  select exists (select 1 from parques.perfiles where user_id = auth.uid() and rol = 'admin' and activo)
$$;

create or replace function parques.exigir_admin() returns void
language plpgsql stable security definer set search_path = parques, public as $$
begin
  if not parques.es_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
end $$;

create or replace function parques.usuario_nombre() returns text
language sql stable security definer set search_path = parques, public as $$
  select coalesce((select nombre from parques.perfiles where user_id = auth.uid()), 'Sistema')
$$;

create or replace function parques.registrar(p_trabajo uuid, p_tipo text, p_ant date, p_nueva date, p_motivo text, p_detalle text)
returns void language sql security definer set search_path = parques, public as $$
  insert into parques.historial_trabajo (trabajo_id, tipo, fecha_anterior, fecha_nueva, motivo, detalle, usuario_id, usuario_nombre)
  values (p_trabajo, p_tipo, p_ant, p_nueva, nullif(trim(p_motivo), ''), nullif(trim(p_detalle), ''), auth.uid(), parques.usuario_nombre())
$$;

create or replace function parques.cfg(p_clave text, p_def jsonb) returns jsonb
language sql stable as $$
  select coalesce((select valor from parques.config where clave = p_clave), p_def)
$$;

create or replace function parques.texto_obligatorio(p text, p_campo text) returns text
language plpgsql immutable as $$
begin
  if p is null or length(trim(p)) = 0 then raise exception '% es obligatorio', p_campo using errcode = '22023'; end if;
  return trim(p);
end $$;

create or replace function parques.nombres_jardineros(p_trabajo uuid) returns text
language sql stable as $$
  select coalesce(string_agg(j.nombre, ', ' order by j.nombre), 'sin asignar')
  from parques.trabajo_jardineros tj join parques.jardineros j on j.id = tj.jardinero_id where tj.trabajo_id = p_trabajo
$$;

-- ---------- precios ----------
create or replace function parques.tarifa_vigente(p_tipo uuid, p_propiedad text, p_fecha date) returns numeric
language sql stable as $$
  select monto from parques.tarifas
  where tipo_servicio_id = p_tipo and vigente_desde <= p_fecha
    and (tipo_propiedad is null or tipo_propiedad = p_propiedad)
  order by (tipo_propiedad is null), vigente_desde desc
  limit 1
$$;

create or replace function parques.precio_servicio(p_servicio uuid, p_fecha date) returns numeric
language sql stable as $$
  select coalesce(s.precio_personalizado,
                  parques.tarifa_vigente(s.tipo_servicio_id, case when ts.usa_tipo_propiedad then c.tipo_propiedad end, p_fecha), 0)
  from parques.servicios_cliente s
  join parques.tipos_servicio ts on ts.id = s.tipo_servicio_id
  join parques.clientes c on c.id = s.cliente_id
  where s.id = p_servicio
$$;

-- Recalcula el precio de trabajos pendientes futuros (los realizados quedan congelados).
create or replace function parques.recalcular_pendientes(p_cliente uuid default null, p_servicio uuid default null, p_tipo uuid default null)
returns int language plpgsql security definer set search_path = parques, public as $$
declare n int;
begin
  update parques.trabajos t
     set precio_unitario = x.pu, precio = x.pu * coalesce(t.bloques, 1)
    from (select t2.id, parques.precio_servicio(t2.servicio_cliente_id, t2.fecha) as pu
            from parques.trabajos t2
           where t2.estado in ('pendiente','asignado') and t2.fecha >= parques.hoy()
             and not t2.precio_manual and t2.servicio_cliente_id is not null and t2.modo_cobro <> 'abono_mensual'
             and (p_cliente is null or t2.cliente_id = p_cliente)
             and (p_servicio is null or t2.servicio_cliente_id = p_servicio)
             and (p_tipo is null or t2.tipo_servicio_id = p_tipo)) x
   where t.id = x.id and t.precio_unitario is distinct from x.pu;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- recurrencias ----------
create or replace function parques.intervalo_servicio(s parques.servicios_cliente) returns int
language sql immutable as $$
  select case s.frecuencia when 'semanal' then 7 when 'cada_10' then 10 when 'cada_15' then 15
                           when 'personalizada' then s.intervalo_dias end
$$;

create or replace function parques.dias_mes_default(p_frecuencia text, p_fecha date) returns int[]
language sql immutable as $$
  select case p_frecuencia
    when 'mensual' then array[extract(day from p_fecha)::int]
    when 'dos_por_mes' then case when extract(day from p_fecha) <= 14
                                 then array[extract(day from p_fecha)::int, extract(day from p_fecha)::int + 14]
                                 else array[extract(day from p_fecha)::int - 14, extract(day from p_fecha)::int] end
  end
$$;

-- Fechas en que corresponde visitar, entre p_desde y p_hasta.
create or replace function parques.fechas_servicio(s parques.servicios_cliente, p_desde date, p_hasta date)
returns setof date language plpgsql stable as $$
declare
  v_ini date := greatest(p_desde, s.fecha_inicio);
  v_fin date := least(p_hasta, coalesce(s.fecha_fin, p_hasta));
  n int; k int; d date; m date; dia int;
begin
  if v_ini > v_fin then return; end if;
  if s.frecuencia = 'puntual' then
    if s.ancla between v_ini and v_fin then return next s.ancla; end if;
    return;
  end if;
  n := parques.intervalo_servicio(s);
  if n is not null then
    k := greatest(0, ceil((v_ini - s.ancla)::numeric / n)::int);
    d := s.ancla + k * n;
    while d <= v_fin loop
      if d >= v_ini then return next d; end if;
      d := d + n;
    end loop;
    return;
  end if;
  -- días fijos del mes (mensual / dos por mes)
  m := date_trunc('month', v_ini)::date;
  while m <= v_fin loop
    for dia in select distinct unnest(coalesce(s.dias_mes, parques.dias_mes_default(s.frecuencia, s.ancla))) order by 1 loop
      d := m + (least(dia, extract(day from (m + interval '1 month - 1 day'))::int) - 1);
      if d between v_ini and v_fin and d >= s.ancla then return next d; end if;
    end loop;
    m := (m + interval '1 month')::date;
  end loop;
end $$;

create or replace function parques.generar_servicio(p_servicio uuid, p_hasta date) returns int
language plpgsql security definer set search_path = parques, public as $$
declare
  s parques.servicios_cliente; c parques.clientes; t parques.tipos_servicio;
  v_desde date; d date; n int := 0; v_id uuid; v_pu numeric; v_bl numeric; v_jard uuid; v_jnom text;
begin
  select * into s from parques.servicios_cliente where id = p_servicio;
  if not found then return 0; end if;
  select * into c from parques.clientes where id = s.cliente_id;
  if s.estado <> 'activo' or c.estado <> 'activo' then return 0; end if;
  select * into t from parques.tipos_servicio where id = s.tipo_servicio_id;
  v_desde := greatest(coalesce(s.generado_hasta + 1, s.fecha_inicio), s.fecha_inicio);
  if v_desde > p_hasta then return 0; end if;

  if (parques.cfg('asignar_habitual', 'true'::jsonb))::text = 'true' then
    v_jard := coalesce(s.jardinero_id, c.jardinero_habitual_id);
    select nombre into v_jnom from parques.jardineros where id = v_jard and activo;
    if v_jnom is null then v_jard := null; end if;
  end if;
  v_bl := case when t.modo_cobro = 'por_bloque' then coalesce(s.bloques_estimados, 1) end;

  for d in select * from parques.fechas_servicio(s, v_desde, p_hasta) loop
    v_pu := case when t.modo_cobro = 'abono_mensual' then null else parques.precio_servicio(s.id, d) end;
    insert into parques.trabajos (cliente_id, tipo_servicio_id, servicio_cliente_id, ocurrencia, fecha, horario, estado,
                                  modo_cobro, precio_unitario, bloques, precio)
    values (s.cliente_id, s.tipo_servicio_id, s.id, d, d, s.horario,
            case when v_jard is null then 'pendiente' else 'asignado' end,
            t.modo_cobro, v_pu, v_bl, coalesce(v_pu, 0) * coalesce(v_bl, 1))
    on conflict (servicio_cliente_id, ocurrencia) where ocurrencia is not null do nothing
    returning id into v_id;
    if v_id is not null then
      if v_jard is not null then insert into parques.trabajo_jardineros values (v_id, v_jard); end if;
      perform parques.registrar(v_id, 'creado', null, d, null,
        'Programado automáticamente' || coalesce(' · asignado a ' || v_jnom, ''));
      n := n + 1;
    end if;
  end loop;
  update parques.servicios_cliente set generado_hasta = greatest(coalesce(generado_hasta, p_hasta), p_hasta) where id = s.id;
  return n;
end $$;

create or replace function parques.horizonte() returns date
language sql stable as $$
  select parques.hoy() + 7 * coalesce((parques.cfg('horizonte_semanas', '8'::jsonb))::text::int, 8)
$$;

-- Cargo mensual de cada abono activo (el mes indicado o el actual).
create or replace function parques.asegurar_cargos_abono(p_periodo date default null) returns int
language plpgsql security definer set search_path = parques, public as $$
declare v_per date := date_trunc('month', coalesce(p_periodo, parques.hoy()))::date; n int;
begin
  insert into parques.cargos (cliente_id, servicio_cliente_id, periodo, concepto, fecha, monto)
  select s.cliente_id, s.id, v_per, ts.nombre || ' · ' || to_char(v_per, 'MM/YYYY'), v_per, parques.precio_servicio(s.id, v_per)
    from parques.servicios_cliente s
    join parques.tipos_servicio ts on ts.id = s.tipo_servicio_id and ts.modo_cobro = 'abono_mensual'
    join parques.clientes c on c.id = s.cliente_id and c.estado = 'activo'
   where s.estado = 'activo' and v_per >= date_trunc('month', s.fecha_inicio)::date
     and (s.fecha_fin is null or s.fecha_fin >= v_per)
  on conflict (servicio_cliente_id, periodo) where periodo is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- "Intacto" = trabajo futuro que nadie tocó (solo tiene el registro de creación).
create or replace function parques.es_intacto(p_trabajo uuid) returns boolean
language sql stable as $$
  select t.estado in ('pendiente','asignado') and t.ocurrencia is not null and t.observaciones is null and not t.precio_manual
     and not exists (select 1 from parques.historial_trabajo h where h.trabajo_id = t.id and h.tipo <> 'creado')
  from parques.trabajos t where t.id = p_trabajo
$$;

-- Rehace la programación de un servicio desde una fecha: borra solo proyecciones intactas.
create or replace function parques.regenerar_desde(p_servicio uuid, p_desde date) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare v_b int; v_c int; v_g int;
begin
  delete from parques.trabajos t
   where t.servicio_cliente_id = p_servicio and t.fecha >= p_desde and parques.es_intacto(t.id);
  get diagnostics v_b = row_count;
  select count(*) into v_c from parques.trabajos
   where servicio_cliente_id = p_servicio and fecha >= p_desde and estado in ('pendiente','asignado');
  update parques.servicios_cliente set generado_hasta = p_desde - 1 where id = p_servicio;
  v_g := parques.generar_servicio(p_servicio, parques.horizonte());
  return jsonb_build_object('borrados', v_b, 'conservados', v_c, 'generados', v_g);
end $$;

-- Al pausar/dar de baja: proyecciones futuras intactas se borran; las tocadas se cancelan con motivo.
create or replace function parques.limpiar_futuros(p_cliente uuid, p_servicio uuid, p_motivo text) returns int
language plpgsql security definer set search_path = parques, public as $$
declare r record; n int := 0;
begin
  delete from parques.trabajos t
   where t.fecha > parques.hoy() and parques.es_intacto(t.id)
     and (p_cliente is null or t.cliente_id = p_cliente) and (p_servicio is null or t.servicio_cliente_id = p_servicio);
  for r in select id, fecha from parques.trabajos
            where estado in ('pendiente','asignado') and fecha >= parques.hoy()
              and (p_cliente is null or cliente_id = p_cliente) and (p_servicio is null or servicio_cliente_id = p_servicio) loop
    update parques.trabajos set estado = 'cancelado', motivo_cancelacion = p_motivo where id = r.id;
    perform parques.registrar(r.id, 'cancelado', r.fecha, null, p_motivo, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- API: funciones que llama la app (todas exigen admin)
-- =====================================================================

create or replace function parques.generar_trabajos(p_hasta date default null) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare r record; n int := 0; a int;
begin
  perform parques.exigir_admin();
  for r in select s.id from parques.servicios_cliente s join parques.clientes c on c.id = s.cliente_id
            where s.estado = 'activo' and c.estado = 'activo' loop
    n := n + parques.generar_servicio(r.id, coalesce(p_hasta, parques.horizonte()));
  end loop;
  a := parques.asegurar_cargos_abono(null);
  return jsonb_build_object('generados', n, 'abonos', a);
end $$;

-- ---------- clientes ----------
create or replace function parques.guardar_cliente(p jsonb) returns uuid
language plpgsql security definer set search_path = parques, public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_prop_ant text; v_prop text := coalesce(nullif(p->>'tipo_propiedad', ''), 'comun');
begin
  perform parques.exigir_admin();
  perform parques.texto_obligatorio(p->>'nombre', 'El nombre');
  if v_id is null then
    insert into parques.clientes (nombre, direccion, telefono, whatsapp, maps_url, lat, lng, tipo_propiedad, observaciones,
                                  fecha_alta, jardinero_habitual_id, demo)
    values (trim(p->>'nombre'), nullif(trim(p->>'direccion'), ''), nullif(trim(p->>'telefono'), ''), nullif(trim(p->>'whatsapp'), ''),
            nullif(trim(p->>'maps_url'), ''), nullif(p->>'lat', '')::numeric, nullif(p->>'lng', '')::numeric, v_prop,
            nullif(trim(p->>'observaciones'), ''), coalesce(nullif(p->>'fecha_alta', '')::date, parques.hoy()),
            nullif(p->>'jardinero_habitual_id', '')::uuid, coalesce((p->>'demo')::boolean, false))
    returning id into v_id;
  else
    select tipo_propiedad into v_prop_ant from parques.clientes where id = v_id;
    if not found then raise exception 'Cliente inexistente'; end if;
    update parques.clientes set
      nombre = trim(p->>'nombre'), direccion = nullif(trim(p->>'direccion'), ''), telefono = nullif(trim(p->>'telefono'), ''),
      whatsapp = nullif(trim(p->>'whatsapp'), ''), maps_url = nullif(trim(p->>'maps_url'), ''),
      lat = nullif(p->>'lat', '')::numeric, lng = nullif(p->>'lng', '')::numeric, tipo_propiedad = v_prop,
      observaciones = nullif(trim(p->>'observaciones'), ''),
      fecha_alta = coalesce(nullif(p->>'fecha_alta', '')::date, fecha_alta),
      jardinero_habitual_id = nullif(p->>'jardinero_habitual_id', '')::uuid
    where id = v_id;
    if v_prop_ant is distinct from v_prop then perform parques.recalcular_pendientes(v_id, null, null); end if;
  end if;
  return v_id;
end $$;

create or replace function parques.cambiar_estado_cliente(p_cliente uuid, p_estado text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare v_ant text; n int := 0; g int := 0; r record;
begin
  perform parques.exigir_admin();
  if p_estado not in ('activo','pausado','baja') then raise exception 'Estado inválido'; end if;
  select estado into v_ant from parques.clientes where id = p_cliente;
  if not found then raise exception 'Cliente inexistente'; end if;
  if v_ant = p_estado then return jsonb_build_object('cancelados', 0, 'generados', 0); end if;
  update parques.clientes set estado = p_estado where id = p_cliente;
  if p_estado in ('pausado','baja') then
    n := parques.limpiar_futuros(p_cliente, null,
           coalesce(nullif(trim(p_motivo), ''), case p_estado when 'pausado' then 'Cliente pausado' else 'Cliente dado de baja' end));
  else
    for r in select id from parques.servicios_cliente where cliente_id = p_cliente and estado = 'activo' loop
      update parques.servicios_cliente set generado_hasta = parques.hoy() - 1 where id = r.id;
      g := g + parques.generar_servicio(r.id, parques.horizonte());
    end loop;
    perform parques.asegurar_cargos_abono(null);
  end if;
  return jsonb_build_object('cancelados', n, 'generados', g);
end $$;

-- ---------- servicios del cliente ----------
create or replace function parques.guardar_servicio(p jsonb) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid; v_ant parques.servicios_cliente; v_new parques.servicios_cliente;
  v_frec text := p->>'frecuencia'; v_ini date := nullif(p->>'fecha_inicio', '')::date;
  v_desde date := coalesce(nullif(p->>'desde', '')::date, parques.hoy());
  v_dias int[]; v_res jsonb := '{}'::jsonb; v_estado text := coalesce(nullif(p->>'estado', ''), 'activo');
  v_tipo parques.tipos_servicio; v_cambio_prog boolean;
begin
  perform parques.exigir_admin();
  if v_frec is null or v_frec not in ('semanal','cada_10','cada_15','dos_por_mes','mensual','personalizada','puntual') then
    raise exception 'Frecuencia inválida';
  end if;
  if v_ini is null then raise exception 'La fecha de inicio es obligatoria'; end if;
  if v_frec = 'personalizada' and coalesce((p->>'intervalo_dias')::int, 0) < 1 then
    raise exception 'Indicá cada cuántos días';
  end if;
  if v_estado not in ('activo','pausado','baja') then raise exception 'Estado inválido'; end if;
  if p ? 'dias_mes' and jsonb_typeof(p->'dias_mes') = 'array' and jsonb_array_length(p->'dias_mes') > 0 then
    select array_agg(x::int order by x::int) into v_dias from jsonb_array_elements_text(p->'dias_mes') x;
    if exists (select 1 from unnest(v_dias) d where d < 1 or d > 31) then raise exception 'Días del mes inválidos'; end if;
  end if;

  if v_id is null then
    select * into v_tipo from parques.tipos_servicio where id = (p->>'tipo_servicio_id')::uuid and activo;
    if not found then raise exception 'Tipo de servicio inválido'; end if;
    insert into parques.servicios_cliente (cliente_id, tipo_servicio_id, precio_personalizado, frecuencia, intervalo_dias, dias_mes,
        fecha_inicio, ancla, fecha_fin, horario, bloques_estimados, duracion_min, prioridad, jardinero_id, observaciones)
    values ((p->>'cliente_id')::uuid, v_tipo.id, nullif(p->>'precio_personalizado', '')::numeric, v_frec,
        case when v_frec = 'personalizada' then (p->>'intervalo_dias')::int end,
        case when v_frec in ('mensual','dos_por_mes') then coalesce(v_dias, parques.dias_mes_default(v_frec, v_ini)) end,
        v_ini, v_ini, nullif(p->>'fecha_fin', '')::date, nullif(p->>'horario', '')::time,
        nullif(p->>'bloques_estimados', '')::numeric, nullif(p->>'duracion_min', '')::int, coalesce((p->>'prioridad')::int, 0),
        nullif(p->>'jardinero_id', '')::uuid, nullif(trim(p->>'observaciones'), ''))
    returning id into v_id;
    v_res := jsonb_build_object('generados', parques.generar_servicio(v_id, parques.horizonte()));
    perform parques.asegurar_cargos_abono(null);
  else
    select * into v_ant from parques.servicios_cliente where id = v_id;
    if not found then raise exception 'Servicio inexistente'; end if;
    update parques.servicios_cliente set
      precio_personalizado = nullif(p->>'precio_personalizado', '')::numeric,
      frecuencia = v_frec,
      intervalo_dias = case when v_frec = 'personalizada' then (p->>'intervalo_dias')::int end,
      dias_mes = case when v_frec in ('mensual','dos_por_mes')
                      then coalesce(v_dias, parques.dias_mes_default(v_frec, greatest(v_desde, v_ini))) end,
      fecha_inicio = v_ini, fecha_fin = nullif(p->>'fecha_fin', '')::date, horario = nullif(p->>'horario', '')::time,
      bloques_estimados = nullif(p->>'bloques_estimados', '')::numeric, duracion_min = nullif(p->>'duracion_min', '')::int,
      prioridad = coalesce((p->>'prioridad')::int, prioridad), jardinero_id = nullif(p->>'jardinero_id', '')::uuid,
      observaciones = nullif(trim(p->>'observaciones'), ''), estado = v_estado
    where id = v_id returning * into v_new;

    v_cambio_prog := v_ant.frecuencia is distinct from v_new.frecuencia or v_ant.intervalo_dias is distinct from v_new.intervalo_dias
      or v_ant.dias_mes is distinct from v_new.dias_mes or v_ant.fecha_inicio is distinct from v_new.fecha_inicio
      or v_ant.fecha_fin is distinct from v_new.fecha_fin or v_ant.horario is distinct from v_new.horario
      or v_ant.jardinero_id is distinct from v_new.jardinero_id or v_ant.bloques_estimados is distinct from v_new.bloques_estimados;

    if v_estado <> 'activo' and v_ant.estado = 'activo' then
      v_res := jsonb_build_object('cancelados', parques.limpiar_futuros(null, v_id,
                 coalesce(nullif(trim(p->>'motivo'), ''), case v_estado when 'pausado' then 'Servicio pausado' else 'Servicio dado de baja' end)));
    elsif v_estado = 'activo' and (v_cambio_prog or v_ant.estado <> 'activo') then
      -- la nueva programación cuenta desde "desde" (solo para frecuencias por intervalo)
      if parques.intervalo_servicio(v_new) is not null and v_ant.frecuencia is distinct from v_new.frecuencia
         or parques.intervalo_servicio(v_new) is not null and v_ant.intervalo_dias is distinct from v_new.intervalo_dias then
        update parques.servicios_cliente set ancla = greatest(v_desde, v_ini) where id = v_id;
      elsif v_ant.fecha_inicio is distinct from v_new.fecha_inicio then
        update parques.servicios_cliente set ancla = v_ini where id = v_id;
      end if;
      v_res := parques.regenerar_desde(v_id, greatest(v_desde, v_ini));
    end if;
    perform parques.recalcular_pendientes(null, v_id, null);
  end if;
  return v_res || jsonb_build_object('id', v_id);
end $$;

-- ---------- trabajos ----------
create or replace function parques.trabajo_editable(p_trabajo uuid) returns parques.trabajos
language plpgsql security definer set search_path = parques, public as $$
declare t parques.trabajos;
begin
  select * into t from parques.trabajos where id = p_trabajo for update;
  if not found then raise exception 'Trabajo inexistente'; end if;
  if t.estado not in ('pendiente','asignado') then
    raise exception 'El trabajo está %: no se puede modificar', t.estado using errcode = '22023';
  end if;
  return t;
end $$;

create or replace function parques.asignar_jardineros(p_trabajo uuid, p_jardineros uuid[]) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare t parques.trabajos; v_ant text; v_nuevo text; v_ids uuid[] := coalesce(p_jardineros, '{}');
begin
  perform parques.exigir_admin();
  select * into t from parques.trabajos where id = p_trabajo for update;
  if not found then raise exception 'Trabajo inexistente'; end if;
  if t.estado in ('reprogramado','cancelado') then raise exception 'El trabajo está %', t.estado; end if;
  if exists (select 1 from unnest(v_ids) x where not exists (select 1 from parques.jardineros j where j.id = x and (j.activo
             or exists (select 1 from parques.trabajo_jardineros tj where tj.trabajo_id = p_trabajo and tj.jardinero_id = x)))) then
    raise exception 'Jardinero inexistente o inactivo';
  end if;
  v_ant := parques.nombres_jardineros(p_trabajo);
  delete from parques.trabajo_jardineros where trabajo_id = p_trabajo and not (jardinero_id = any(v_ids));
  insert into parques.trabajo_jardineros select p_trabajo, x from unnest(v_ids) x on conflict do nothing;
  if t.estado in ('pendiente','asignado') then
    update parques.trabajos set estado = case when cardinality(v_ids) > 0 then 'asignado' else 'pendiente' end where id = p_trabajo;
  end if;
  v_nuevo := parques.nombres_jardineros(p_trabajo);
  if v_nuevo <> v_ant then
    perform parques.registrar(p_trabajo, 'asignado', null, null, null, 'Asignado: ' || v_nuevo || ' (antes: ' || v_ant || ')');
  end if;
  return (select j from parques.v_trabajos where id = p_trabajo);
end $$;

create or replace function parques.marcar_realizado(p_trabajo uuid, p_fecha date default null, p_bloques numeric default null,
                                                    p_jardineros uuid[] default null) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare t parques.trabajos; v_bl numeric; v_precio numeric; v_fecha date := coalesce(p_fecha, parques.hoy()); v_nombre text;
begin
  perform parques.exigir_admin();
  t := parques.trabajo_editable(p_trabajo);
  if v_fecha > parques.hoy() then raise exception 'No se puede marcar realizado con fecha futura'; end if;
  if p_jardineros is not null then perform parques.asignar_jardineros(p_trabajo, p_jardineros); end if;
  v_bl := case when t.modo_cobro = 'por_bloque' then coalesce(p_bloques, t.bloques, 1) end;
  if v_bl is not null and v_bl <= 0 then raise exception 'Los bloques deben ser mayores a cero'; end if;
  v_precio := case when t.precio_manual then t.precio else coalesce(t.precio_unitario, 0) * coalesce(v_bl, 1) end;
  update parques.trabajos set estado = 'realizado', fecha_realizado = v_fecha, bloques = coalesce(v_bl, bloques), precio = v_precio
   where id = p_trabajo;
  if v_precio > 0 then
    select ts.nombre into v_nombre from parques.tipos_servicio ts where ts.id = t.tipo_servicio_id;
    insert into parques.cargos (cliente_id, servicio_cliente_id, trabajo_id, concepto, fecha, monto)
    values (t.cliente_id, t.servicio_cliente_id, t.id,
            v_nombre || case when v_bl is not null then ' · ' || trim(to_char(v_bl, 'FM990.##')) || ' bloque(s)' else '' end,
            v_fecha, v_precio);
  end if;
  perform parques.registrar(p_trabajo, 'realizado', null, v_fecha, null, 'Realizado por ' || parques.nombres_jardineros(p_trabajo));
  return (select j from parques.v_trabajos where id = p_trabajo);
end $$;

create or replace function parques.deshacer_realizado(p_trabajo uuid) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare t parques.trabajos;
begin
  perform parques.exigir_admin();
  select * into t from parques.trabajos where id = p_trabajo for update;
  if t.estado <> 'realizado' then raise exception 'El trabajo no está realizado'; end if;
  if exists (select 1 from parques.pago_cargos pc join parques.cargos c on c.id = pc.cargo_id where c.trabajo_id = p_trabajo) then
    raise exception 'El trabajo ya tiene cobros registrados: anulá el cobro primero';
  end if;
  delete from parques.cargos where trabajo_id = p_trabajo;
  update parques.trabajos set fecha_realizado = null,
         estado = case when exists (select 1 from parques.trabajo_jardineros where trabajo_id = p_trabajo) then 'asignado' else 'pendiente' end
   where id = p_trabajo;
  perform parques.registrar(p_trabajo, 'deshecho', null, null, null, 'Se desmarcó "realizado"');
  return (select j from parques.v_trabajos where id = p_trabajo);
end $$;

create or replace function parques.cancelar_trabajo(p_trabajo uuid, p_motivo text, p_observaciones text default null) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare t parques.trabajos; v_motivo text := parques.texto_obligatorio(p_motivo, 'El motivo de cancelación');
begin
  perform parques.exigir_admin();
  t := parques.trabajo_editable(p_trabajo);
  update parques.trabajos set estado = 'cancelado', motivo_cancelacion = v_motivo where id = p_trabajo;
  perform parques.registrar(p_trabajo, 'cancelado', t.fecha, null, v_motivo, p_observaciones);
  return (select j from parques.v_trabajos where id = p_trabajo);
end $$;

-- Reprogramar: el original queda REPROGRAMADO en su fecha y se crea uno nuevo vinculado.
create or replace function parques.reprogramar_trabajo(p_trabajo uuid, p_nueva_fecha date, p_motivo text,
                                                       p_observaciones text default null, p_siguientes boolean default false)
returns jsonb language plpgsql security definer set search_path = parques, public as $$
declare
  t parques.trabajos; s parques.servicios_cliente; v_nuevo uuid; v_motivo text := parques.texto_obligatorio(p_motivo, 'El motivo de reprogramación');
  v_res jsonb := '{}'::jsonb; v_dia_ant int; v_dia_new int;
begin
  perform parques.exigir_admin();
  if p_nueva_fecha is null then raise exception 'La nueva fecha es obligatoria' using errcode = '22023'; end if;
  t := parques.trabajo_editable(p_trabajo);
  if p_nueva_fecha = t.fecha then raise exception 'La nueva fecha es igual a la actual'; end if;

  insert into parques.trabajos (cliente_id, tipo_servicio_id, servicio_cliente_id, ocurrencia, fecha, horario, estado, modo_cobro,
      precio_unitario, bloques, precio, precio_manual, observaciones, fecha_original, origen_id)
  values (t.cliente_id, t.tipo_servicio_id, t.servicio_cliente_id, null, p_nueva_fecha, t.horario, t.estado, t.modo_cobro,
      t.precio_unitario, t.bloques, t.precio, t.precio_manual, t.observaciones, coalesce(t.fecha_original, t.fecha), t.id)
  returning id into v_nuevo;
  insert into parques.trabajo_jardineros select v_nuevo, jardinero_id from parques.trabajo_jardineros where trabajo_id = t.id;

  update parques.trabajos set estado = 'reprogramado', reprogramado_a = p_nueva_fecha, reprogramado_id = v_nuevo,
         motivo_reprogramacion = v_motivo where id = t.id;
  perform parques.registrar(t.id, 'reprogramado', t.fecha, p_nueva_fecha, v_motivo, p_observaciones);
  perform parques.registrar(v_nuevo, 'creado', t.fecha, p_nueva_fecha, v_motivo,
    'Reprogramado desde el ' || to_char(t.fecha, 'DD/MM/YYYY') || coalesce('. ' || nullif(trim(p_observaciones), ''), ''));

  if p_siguientes and t.servicio_cliente_id is not null then
    select * into s from parques.servicios_cliente where id = t.servicio_cliente_id for update;
    if s.frecuencia <> 'puntual' then
      if parques.intervalo_servicio(s) is not null then
        update parques.servicios_cliente set ancla = p_nueva_fecha where id = s.id;
      else
        v_dia_ant := extract(day from coalesce(t.ocurrencia, t.fecha));
        v_dia_new := extract(day from p_nueva_fecha);
        update parques.servicios_cliente
           set dias_mes = (select array_agg(distinct case when d = v_dia_ant then v_dia_new else d end order by case when d = v_dia_ant then v_dia_new else d end)
                             from unnest(coalesce(s.dias_mes, parques.dias_mes_default(s.frecuencia, s.ancla))) d)
         where id = s.id;
      end if;
      v_res := parques.regenerar_desde(s.id, p_nueva_fecha + 1);
    end if;
  end if;
  return v_res || jsonb_build_object('id', v_nuevo, 'trabajo', (select j from parques.v_trabajos where id = v_nuevo));
end $$;

create or replace function parques.reprogramar_dia(p_fecha date, p_nueva_fecha date, p_motivo text, p_observaciones text default null)
returns jsonb language plpgsql security definer set search_path = parques, public as $$
declare r record; n int := 0;
begin
  perform parques.exigir_admin();
  perform parques.texto_obligatorio(p_motivo, 'El motivo de reprogramación');
  for r in select id from parques.trabajos where fecha = p_fecha and estado in ('pendiente','asignado') loop
    perform parques.reprogramar_trabajo(r.id, p_nueva_fecha, p_motivo, p_observaciones, false);
    n := n + 1;
  end loop;
  return jsonb_build_object('reprogramados', n);
end $$;

create or replace function parques.agregar_observacion(p_trabajo uuid, p_texto text) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare v text := parques.texto_obligatorio(p_texto, 'La observación');
begin
  perform parques.exigir_admin();
  update parques.trabajos set observaciones = concat_ws(E'\n', observaciones, v) where id = p_trabajo;
  if not found then raise exception 'Trabajo inexistente'; end if;
  perform parques.registrar(p_trabajo, 'observacion', null, null, null, v);
  return (select j from parques.v_trabajos where id = p_trabajo);
end $$;

-- Ajustes menores: horario, precio puntual (queda manual), bloques estimados.
create or replace function parques.editar_trabajo(p_trabajo uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare t parques.trabajos; v_det text := '';
begin
  perform parques.exigir_admin();
  t := parques.trabajo_editable(p_trabajo);
  if p ? 'horario' then
    update parques.trabajos set horario = nullif(p->>'horario', '')::time where id = p_trabajo;
    v_det := v_det || 'Horario: ' || coalesce(nullif(p->>'horario', ''), 'sin horario') || '. ';
  end if;
  if p ? 'bloques' and t.modo_cobro = 'por_bloque' then
    if (p->>'bloques')::numeric <= 0 then raise exception 'Los bloques deben ser mayores a cero'; end if;
    update parques.trabajos set bloques = (p->>'bloques')::numeric,
           precio = case when precio_manual then precio else coalesce(precio_unitario, 0) * (p->>'bloques')::numeric end
     where id = p_trabajo;
    v_det := v_det || 'Bloques: ' || (p->>'bloques') || '. ';
  end if;
  if p ? 'precio' then
    if nullif(p->>'precio', '') is null then
      update parques.trabajos set precio_manual = false where id = p_trabajo;
      perform parques.recalcular_pendientes(null, t.servicio_cliente_id, null);
      v_det := v_det || 'Precio: vuelve a la tarifa. ';
    else
      if (p->>'precio')::numeric < 0 then raise exception 'Precio inválido'; end if;
      update parques.trabajos set precio = (p->>'precio')::numeric, precio_manual = true where id = p_trabajo;
      v_det := v_det || 'Precio: $' || (p->>'precio') || '. ';
    end if;
  end if;
  if v_det <> '' then perform parques.registrar(p_trabajo, 'editado', null, null, null, v_det); end if;
  return (select j from parques.v_trabajos where id = p_trabajo);
end $$;

-- Trabajo puntual / adicional (o registrar uno ya hecho).
create or replace function parques.crear_trabajo(p jsonb) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare
  c parques.clientes; ts parques.tipos_servicio; v_id uuid; v_fecha date := coalesce(nullif(p->>'fecha', '')::date, parques.hoy());
  v_bl numeric; v_pu numeric; v_precio numeric; v_manual boolean := nullif(p->>'precio', '') is not null; v_srv uuid;
  v_jard uuid[];
begin
  perform parques.exigir_admin();
  select * into c from parques.clientes where id = (p->>'cliente_id')::uuid;
  if not found then raise exception 'Cliente inexistente'; end if;
  select * into ts from parques.tipos_servicio where id = (p->>'tipo_servicio_id')::uuid;
  if not found then raise exception 'Tipo de servicio inexistente'; end if;
  -- si el cliente tiene ese servicio contratado, se vincula (y toma su precio personalizado)
  select id into v_srv from parques.servicios_cliente
   where cliente_id = c.id and tipo_servicio_id = ts.id and estado = 'activo' order by creado limit 1;
  v_bl := case when ts.modo_cobro = 'por_bloque' then coalesce(nullif(p->>'bloques', '')::numeric, 1) end;
  v_pu := case when ts.modo_cobro = 'abono_mensual' then null
               when v_srv is not null then parques.precio_servicio(v_srv, v_fecha)
               else coalesce(parques.tarifa_vigente(ts.id, case when ts.usa_tipo_propiedad then c.tipo_propiedad end, v_fecha), 0) end;
  v_precio := case when v_manual then (p->>'precio')::numeric else coalesce(v_pu, 0) * coalesce(v_bl, 1) end;
  if v_precio < 0 then raise exception 'Precio inválido'; end if;
  insert into parques.trabajos (cliente_id, tipo_servicio_id, servicio_cliente_id, fecha, horario, estado, modo_cobro,
                                precio_unitario, bloques, precio, precio_manual, observaciones)
  values (c.id, ts.id, v_srv, v_fecha, nullif(p->>'horario', '')::time, 'pendiente', ts.modo_cobro,
          v_pu, v_bl, v_precio, v_manual, nullif(trim(p->>'observaciones'), ''))
  returning id into v_id;
  perform parques.registrar(v_id, 'creado', null, v_fecha, null, 'Cargado a mano');
  if jsonb_typeof(p->'jardineros') = 'array' and jsonb_array_length(p->'jardineros') > 0 then
    select array_agg(x::uuid) into v_jard from jsonb_array_elements_text(p->'jardineros') x;
    perform parques.asignar_jardineros(v_id, v_jard);
  end if;
  if coalesce((p->>'realizado')::boolean, false) then
    perform parques.marcar_realizado(v_id, least(v_fecha, parques.hoy()), v_bl, null);
  end if;
  return (select j from parques.v_trabajos where id = v_id);
end $$;

-- ---------- cobros ----------
create or replace function parques.registrar_pago(p_cargos uuid[], p_metodo text, p_fecha date default null,
                                                  p_monto numeric default null, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare v_cli uuid; v_total numeric := 0; v_pago uuid; r record; v_monto numeric;
begin
  perform parques.exigir_admin();
  if p_metodo not in ('efectivo','transferencia','otro') then raise exception 'Método de cobro inválido'; end if;
  if coalesce(cardinality(p_cargos), 0) = 0 then raise exception 'No hay nada para cobrar'; end if;
  select min(cliente_id::text)::uuid into v_cli from parques.cargos where id = any(p_cargos);
  if (select count(distinct cliente_id) from parques.cargos where id = any(p_cargos)) <> 1 then
    raise exception 'Los cargos deben ser de un mismo cliente';
  end if;
  insert into parques.pagos (cliente_id, fecha, monto, metodo, nota, usuario_nombre)
  values (v_cli, coalesce(p_fecha, parques.hoy()), 1, p_metodo, nullif(trim(p_nota), ''), parques.usuario_nombre())
  returning id into v_pago;
  for r in select id, saldo from parques.v_cargos where id = any(p_cargos) and saldo > 0 order by fecha loop
    v_monto := case when p_monto is not null and cardinality(p_cargos) = 1 then p_monto else r.saldo end;
    if v_monto <= 0 or v_monto > r.saldo then raise exception 'El importe debe estar entre 1 y el saldo (%)', r.saldo; end if;
    insert into parques.pago_cargos values (v_pago, r.id, v_monto);
    v_total := v_total + v_monto;
  end loop;
  if v_total = 0 then raise exception 'Ya estaba todo cobrado'; end if;
  update parques.pagos set monto = v_total where id = v_pago;
  return jsonb_build_object('pago_id', v_pago, 'monto', v_total);
end $$;

create or replace function parques.anular_pago(p_pago uuid) returns void
language plpgsql security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  delete from parques.pagos where id = p_pago;
  if not found then raise exception 'Cobro inexistente'; end if;
end $$;

create or replace function parques.editar_cargo(p_cargo uuid, p_monto numeric, p_nota text default null) returns void
language plpgsql security definer set search_path = parques, public as $$
declare v_cob numeric;
begin
  perform parques.exigir_admin();
  select cobrado into v_cob from parques.v_cargos where id = p_cargo;
  if not found then raise exception 'Cargo inexistente'; end if;
  if p_monto is null or p_monto < v_cob then raise exception 'El importe no puede ser menor a lo ya cobrado (%)', v_cob; end if;
  update parques.cargos set monto = p_monto, nota = coalesce(nullif(trim(p_nota), ''), nota) where id = p_cargo;
end $$;

-- ---------- equipo / configuración ----------
create or replace function parques.guardar_jardinero(p jsonb) returns uuid
language plpgsql security definer set search_path = parques, public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_activo boolean := coalesce((p->>'activo')::boolean, true); r record;
begin
  perform parques.exigir_admin();
  perform parques.texto_obligatorio(p->>'nombre', 'El nombre');
  if v_id is null then
    insert into parques.jardineros (nombre, telefono, color, activo)
    values (trim(p->>'nombre'), nullif(trim(p->>'telefono'), ''), coalesce(nullif(p->>'color', ''), '#2f6b3a'), v_activo)
    returning id into v_id;
  else
    update parques.jardineros set nombre = trim(p->>'nombre'), telefono = nullif(trim(p->>'telefono'), ''),
           color = coalesce(nullif(p->>'color', ''), color), activo = v_activo
     where id = v_id;
    if not found then raise exception 'Jardinero inexistente'; end if;
    if not v_activo then
      -- se lo saca de los trabajos FUTUROS pendientes; su historial queda intacto
      for r in select tj.trabajo_id from parques.trabajo_jardineros tj join parques.trabajos t on t.id = tj.trabajo_id
                where tj.jardinero_id = v_id and t.estado in ('pendiente','asignado') and t.fecha >= parques.hoy() loop
        perform parques.asignar_jardineros(r.trabajo_id,
          array(select jardinero_id from parques.trabajo_jardineros where trabajo_id = r.trabajo_id and jardinero_id <> v_id));
      end loop;
    end if;
  end if;
  return v_id;
end $$;

create or replace function parques.guardar_tipo_servicio(p jsonb) returns uuid
language plpgsql security definer set search_path = parques, public as $$
declare v_id uuid := nullif(p->>'id', '')::uuid; v_modo text := p->>'modo_cobro';
begin
  perform parques.exigir_admin();
  perform parques.texto_obligatorio(p->>'nombre', 'El nombre');
  if v_id is null then
    if v_modo not in ('por_visita','abono_mensual','por_bloque') then raise exception 'Modo de cobro inválido'; end if;
    insert into parques.tipos_servicio (codigo, nombre, modo_cobro, minutos_bloque, usa_tipo_propiedad, frecuencia_default, orden)
    values (coalesce(nullif(p->>'codigo', ''), 'srv_' || substr(md5(random()::text), 1, 8)), trim(p->>'nombre'), v_modo,
            nullif(p->>'minutos_bloque', '')::int, coalesce((p->>'usa_tipo_propiedad')::boolean, true),
            coalesce(nullif(p->>'frecuencia_default', ''), 'puntual'),
            coalesce((p->>'orden')::int, (select coalesce(max(orden), 0) + 1 from parques.tipos_servicio)))
    returning id into v_id;
  else
    -- el modo de cobro no se cambia una vez creado (afectaría el historial)
    update parques.tipos_servicio set nombre = trim(p->>'nombre'),
           minutos_bloque = coalesce(nullif(p->>'minutos_bloque', '')::int, minutos_bloque),
           frecuencia_default = coalesce(nullif(p->>'frecuencia_default', ''), frecuencia_default),
           activo = coalesce((p->>'activo')::boolean, activo), orden = coalesce((p->>'orden')::int, orden)
     where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function parques.cambiar_tarifa(p_tipo uuid, p_propiedad text, p_monto numeric, p_desde date default null) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare v_desde date := coalesce(p_desde, parques.hoy()); n int;
begin
  perform parques.exigir_admin();
  if p_monto is null or p_monto < 0 then raise exception 'Importe inválido'; end if;
  if p_propiedad is not null and p_propiedad not in ('comun','esquina') then raise exception 'Tipo de propiedad inválido'; end if;
  insert into parques.tarifas (tipo_servicio_id, tipo_propiedad, monto, vigente_desde, creado_por)
  values (p_tipo, p_propiedad, p_monto, v_desde, parques.usuario_nombre())
  on conflict (tipo_servicio_id, (coalesce(tipo_propiedad,'')), vigente_desde) do update set monto = excluded.monto, creado = now();
  n := parques.recalcular_pendientes(null, null, p_tipo);
  return jsonb_build_object('trabajos_actualizados', n);
end $$;

create or replace function parques.guardar_config(p_clave text, p_valor jsonb) returns void
language plpgsql security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  if p_clave not in ('horizonte_semanas','asignar_habitual','dias_proximos','max_trabajos_dia','motivos_reprogramacion','motivos_cancelacion','observaciones_rapidas')
  then raise exception 'Clave de configuración desconocida'; end if;
  if p_clave = 'horizonte_semanas' and ((p_valor)::text::int < 1 or (p_valor)::text::int > 26) then
    raise exception 'El horizonte debe ser entre 1 y 26 semanas';
  end if;
  insert into parques.config (clave, valor) values (p_clave, p_valor)
  on conflict (clave) do update set valor = excluded.valor, actualizado = now();
  if p_clave = 'horizonte_semanas' then perform parques.generar_trabajos(null); end if;
end $$;

-- =====================================================================
-- LECTURAS (devuelven JSON listo para la pantalla)
-- =====================================================================

create or replace function parques.api_trabajos(p_desde date, p_hasta date, p_filtros jsonb default '{}'::jsonb) returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
declare f jsonb := coalesce(p_filtros, '{}'::jsonb);
begin
  perform parques.exigir_admin();
  return coalesce((
    select jsonb_agg(v.j order by v.fecha, v.horario nulls last, v.cliente_nombre)
      from parques.v_trabajos v
     where v.fecha between p_desde and p_hasta
       and (f->>'estado' is null or v.estado = f->>'estado'
            or (f->>'estado' = 'sin_asignar' and v.estado = 'pendiente')
            or (f->>'estado' = 'abiertos' and v.estado in ('pendiente','asignado')))
       and (f->>'cliente_id' is null or v.cliente_id = (f->>'cliente_id')::uuid)
       and (f->>'tipo_servicio_id' is null or v.tipo_servicio_id = (f->>'tipo_servicio_id')::uuid)
       and (f->>'jardinero_id' is null or exists (select 1 from parques.trabajo_jardineros tj
                                                   where tj.trabajo_id = v.id and tj.jardinero_id = (f->>'jardinero_id')::uuid))
       and (coalesce(f->>'buscar', '') = '' or v.cliente_nombre ilike '%' || (f->>'buscar') || '%'
            or v.direccion ilike '%' || (f->>'buscar') || '%')
  ), '[]'::jsonb);
end $$;

create or replace function parques.api_trabajo(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  return (select v.j || jsonb_build_object(
      'historial', coalesce((select jsonb_agg(jsonb_build_object('tipo', h.tipo, 'fecha_anterior', h.fecha_anterior, 'fecha_nueva', h.fecha_nueva,
                     'motivo', h.motivo, 'detalle', h.detalle, 'usuario', h.usuario_nombre, 'creado', h.creado) order by h.creado)
                   from parques.historial_trabajo h where h.trabajo_id = v.id), '[]'::jsonb),
      'cadena', coalesce((with recursive ant as (
                    select t.id, t.origen_id, t.fecha, t.estado, 0 as n from parques.trabajos t where t.id = v.id
                    union all select t.id, t.origen_id, t.fecha, t.estado, ant.n + 1 from parques.trabajos t join ant on t.id = ant.origen_id where ant.n < 50)
                  select jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'estado', estado) order by n desc) from ant where n > 0), '[]'::jsonb),
      'servicio_cliente', (select jsonb_build_object('id', s.id, 'frecuencia', s.frecuencia, 'intervalo_dias', s.intervalo_dias, 'dias_mes', s.dias_mes)
                             from parques.servicios_cliente s where s.id = v.servicio_cliente_id))
    from parques.v_trabajos v where v.id = p_id);
end $$;

create or replace function parques.resumen_cliente(p_cliente uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'proximo', (select jsonb_build_object('id', t.id, 'fecha', t.fecha, 'estado', t.estado, 'servicio', ts.nombre)
                  from parques.trabajos t join parques.tipos_servicio ts on ts.id = t.tipo_servicio_id
                 where t.cliente_id = p_cliente and t.estado in ('pendiente','asignado') and t.fecha >= parques.hoy()
                 order by t.fecha limit 1),
    'ultimo', (select jsonb_build_object('id', t.id, 'fecha', t.fecha_realizado, 'servicio', ts.nombre, 'jardineros', parques.nombres_jardineros(t.id))
                 from parques.trabajos t join parques.tipos_servicio ts on ts.id = t.tipo_servicio_id
                where t.cliente_id = p_cliente and t.estado = 'realizado' order by t.fecha_realizado desc, t.fecha desc limit 1),
    'atrasados', (select count(*) from parques.trabajos t where t.cliente_id = p_cliente and t.estado in ('pendiente','asignado') and t.fecha < parques.hoy()),
    'saldo', (select coalesce(sum(saldo), 0) from parques.v_cargos where cliente_id = p_cliente)
  )
$$;

create or replace function parques.api_clientes(p_buscar text default null, p_estado text default null) returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
declare b text := nullif(trim(p_buscar), ''); bd text := nullif(regexp_replace(coalesce(p_buscar, ''), '\D', '', 'g'), '');
begin
  perform parques.exigir_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'direccion', c.direccion, 'telefono', c.telefono,
             'whatsapp', c.whatsapp, 'maps_url', c.maps_url, 'lat', c.lat, 'lng', c.lng, 'tipo_propiedad', c.tipo_propiedad,
             'estado', c.estado, 'observaciones', c.observaciones, 'demo', c.demo,
             'jardinero_habitual', (select nombre from parques.jardineros where id = c.jardinero_habitual_id),
             'servicios', coalesce((select jsonb_agg(ts.nombre order by ts.orden) from parques.servicios_cliente s
                                    join parques.tipos_servicio ts on ts.id = s.tipo_servicio_id
                                    where s.cliente_id = c.id and s.estado = 'activo'), '[]'::jsonb))
           || parques.resumen_cliente(c.id) order by c.nombre)
      from parques.clientes c
     where (p_estado is null or c.estado = p_estado)
       and (b is null or c.nombre ilike '%' || b || '%' or c.direccion ilike '%' || b || '%'
            or (bd is not null and length(bd) >= 3 and (regexp_replace(coalesce(c.telefono, ''), '\D', '', 'g') like '%' || bd || '%'
                                     or regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') like '%' || bd || '%')))
  ), '[]'::jsonb);
end $$;

create or replace function parques.api_cliente(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  return (select to_jsonb(c) - 'creado' - 'actualizado'
    || jsonb_build_object(
      'jardinero_habitual', (select nombre from parques.jardineros where id = c.jardinero_habitual_id),
      'servicios', coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object(
              'tipo', ts.nombre, 'codigo', ts.codigo, 'modo_cobro', ts.modo_cobro, 'minutos_bloque', ts.minutos_bloque,
              'horario', to_char(s.horario, 'HH24:MI'),
              'precio_vigente', parques.precio_servicio(s.id, parques.hoy()),
              'jardinero', (select nombre from parques.jardineros where id = s.jardinero_id),
              'proxima', (select min(t.fecha) from parques.trabajos t where t.servicio_cliente_id = s.id
                           and t.estado in ('pendiente','asignado') and t.fecha >= parques.hoy()))
            order by s.estado, ts.orden)
          from parques.servicios_cliente s join parques.tipos_servicio ts on ts.id = s.tipo_servicio_id
          where s.cliente_id = c.id), '[]'::jsonb),
      'trabajos', coalesce((select jsonb_agg(v.j order by v.fecha desc, v.horario desc nulls last)
                             from parques.v_trabajos v where v.cliente_id = c.id), '[]'::jsonb),
      'cargos', coalesce((select jsonb_agg(jsonb_build_object('id', vc.id, 'concepto', vc.concepto, 'fecha', vc.fecha, 'monto', vc.monto,
                     'cobrado', vc.cobrado, 'saldo', vc.saldo, 'trabajo_id', vc.trabajo_id, 'periodo', vc.periodo, 'nota', vc.nota) order by vc.fecha desc)
                   from parques.v_cargos vc where vc.cliente_id = c.id), '[]'::jsonb),
      'pagos', coalesce((select jsonb_agg(jsonb_build_object('id', pg.id, 'fecha', pg.fecha, 'monto', pg.monto, 'metodo', pg.metodo,
                     'nota', pg.nota) order by pg.fecha desc, pg.creado desc)
                   from parques.pagos pg where pg.cliente_id = c.id), '[]'::jsonb))
    || parques.resumen_cliente(c.id)
    from parques.clientes c where c.id = p_id);
end $$;

create or replace function parques.api_config() returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  return jsonb_build_object(
    'perfil', (select jsonb_build_object('nombre', nombre, 'rol', rol) from parques.perfiles where user_id = auth.uid()),
    'hoy', parques.hoy(),
    'jardineros', coalesce((select jsonb_agg(to_jsonb(j) - 'creado' - 'actualizado' order by not j.activo, j.nombre) from parques.jardineros j), '[]'::jsonb),
    'tipos_servicio', coalesce((select jsonb_agg(to_jsonb(ts) - 'creado' - 'actualizado' || jsonb_build_object(
        'tarifas', jsonb_build_object(
           'comun',   parques.tarifa_vigente(ts.id, 'comun', parques.hoy()),
           'esquina', parques.tarifa_vigente(ts.id, 'esquina', parques.hoy()),
           'unica',   parques.tarifa_vigente(ts.id, null, parques.hoy())),
        'historial_tarifas', coalesce((select jsonb_agg(jsonb_build_object('tipo_propiedad', tf.tipo_propiedad, 'monto', tf.monto,
                     'vigente_desde', tf.vigente_desde, 'creado_por', tf.creado_por) order by tf.vigente_desde desc, tf.creado desc)
                   from parques.tarifas tf where tf.tipo_servicio_id = ts.id), '[]'::jsonb))
        order by ts.orden) from parques.tipos_servicio ts), '[]'::jsonb),
    'config', coalesce((select jsonb_object_agg(clave, valor) from parques.config), '{}'::jsonb),
    'hay_demo', exists (select 1 from parques.clientes where demo)
  );
end $$;

create or replace function parques.api_inicio() returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
declare h date := parques.hoy(); lun date; m0 date; m1 date; prox int;
begin
  perform parques.exigir_admin();
  lun := h - (extract(isodow from h)::int - 1);
  m0 := date_trunc('month', h)::date; m1 := (m0 + interval '1 month - 1 day')::date;
  prox := coalesce((parques.cfg('dias_proximos', '3'::jsonb))::text::int, 3);
  return jsonb_build_object(
    'hoy', h,
    'trabajos', parques.api_trabajos(h, h, '{}'::jsonb),
    'semana', (select jsonb_build_object('total', count(*) filter (where estado <> 'reprogramado'),
                      'realizados', count(*) filter (where estado = 'realizado'),
                      'abiertos', count(*) filter (where estado in ('pendiente','asignado')))
                 from parques.trabajos where fecha between lun and lun + 6),
    'mes', (select jsonb_build_object(
                'realizados', count(*) filter (where estado = 'realizado'),
                'pendientes', count(*) filter (where estado in ('pendiente','asignado')),
                'cancelados', count(*) filter (where estado = 'cancelado'),
                'reprogramados', count(*) filter (where estado = 'reprogramado'),
                'facturado', (select coalesce(sum(monto), 0) from parques.cargos where fecha between m0 and m1),
                'estimado', (select coalesce(sum(monto), 0) from parques.cargos where fecha between m0 and m1)
                          + coalesce(sum(precio) filter (where estado in ('pendiente','asignado')), 0))
              from parques.trabajos where fecha between m0 and m1),
    'alertas', jsonb_build_object(
       'sin_asignar', parques.api_trabajos(h, h + 7, '{"estado":"sin_asignar"}'::jsonb),
       'atrasados', parques.api_trabajos(h - 60, h - 1, '{"estado":"abiertos"}'::jsonb),
       'proximos', parques.api_trabajos(h + 1, h + prox, '{"estado":"abiertos"}'::jsonb),
       'sin_proxima', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) order by c.nombre)
                       from parques.clientes c where c.estado = 'activo'
                        and not exists (select 1 from parques.trabajos t where t.cliente_id = c.id and t.estado in ('pendiente','asignado') and t.fecha >= h)), '[]'::jsonb),
       'saldo_pendiente', (select coalesce(sum(saldo), 0) from parques.v_cargos))
  );
end $$;

create or replace function parques.equivalente_mensual(s parques.servicios_cliente) returns numeric
language sql stable as $$
  select case when ts.modo_cobro = 'abono_mensual' then parques.precio_servicio(s.id, parques.hoy())
              when s.frecuencia = 'puntual' then 0
              else parques.precio_servicio(s.id, parques.hoy()) * coalesce(s.bloques_estimados, 1)
                   * case when parques.intervalo_servicio(s) is not null then round(30.0 / parques.intervalo_servicio(s), 2)
                          else coalesce(cardinality(s.dias_mes), 1) end end
  from parques.tipos_servicio ts where ts.id = s.tipo_servicio_id
$$;

create or replace function parques.api_estadisticas(p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  if p_desde > p_hasta then raise exception 'El rango de fechas es inválido'; end if;
  return jsonb_build_object(
    'desde', p_desde, 'hasta', p_hasta,
    'trabajos', (select jsonb_build_object(
        'total', count(*) filter (where t.estado <> 'reprogramado'),
        'realizados', count(*) filter (where t.estado = 'realizado'),
        'pendientes', count(*) filter (where t.estado in ('pendiente','asignado')),
        'cancelados', count(*) filter (where t.estado = 'cancelado'),
        'reprogramados', count(*) filter (where t.estado = 'reprogramado'),
        'atrasados', count(*) filter (where t.estado in ('pendiente','asignado') and t.fecha < parques.hoy()))
      from parques.trabajos t where t.fecha between p_desde and p_hasta),
    'por_servicio', coalesce((select jsonb_agg(jsonb_build_object('id', ts.id, 'nombre', ts.nombre, 'codigo', ts.codigo, 'modo_cobro', ts.modo_cobro,
          'realizados', (select count(*) from parques.trabajos t where t.tipo_servicio_id = ts.id and t.estado = 'realizado' and t.fecha_realizado between p_desde and p_hasta),
          'bloques', (select coalesce(sum(t.bloques), 0) from parques.trabajos t where t.tipo_servicio_id = ts.id and t.estado = 'realizado' and t.fecha_realizado between p_desde and p_hasta),
          'facturado', (select coalesce(sum(cg.monto), 0) from parques.cargos cg
                          left join parques.trabajos t on t.id = cg.trabajo_id
                          left join parques.servicios_cliente s on s.id = cg.servicio_cliente_id
                         where cg.fecha between p_desde and p_hasta and coalesce(t.tipo_servicio_id, s.tipo_servicio_id) = ts.id))
        order by ts.orden) from parques.tipos_servicio ts), '[]'::jsonb),
    'dinero', jsonb_build_object(
        'facturado', (select coalesce(sum(monto), 0) from parques.cargos where fecha between p_desde and p_hasta),
        'cobrado', (select coalesce(sum(monto), 0) from parques.pagos where fecha between p_desde and p_hasta),
        'pendiente_periodo', (select coalesce(sum(saldo), 0) from parques.v_cargos where fecha between p_desde and p_hasta),
        'pendiente_total', (select coalesce(sum(saldo), 0) from parques.v_cargos),
        'por_metodo', coalesce((select jsonb_object_agg(metodo, total) from (select metodo, sum(monto) total from parques.pagos
                                 where fecha between p_desde and p_hasta group by metodo) x), '{}'::jsonb),
        'estimado_pendientes', (select coalesce(sum(precio), 0) from parques.trabajos where estado in ('pendiente','asignado') and fecha between p_desde and p_hasta)),
    'por_jardinero', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'nombre', j.nombre, 'color', j.color, 'activo', j.activo,
          'realizados', x.realizados, 'compartidos', x.compartidos, 'bloques', x.bloques, 'participacion', x.participacion) order by x.realizados desc, j.nombre)
        from parques.jardineros j
        cross join lateral (
          select count(*) as realizados,
                 count(*) filter (where (select count(*) from parques.trabajo_jardineros o where o.trabajo_id = t.id) > 1) as compartidos,
                 coalesce(sum(t.bloques), 0) as bloques,
                 -- parte proporcional (no duplica la facturación)
                 coalesce(sum(t.precio / (select count(*) from parques.trabajo_jardineros o where o.trabajo_id = t.id)), 0)::numeric(12,0) as participacion
            from parques.trabajo_jardineros tj join parques.trabajos t on t.id = tj.trabajo_id
           where tj.jardinero_id = j.id and t.estado = 'realizado' and t.fecha_realizado between p_desde and p_hasta) x
        where j.activo or x.realizados > 0), '[]'::jsonb),
    'sin_jardinero', (select count(*) from parques.trabajos t where t.estado = 'realizado' and t.fecha_realizado between p_desde and p_hasta
                        and not exists (select 1 from parques.trabajo_jardineros tj where tj.trabajo_id = t.id)),
    'clientes_activos', (select count(*) from parques.clientes where estado = 'activo'),
    'recurrente', (select jsonb_build_object(
        'clientes', count(distinct s.cliente_id),
        'mensual', coalesce(sum(parques.equivalente_mensual(s)), 0)::numeric(12,0))
      from parques.servicios_cliente s join parques.clientes c on c.id = s.cliente_id
      where s.estado = 'activo' and c.estado = 'activo' and s.frecuencia <> 'puntual'),
    'adicionales', (select coalesce(sum(cg.monto), 0) from parques.cargos cg
                     left join parques.servicios_cliente s on s.id = cg.servicio_cliente_id
                     where cg.fecha between p_desde and p_hasta and (s.id is null or s.frecuencia = 'puntual'))
  );
end $$;

create or replace function parques.api_cobros(p_solo_pendientes boolean default true) returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', vc.id, 'cliente_id', vc.cliente_id, 'cliente', c.nombre, 'concepto', vc.concepto,
            'fecha', vc.fecha, 'monto', vc.monto, 'cobrado', vc.cobrado, 'saldo', vc.saldo, 'trabajo_id', vc.trabajo_id) order by c.nombre, vc.fecha)
     from parques.v_cargos vc join parques.clientes c on c.id = vc.cliente_id
    where not p_solo_pendientes or vc.saldo > 0), '[]'::jsonb);
end $$;

-- ---------- exportar / importar (respaldo y mudanza a otra base) ----------
create or replace function parques.api_exportar() returns jsonb
language plpgsql stable security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  return jsonb_build_object('app', 'parques-norte', 'version', 1, 'exportado', now(),
    'config',             coalesce((select jsonb_agg(to_jsonb(x)) from parques.config x), '[]'),
    'jardineros',         coalesce((select jsonb_agg(to_jsonb(x)) from parques.jardineros x), '[]'),
    'tipos_servicio',     coalesce((select jsonb_agg(to_jsonb(x)) from parques.tipos_servicio x), '[]'),
    'tarifas',            coalesce((select jsonb_agg(to_jsonb(x)) from parques.tarifas x), '[]'),
    'clientes',           coalesce((select jsonb_agg(to_jsonb(x)) from parques.clientes x), '[]'),
    'servicios_cliente',  coalesce((select jsonb_agg(to_jsonb(x)) from parques.servicios_cliente x), '[]'),
    'trabajos',           coalesce((select jsonb_agg(to_jsonb(x)) from parques.trabajos x), '[]'),
    'trabajo_jardineros', coalesce((select jsonb_agg(to_jsonb(x)) from parques.trabajo_jardineros x), '[]'),
    'historial_trabajo',  coalesce((select jsonb_agg(to_jsonb(x)) from parques.historial_trabajo x), '[]'),
    'cargos',             coalesce((select jsonb_agg(to_jsonb(x)) from parques.cargos x), '[]'),
    'pagos',              coalesce((select jsonb_agg(to_jsonb(x)) from parques.pagos x), '[]'),
    'pago_cargos',        coalesce((select jsonb_agg(to_jsonb(x)) from parques.pago_cargos x), '[]'));
end $$;

-- Reemplaza TODOS los datos por los del archivo (los perfiles de usuario no se tocan).
create or replace function parques.api_importar(p jsonb) returns jsonb
language plpgsql security definer set search_path = parques, public as $$
begin
  perform parques.exigir_admin();
  if p->>'app' is distinct from 'parques-norte' then raise exception 'El archivo no es un respaldo de Parques Norte'; end if;
  set constraints all deferred;
  delete from parques.pago_cargos; delete from parques.pagos; delete from parques.cargos;
  delete from parques.historial_trabajo; delete from parques.trabajo_jardineros;
  update parques.trabajos set origen_id = null, reprogramado_id = null; delete from parques.trabajos;
  delete from parques.servicios_cliente; delete from parques.clientes; delete from parques.tarifas;
  delete from parques.tipos_servicio; delete from parques.jardineros; delete from parques.config;
  insert into parques.config             select * from jsonb_populate_recordset(null::parques.config, p->'config');
  insert into parques.jardineros         select * from jsonb_populate_recordset(null::parques.jardineros, p->'jardineros');
  insert into parques.tipos_servicio     select * from jsonb_populate_recordset(null::parques.tipos_servicio, p->'tipos_servicio');
  insert into parques.tarifas            select * from jsonb_populate_recordset(null::parques.tarifas, p->'tarifas');
  insert into parques.clientes           select * from jsonb_populate_recordset(null::parques.clientes, p->'clientes');
  insert into parques.servicios_cliente  select * from jsonb_populate_recordset(null::parques.servicios_cliente, p->'servicios_cliente');
  insert into parques.trabajos           select * from jsonb_populate_recordset(null::parques.trabajos, p->'trabajos');
  insert into parques.trabajo_jardineros select * from jsonb_populate_recordset(null::parques.trabajo_jardineros, p->'trabajo_jardineros');
  insert into parques.historial_trabajo  select * from jsonb_populate_recordset(null::parques.historial_trabajo, p->'historial_trabajo');
  insert into parques.cargos             select * from jsonb_populate_recordset(null::parques.cargos, p->'cargos');
  insert into parques.pagos              select * from jsonb_populate_recordset(null::parques.pagos, p->'pagos');
  insert into parques.pago_cargos        select * from jsonb_populate_recordset(null::parques.pago_cargos, p->'pago_cargos');
  return jsonb_build_object('clientes', (select count(*) from parques.clientes), 'trabajos', (select count(*) from parques.trabajos));
end $$;

-- Borra los clientes de demostración y todo lo suyo (solo datos marcados demo).
create or replace function parques.borrar_demo() returns jsonb
language plpgsql security definer set search_path = parques, public as $$
declare n int;
begin
  perform parques.exigir_admin();
  set constraints all deferred;
  delete from parques.pago_cargos where cargo_id in (select id from parques.cargos where cliente_id in (select id from parques.clientes where demo));
  delete from parques.pagos where cliente_id in (select id from parques.clientes where demo);
  delete from parques.cargos where cliente_id in (select id from parques.clientes where demo);
  update parques.trabajos set origen_id = null, reprogramado_id = null where cliente_id in (select id from parques.clientes where demo);
  delete from parques.trabajos where cliente_id in (select id from parques.clientes where demo);
  delete from parques.servicios_cliente where cliente_id in (select id from parques.clientes where demo);
  delete from parques.clientes where demo;
  get diagnostics n = row_count;
  return jsonb_build_object('clientes_borrados', n);
end $$;

-- ---------- datos iniciales ----------
insert into parques.config (clave, valor) values
  ('horizonte_semanas', '8'),
  ('asignar_habitual', 'true'),
  ('dias_proximos', '3'),
  ('motivos_reprogramacion', '["Lluvia","Cliente pidió cambiar","Falta de tiempo","Sin acceso al domicilio","Equipo no disponible"]'),
  ('motivos_cancelacion', '["Cliente pidió cancelar","Lluvia","No se pudo acceder al domicilio","Cliente suspendió el servicio"]'),
  ('observaciones_rapidas', '["Hay perro","Avisar antes de ir","Entrar por lateral","Portón cerrado","Prefiere horario de mañana"]');

insert into parques.jardineros (nombre, color) values ('Pope', '#2f6b3a'), ('Pabloski', '#b5651d'), ('Chancho', '#3b6ea5');

insert into parques.tipos_servicio (codigo, nombre, modo_cobro, minutos_bloque, usa_tipo_propiedad, frecuencia_default, orden) values
  ('corte_simple', 'Corte simple', 'por_visita', null, true, 'puntual', 1),
  ('mantenimiento', 'Mantenimiento', 'abono_mensual', null, true, 'dos_por_mes', 2),
  ('canteros', 'Mantenimiento de canteros', 'por_bloque', 90, false, 'puntual', 3);

insert into parques.tarifas (tipo_servicio_id, tipo_propiedad, monto, vigente_desde, creado_por)
select id, p, m, date '2026-01-01', 'Inicial' from parques.tipos_servicio ts
join (values ('corte_simple','comun',45000), ('corte_simple','esquina',50000),
             ('mantenimiento','comun',80000), ('mantenimiento','esquina',90000),
             ('canteros',null,15000)) v(cod, p, m) on v.cod = ts.codigo;

-- ---------- ruta de búsqueda fija en todas las funciones (recomendación de seguridad) ----------
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'parques' and p.proconfig is null loop
    execute format('alter function %s set search_path = parques, public', f.sig);
  end loop;
end $$;
