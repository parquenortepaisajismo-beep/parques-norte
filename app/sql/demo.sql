-- Datos ficticios de demostración (marcados demo = true; se borran desde Configuración → Datos).
do $$
declare
  h date := parques.hoy(); ini date := parques.hoy() - 40;
  pope uuid; pablo uuid; chancho uuid; corte uuid; mant uuid; cant uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid; c6 uuid; c7 uuid; c8 uuid;
  r record; i int := 0; v jsonb;
begin
  select id into pope from parques.jardineros where nombre = 'Pope';
  select id into pablo from parques.jardineros where nombre = 'Pabloski';
  select id into chancho from parques.jardineros where nombre = 'Chancho';
  select id into corte from parques.tipos_servicio where codigo = 'corte_simple';
  select id into mant from parques.tipos_servicio where codigo = 'mantenimiento';
  select id into cant from parques.tipos_servicio where codigo = 'canteros';

  c1 := parques.guardar_cliente(jsonb_build_object('nombre','Casa Gómez','direccion','Las Magnolias 1450, Pilar','telefono','11 5555-0101','whatsapp','11 5555-0101','tipo_propiedad','comun','observaciones','Hay perro. Avisar antes de ir.','jardinero_habitual_id',pope,'fecha_alta',ini,'demo',true));
  c2 := parques.guardar_cliente(jsonb_build_object('nombre','Casa Pérez','direccion','Av. del Libertador 2300, Tigre','telefono','11 5555-0102','whatsapp','11 5555-0102','tipo_propiedad','esquina','observaciones','Entrar por lateral.','fecha_alta',ini,'demo',true));
  c3 := parques.guardar_cliente(jsonb_build_object('nombre','Familia Rodríguez','direccion','Los Robles 820, Escobar','telefono','11 5555-0103','whatsapp','11 5555-0103','tipo_propiedad','esquina','observaciones','Prefiere horario de mañana.','jardinero_habitual_id',pablo,'fecha_alta',ini,'demo',true));
  c4 := parques.guardar_cliente(jsonb_build_object('nombre','Laura Fernández','direccion','Belgrano 455, Garín','telefono','11 5555-0104','whatsapp','11 5555-0104','tipo_propiedad','comun','fecha_alta',ini,'demo',true));
  c5 := parques.guardar_cliente(jsonb_build_object('nombre','Quinta Los Álamos','direccion','Ruta 25 km 3, Escobar','telefono','11 5555-0105','tipo_propiedad','esquina','observaciones','Portón cerrado: pedir llave al casero.','jardinero_habitual_id',chancho,'fecha_alta',ini,'demo',true));
  c6 := parques.guardar_cliente(jsonb_build_object('nombre','Martín Sosa','direccion','Sarmiento 1200, Del Viso','telefono','11 5555-0106','whatsapp','11 5555-0106','tipo_propiedad','comun','fecha_alta',h - 3,'demo',true));
  c7 := parques.guardar_cliente(jsonb_build_object('nombre','Casa Benítez','direccion','Las Acacias 77, Pilar','telefono','11 5555-0107','whatsapp','11 5555-0107','tipo_propiedad','comun','fecha_alta',ini,'demo',true));
  c8 := parques.guardar_cliente(jsonb_build_object('nombre','Silvia Ramos','direccion','Mitre 330, Maquinista Savio','telefono','11 5555-0108','whatsapp','11 5555-0108','tipo_propiedad','comun','jardinero_habitual_id',chancho,'fecha_alta',ini,'demo',true));

  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c1,'tipo_servicio_id',mant,'frecuencia','dos_por_mes','fecha_inicio',ini));
  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c2,'tipo_servicio_id',corte,'frecuencia','cada_15','fecha_inicio',ini + 2,'horario','09:00'));
  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c3,'tipo_servicio_id',mant,'frecuencia','dos_por_mes','fecha_inicio',ini + 4,'precio_personalizado',85000));
  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c4,'tipo_servicio_id',corte,'frecuencia','cada_10','fecha_inicio',ini + 1));
  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c4,'tipo_servicio_id',cant,'frecuencia','mensual','fecha_inicio',ini + 5,'bloques_estimados',2));
  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c5,'tipo_servicio_id',mant,'frecuencia','semanal','fecha_inicio',ini + 3));
  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c7,'tipo_servicio_id',mant,'frecuencia','dos_por_mes','fecha_inicio',ini + 6));
  perform parques.guardar_servicio(jsonb_build_object('cliente_id',c8,'tipo_servicio_id',corte,'frecuencia','cada_15','fecha_inicio',ini + 7));
  perform parques.asegurar_cargos_abono(h - 32);

  -- pasado: casi todo realizado, una cancelación y una reprogramación
  for r in select t.id, t.fecha, t.estado from parques.trabajos t
           where t.fecha < h and t.estado in ('pendiente','asignado') order by t.fecha, t.id loop
    i := i + 1;
    if i = 3 then
      perform parques.cancelar_trabajo(r.id, 'Cliente pidió cancelar', 'Tenía un evento en el jardín.');
    elsif i = 5 then
      v := parques.reprogramar_trabajo(r.id, r.fecha + 2, 'Lluvia', null, false);
      if r.fecha + 2 < h then
        perform parques.marcar_realizado((v->>'id')::uuid, r.fecha + 2, null, array[pablo]);
      end if;
    elsif r.estado = 'pendiente' then
      perform parques.marcar_realizado(r.id, r.fecha, null,
        case i % 4 when 0 then array[pope] when 1 then array[pablo] when 2 then array[chancho] else array[pope, pablo] end);
    else
      perform parques.marcar_realizado(r.id, r.fecha, null, null);
    end if;
  end loop;

  -- hoy: un puntual sin asignar y uno de canteros
  perform parques.crear_trabajo(jsonb_build_object('cliente_id',c6,'tipo_servicio_id',corte,'fecha',h,'observaciones','Primera visita: ver estado del césped.'));
  perform parques.crear_trabajo(jsonb_build_object('cliente_id',c2,'tipo_servicio_id',cant,'fecha',h,'bloques',2,'jardineros',jsonb_build_array(pablo)));

  -- cobros: lo de más de 12 días queda cobrado, salvo Casa Pérez
  for r in select vc.id from parques.v_cargos vc
           where vc.saldo > 0 and vc.fecha < h - 12 and vc.cliente_id <> c2 order by vc.fecha loop
    i := i + 1;
    perform parques.registrar_pago(array[r.id], case when i % 2 = 0 then 'efectivo' else 'transferencia' end, null, null, null);
  end loop;

  -- un cliente pausado
  perform parques.cambiar_estado_cliente(c7, 'pausado', 'Viaje de los dueños');
end $$;
