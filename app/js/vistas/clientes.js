// Clientes: lista con búsqueda, ficha, alta/edición en pasos, servicios contratados.
import { rpc } from '../db.js';
import {
  esc, pesos, ddmm, ddmmaa, relativo, hoyISO, linkWhatsApp, linkMaps, linkTel, ICONOS, FRECUENCIAS, MODOS, METODOS,
  textoFrecuencia, ESTADOS, debounce
} from '../util.js';
import {
  estado, jardineros, tipos, cfg, abrirHoja, toast, hacer, confirmar, exigir, chipsJardineros, conectarChips,
  abrirDetalle, abrirCobro, badgeEstado, cacheTrabajos, tarjetaTrabajo, conectarTrabajos
} from '../ui.js';

const st = { buscar: '', estado: 'activo' };

// ================= LISTA =================
export async function renderLista(v) {
  v.innerHTML = `
    <div class="buscador">
      <input type="search" id="buscar" placeholder="Buscar por nombre, dirección o teléfono" value="${esc(st.buscar)}" autocomplete="off">
      <div class="seg" style="margin-top:8px">
        ${[['activo', 'Activos'], ['pausado', 'Pausados'], ['baja', 'De baja'], ['', 'Todos']].map(([k, n]) =>
          `<button data-est="${k}" class="${st.estado === k ? 'on' : ''}">${n}</button>`).join('')}
      </div>
    </div>
    <div id="lista"></div>
    <a class="btn prim fab" href="#/cliente/nuevo">${ICONOS.mas} Cliente</a>`;
  const lista = v.querySelector('#lista');
  const cargar = async () => {
    const cs = await rpc('api_clientes', { p_buscar: st.buscar || null, p_estado: st.estado || null });
    lista.innerHTML = cs.length ? `<p class="mut peq" style="margin:0 0 8px">${cs.length} cliente${cs.length === 1 ? '' : 's'}</p>` + cs.map(itemCliente).join('')
      : `<div class="vacio">${st.buscar ? 'No hay clientes con esa búsqueda.' : 'Todavía no hay clientes.'}<br><a href="#/cliente/nuevo">Agregar cliente</a></div>`;
  };
  v.querySelector('#buscar').oninput = debounce(e => { st.buscar = e.target.value.trim(); cargar(); }, 250);
  v.querySelectorAll('[data-est]').forEach(b => b.onclick = () => {
    st.estado = b.dataset.est; v.querySelectorAll('[data-est]').forEach(x => x.classList.toggle('on', x === b)); cargar();
  });
  await cargar();
}

function itemCliente(c) {
  const wa = linkWhatsApp(c.whatsapp), tel = linkTel(c.telefono), maps = linkMaps(c);
  return `<a class="cli" href="#/cliente/${c.id}">
    <div class="entre"><span class="n">${esc(c.nombre)}</span>${c.estado !== 'activo' ? `<span class="badge e-${c.estado}">${c.estado === 'baja' ? 'Baja' : 'Pausado'}</span>` : ''}</div>
    ${c.direccion ? `<div class="s">${esc(c.direccion)}</div>` : ''}
    <div class="s">${c.servicios.length ? esc(c.servicios.join(' · ')) : '<i>Sin servicios activos</i>'}${c.tipo_propiedad === 'esquina' ? ' · Esquina' : ''}</div>
    <div class="s" style="margin-top:4px">
      ${c.ultimo ? `Último: <b>${ddmm(c.ultimo.fecha)}</b>` : 'Sin visitas aún'}
      ${c.proximo ? ` · Próximo: <b>${ddmm(c.proximo.fecha)}</b> (${relativo(c.proximo.fecha)})` : ''}
      ${c.atrasados ? ` · <span style="color:var(--peligro);font-weight:700">${c.atrasados} atrasado(s)</span>` : ''}
      ${Number(c.saldo) > 0 ? ` · <span style="color:var(--e-pendiente);font-weight:700">debe ${pesos(c.saldo)}</span>` : ''}
    </div>
  </a>`;
}

// ================= FICHA =================
export async function renderFicha(v, id) {
  const c = await rpc('api_cliente', { p_id: id });
  if (!c) { v.innerHTML = '<div class="vacio">Cliente no encontrado. <a href="#/clientes">Volver</a></div>'; return; }
  const wa = linkWhatsApp(c.whatsapp), tel = linkTel(c.telefono), maps = linkMaps(c);
  const hoy = hoyISO();
  const futuros = c.trabajos.filter(t => t.fecha >= hoy && (t.estado === 'pendiente' || t.estado === 'asignado')).reverse();
  const historial = c.trabajos.filter(t => !(t.fecha >= hoy && (t.estado === 'pendiente' || t.estado === 'asignado')));
  const deuda = c.cargos.filter(x => Number(x.saldo) > 0);
  const ultimoT = c.ultimo && c.trabajos.find(t => t.id === c.ultimo.id);
  c.trabajos.forEach(t => cacheTrabajos.set(t.id, t));

  v.innerHTML = `
    <a href="#/clientes" class="btn-texto">${ICONOS.izq.replace('class="ico"', 'class="ico" style="vertical-align:-4px"')} Clientes</a>
    <div class="entre" style="align-items:flex-start"><h1>${esc(c.nombre)}</h1>
      <span class="badge e-${c.estado}" style="margin-top:8px">${{ activo: 'Activo', pausado: 'Pausado', baja: 'Baja' }[c.estado]}</span></div>
    ${c.direccion ? `<div class="mut">${esc(c.direccion)}</div>` : ''}
    <div class="acciones-cliente">
      ${tel ? `<a class="btn" href="${esc(tel)}">${ICONOS.tel}Llamar</a>` : `<button class="btn" disabled>${ICONOS.tel}Llamar</button>`}
      ${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICONOS.wa}WhatsApp</a>` : `<button class="btn" disabled>${ICONOS.wa}WhatsApp</button>`}
      ${maps ? `<a class="btn" href="${esc(maps)}" target="_blank" rel="noopener">${ICONOS.mapa}Maps</a>` : `<button class="btn" disabled>${ICONOS.mapa}Maps</button>`}
      <button class="btn" data-registrar>${ICONOS.mas}Registrar trabajo</button>
      <a class="btn" href="#/cliente/${c.id}/editar">${ICONOS.lapiz}Editar</a>
    </div>

    <div class="grilla dos">
      <div class="tarjeta"><div class="mut peq">PRÓXIMO SERVICIO</div>
        ${c.proximo ? `<div class="precio">${ddmmaa(c.proximo.fecha)}</div><div class="peq">${esc(c.proximo.servicio)} · ${relativo(c.proximo.fecha)} · <span class="badge e-${c.proximo.estado}">${ESTADOS[c.proximo.estado]}</span></div>`
          : '<div class="peq mut" style="margin-top:4px">Nada programado</div>'}
        ${c.atrasados ? `<div class="peq" style="color:var(--peligro);font-weight:700;margin-top:4px">${c.atrasados} trabajo(s) atrasado(s)</div>` : ''}</div>
      <div class="tarjeta"><div class="mut peq">ÚLTIMO SERVICIO</div>
        ${c.ultimo ? `<div class="precio">${ddmmaa(c.ultimo.fecha)}</div><div class="peq">${esc(c.ultimo.servicio)} · ${esc(c.ultimo.jardineros)} · <span class="badge e-realizado">Realizado</span></div>`
          : '<div class="peq mut" style="margin-top:4px">Sin visitas realizadas</div>'}</div>
    </div>

    <h2>Datos</h2>
    <div class="tarjeta">
      <div class="dato"><span>Teléfono</span><span>${esc(c.telefono || '—')}</span></div>
      <div class="dato"><span>WhatsApp</span><span>${esc(c.whatsapp || '—')}</span></div>
      <div class="dato"><span>Propiedad</span><span>${c.tipo_propiedad === 'esquina' ? 'Esquina' : 'Común'}</span></div>
      <div class="dato"><span>Jardinero habitual</span><span>${esc(c.jardinero_habitual || '—')}</span></div>
      <div class="dato"><span>Cliente desde</span><span>${ddmmaa(c.fecha_alta)}</span></div>
      ${c.observaciones ? `<div class="dato"><span>Observaciones</span><span style="white-space:pre-line">${esc(c.observaciones)}</span></div>` : ''}
    </div>

    <div class="entre"><h2>Servicios</h2><button class="btn chico" data-nuevo-srv>${ICONOS.mas} Agregar</button></div>
    ${c.servicios.length ? c.servicios.map(s => `<div class="srv${s.estado !== 'activo' ? ' inactivo' : ''}">
        <div class="entre"><b>${esc(s.tipo)}</b><span class="precio">${pesos(s.precio_vigente)}${s.modo_cobro === 'abono_mensual' ? '<small class="peq mut">/mes</small>' : s.modo_cobro === 'por_bloque' ? '<small class="peq mut">/bloque</small>' : ''}</span></div>
        <div class="peq mut">${esc(textoFrecuencia(s))}${s.horario ? ` · ${s.horario}` : ''}${s.precio_personalizado != null ? ' · precio personalizado' : ''}${s.jardinero ? ` · ${esc(s.jardinero)}` : ''}${s.bloques_estimados ? ` · ${Number(s.bloques_estimados)} bloque(s)` : ''}</div>
        <div class="entre peq" style="margin-top:4px"><span>${s.estado !== 'activo' ? `<span class="badge e-${s.estado}">${s.estado === 'baja' ? 'Baja' : 'Pausado'}</span>` : s.proxima ? `Próximo: <b>${ddmm(s.proxima)}</b>` : ''}</span>
          <button class="btn-texto" data-editar-srv="${s.id}">Editar</button></div>
      </div>`).join('') : '<div class="vacio peq">Sin servicios. Agregá uno para que se programen sus trabajos.</div>'}

    <div class="entre"><h2>Cobros</h2>${deuda.length > 1 ? `<button class="btn chico prim" data-cobrar-todo>Cobrar todo</button>` : ''}</div>
    <div class="tarjeta">
      <div class="entre"><span>Pendiente de cobro</span><b class="precio" style="color:${Number(c.saldo) > 0 ? 'var(--e-pendiente)' : 'var(--e-realizado)'}">${pesos(c.saldo)}</b></div>
      ${deuda.map(x => `<div class="entre peq" style="border-top:1px solid #eeece4;padding-top:6px;margin-top:6px">
          <span>${esc(x.concepto)} · ${ddmm(x.fecha)}${Number(x.cobrado) > 0 ? ` <span class="mut">(pagó ${pesos(x.cobrado)})</span>` : ''}</span>
          <span class="fila"><b class="monto">${pesos(x.saldo)}</b><button class="btn-texto" data-ajustar="${x.id}">Ajustar</button><button class="btn chico" data-cobrar="${x.id}">Cobrar</button></span></div>`).join('')}
      ${c.pagos.length ? `<details style="margin-top:10px"><summary class="peq" style="cursor:pointer;font-weight:700">Cobros registrados (${c.pagos.length})</summary>
        ${c.pagos.map(p => `<div class="entre peq" style="padding:6px 0;border-bottom:1px solid #eeece4"><span>${ddmmaa(p.fecha)} · ${METODOS[p.metodo]}${p.nota ? ` · ${esc(p.nota)}` : ''}</span>
          <span class="fila"><b class="monto">${pesos(p.monto)}</b><button class="btn-texto" style="color:var(--peligro)" data-anular="${p.id}">Anular</button></span></div>`).join('')}</details>` : ''}
    </div>

    <h2>Próximos trabajos</h2>
    <div id="futuros">${futuros.length ? futuros.slice(0, 6).map(t => tarjetaTrabajo(t, { conFecha: true, compacto: true })).join('') : '<div class="vacio peq">No hay trabajos programados.</div>'}
    ${futuros.length > 6 ? `<p class="peq mut">…y ${futuros.length - 6} más en la agenda.</p>` : ''}</div>

    <h2>Historial</h2>
    <div class="tarjeta lista-hist">${historial.length ? historial.map(t => `<div class="item" data-tid="${t.id}">
        <span class="f">${ddmm(t.fecha)}</span>
        <span><b>${esc(t.servicio.nombre)}</b> · ${t.jardineros.length ? t.jardineros.map(j => esc(j.nombre)).join(', ') : '<span class="mut">sin asignar</span>'}
          ${t.estado === 'reprogramado' ? `<br><span class="peq mut">→ ${ddmm(t.reprogramado_a)} · ${esc(t.motivo_reprogramacion)}</span>` : ''}
          ${t.estado === 'cancelado' ? `<br><span class="peq mut">${esc(t.motivo_cancelacion)}</span>` : ''}</span>
        ${badgeEstado(t)}</div>`).join('') : '<p class="mut peq">Sin historial todavía.</p>'}</div>

    <h2>Estado del cliente</h2>
    <div class="fila">
      ${c.estado !== 'activo' ? '<button class="btn prim" data-estado="activo">Reactivar</button>' : ''}
      ${c.estado !== 'pausado' ? '<button class="btn" data-estado="pausado">Pausar</button>' : ''}
      ${c.estado !== 'baja' ? '<button class="btn borde-peligro" data-estado="baja">Dar de baja</button>' : ''}
    </div>
    <p class="muy-peq mut">Pausar o dar de baja quita las visitas futuras. El historial se conserva siempre.</p>`;

  conectarTrabajos(v.querySelector('#futuros'));
  v.querySelectorAll('[data-tid]').forEach(el => el.onclick = () => abrirDetalle(el.dataset.tid));
  v.querySelector('[data-registrar]').onclick = () => registrarTrabajo(c);
  v.querySelector('[data-nuevo-srv]').onclick = () => formServicio(c, null);
  v.querySelectorAll('[data-editar-srv]').forEach(b => b.onclick = () => formServicio(c, c.servicios.find(s => s.id === b.dataset.editarSrv)));
  v.querySelectorAll('[data-cobrar]').forEach(b => b.onclick = () => abrirCobro([c.cargos.find(x => x.id === b.dataset.cobrar)], c.nombre));
  v.querySelector('[data-cobrar-todo]')?.addEventListener('click', () => abrirCobro(deuda, c.nombre));
  v.querySelectorAll('[data-ajustar]').forEach(b => b.onclick = () => ajustarCargo(c.cargos.find(x => x.id === b.dataset.ajustar)));
  v.querySelectorAll('[data-anular]').forEach(b => b.onclick = async () => {
    if (!await confirmar('¿Anular este cobro? El importe vuelve a quedar pendiente.', { ok: 'Anular cobro', peligro: true })) return;
    hacer(() => rpc('anular_pago', { p_pago: b.dataset.anular }), { ok: 'Cobro anulado' }).catch(() => {});
  });
  v.querySelectorAll('[data-estado]').forEach(b => b.onclick = () => cambiarEstado(c, b.dataset.estado));
}

// Ajuste manual de lo facturado (ej.: abono de un mes con un corte cancelado).
function ajustarCargo(x) {
  abrirHoja({
    titulo: 'Ajustar importe',
    cuerpo: `<p style="margin-top:0"><b>${esc(x.concepto)}</b> · ${ddmmaa(x.fecha)}</p>
      <label class="campo"><span>Importe a cobrar ($)</span><input type="number" inputmode="numeric" min="${Number(x.cobrado)}" step="500" value="${Number(x.monto)}" data-monto autofocus>
        <small>Ya cobrado: ${pesos(x.cobrado)}. No puede quedar por debajo de eso.</small></label>
      <label class="campo"><span>Motivo del ajuste</span><input type="text" data-nota placeholder="Ej: se canceló un corte por lluvia"></label>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>Guardar</button>`,
    alAbrir: h => {
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const m = h.$('[data-monto]').value;
        if (m === '' || Number(m) < Number(x.cobrado)) return h.$('[data-monto]').classList.add('error-campo');
        try { await hacer(() => rpc('editar_cargo', { p_cargo: x.id, p_monto: Number(m), p_nota: h.$('[data-nota]').value || null }), { ok: 'Importe ajustado' }); h.cerrar(); } catch {}
      };
    }
  });
}

function cambiarEstado(c, nuevo) {
  const txt = { activo: 'Reactivar', pausado: 'Pausar', baja: 'Dar de baja' }[nuevo];
  abrirHoja({
    titulo: `${txt} a ${c.nombre}`,
    cuerpo: nuevo === 'activo'
      ? '<p style="margin-top:0">Se vuelven a programar sus servicios activos desde hoy.</p>'
      : `<p style="margin-top:0">Se quitan sus visitas futuras. Las que ya estaban asignadas o con notas quedan como canceladas con este motivo.</p>
         <label class="campo"><span>Motivo</span><input type="text" data-motivo placeholder="${nuevo === 'pausado' ? 'Ej: viaje, invierno…' : 'Ej: se mudó'}"></label>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn ${nuevo === 'baja' ? 'peligro' : 'prim'}" data-si>${txt}</button>`,
    alAbrir: h => {
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        try {
          await hacer(() => rpc('cambiar_estado_cliente', { p_cliente: c.id, p_estado: nuevo, p_motivo: h.$('[data-motivo]')?.value || null }),
            { ok: r => nuevo === 'activo' ? `Reactivado · ${r.generados} visitas programadas` : `Listo · ${r.cancelados} visita(s) cancelada(s)` });
          h.cerrar();
        } catch {}
      };
    }
  });
}

// ================= ALTA / EDICIÓN DE CLIENTE (en pasos) =================
export async function renderForm(v, id) {
  const c = id ? await rpc('api_cliente', { p_id: id }) : { tipo_propiedad: 'comun' };
  const nuevo = !id;
  const obsRapidas = cfg('observaciones_rapidas', []);
  const pasos = nuevo ? 3 : 2;
  v.innerHTML = `
    <a href="${nuevo ? '#/clientes' : `#/cliente/${id}`}" class="btn-texto">← ${nuevo ? 'Clientes' : 'Volver'}</a>
    <h1>${nuevo ? 'Nuevo cliente' : 'Editar cliente'}</h1>
    <div class="pasos">${Array.from({ length: pasos }, (_, i) => `<i data-p="${i}"></i>`).join('')}</div>
    <form id="f" novalidate>
      <section data-paso="0">
        <h3>Datos básicos</h3>
        <label class="campo"><span>Nombre <em>*</em></span><input type="text" name="nombre" value="${esc(c.nombre || '')}" placeholder="Ej: Casa Gómez" maxlength="120" autocomplete="off"></label>
        <label class="campo"><span>Dirección</span><input type="text" name="direccion" value="${esc(c.direccion || '')}" placeholder="Calle y número, localidad"></label>
        <label class="campo"><span>Teléfono</span><input type="tel" name="telefono" value="${esc(c.telefono || '')}" placeholder="11 1234-5678" inputmode="tel"></label>
        <label class="check-linea"><input type="checkbox" name="mismo" ${!c.id || (c.whatsapp && c.whatsapp === c.telefono) ? 'checked' : ''}> El WhatsApp es el mismo número</label>
        <label class="campo" data-wa><span>WhatsApp</span><input type="tel" name="whatsapp" value="${esc(c.whatsapp || '')}" placeholder="11 1234-5678" inputmode="tel"></label>
        <div class="campo"><span>Tipo de propiedad</span>
          <div class="seg" data-prop>${[['comun', 'Común'], ['esquina', 'Esquina']].map(([k, n]) => `<button type="button" data-v="${k}" class="${c.tipo_propiedad === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      </section>
      <section data-paso="1" hidden>
        <h3>Ubicación y detalles</h3>
        <label class="campo"><span>Enlace de Google Maps</span><input type="url" name="maps_url" value="${esc(c.maps_url || '')}" placeholder="https://maps.app.goo.gl/…">
          <small>Opcional. En Maps: Compartir → Copiar enlace. Si no hay enlace, se busca la dirección.</small></label>
        <div class="campo"><span>Jardinero habitual</span>${chipsJardineros(c.jardinero_habitual_id ? [c.jardinero_habitual_id] : [])}
          <small>Se asigna solo a los trabajos nuevos de este cliente.</small></div>
        <div class="campo"><span>Observaciones</span>
          <div class="chips" data-obs-rap>${obsRapidas.map(o => `<button type="button" class="chip chico" data-v="${esc(o)}">+ ${esc(o)}</button>`).join('')}</div>
          <textarea name="observaciones" style="margin-top:8px" placeholder="Ej: hay perro, avisar antes de ir…">${esc(c.observaciones || '')}</textarea></div>
        ${!nuevo ? `<label class="campo"><span>Cliente desde</span><input type="date" name="fecha_alta" value="${c.fecha_alta || ''}"></label>` : ''}
      </section>
      ${nuevo ? `<section data-paso="2" hidden>
        <h3>Primer servicio <span class="mut peq">(opcional)</span></h3>
        <div data-srv-campos></div>
      </section>` : ''}
    </form>
    <div class="hoja-pie" style="position:sticky;bottom:calc(var(--nav-alto) + env(safe-area-inset-bottom));padding:12px 0">
      <button class="btn" data-atras>Atrás</button>
      <button class="btn prim" data-sig>Siguiente</button>
    </div>`;

  const f = v.querySelector('#f');
  let paso = 0;
  let prop = c.tipo_propiedad || 'comun';
  const leerJard = conectarChips({ $: s => v.querySelector(s) }, 'jard', { unico: true });
  const mismo = f.mismo, waCampo = v.querySelector('[data-wa]');
  const syncWa = () => { waCampo.hidden = mismo.checked; };
  mismo.onchange = syncWa; syncWa();
  v.querySelector('[data-prop]').onclick = e => { const b = e.target.closest('button'); if (!b) return; prop = b.dataset.v; v.querySelectorAll('[data-prop] button').forEach(x => x.classList.toggle('on', x === b)); };
  v.querySelector('[data-obs-rap]').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const ta = f.observaciones; ta.value = (ta.value.trim() ? ta.value.trim().replace(/\.?$/, '. ') : '') + b.dataset.v + '.';
  };
  let leerSrv = null;
  if (nuevo) leerSrv = camposServicio(v.querySelector('[data-srv-campos]'), null, () => prop, true);

  const mostrar = () => {
    v.querySelectorAll('[data-paso]').forEach(s => s.hidden = Number(s.dataset.paso) !== paso);
    v.querySelectorAll('.pasos i').forEach((p, i) => p.classList.toggle('on', i <= paso));
    v.querySelector('[data-atras]').hidden = paso === 0;
    v.querySelector('[data-sig]').textContent = paso === pasos - 1 ? (nuevo ? 'Guardar cliente' : 'Guardar cambios') : 'Siguiente';
    window.scrollTo(0, 0);
  };
  mostrar();
  if (!nuevo) { /* en edición se puede guardar desde el paso 1 */ }
  v.querySelector('[data-atras]').onclick = () => { paso--; mostrar(); };
  v.querySelector('[data-sig]').onclick = async () => {
    if (paso === 0 && !exigir({ $: s => v.querySelector(s), $$: s => [...v.querySelectorAll(s)] }, '[name=nombre]', 'El nombre es obligatorio')) return;
    if (paso < pasos - 1) { paso++; return mostrar(); }
    const datos = {
      id: c.id || null, nombre: f.nombre.value, direccion: f.direccion.value, telefono: f.telefono.value,
      whatsapp: mismo.checked ? f.telefono.value : f.whatsapp.value, maps_url: f.maps_url.value, tipo_propiedad: prop,
      observaciones: f.observaciones.value, jardinero_habitual_id: leerJard()[0] || null, fecha_alta: f.fecha_alta?.value || null
    };
    if (datos.maps_url && !/^https?:\/\//.test(datos.maps_url)) { toast('El enlace de Maps tiene que empezar con https://', { error: true }); paso = 1; return mostrar(); }
    let srv = null;
    if (leerSrv) { srv = leerSrv(); if (srv === false) return; }
    const btn = v.querySelector('[data-sig]'); btn.disabled = true;
    try {
      const cid = await rpc('guardar_cliente', { p: datos });
      let extra = '';
      if (srv) { const r = await rpc('guardar_servicio', { p: { ...srv, cliente_id: cid } }); extra = ` · ${r.generados} visita(s) programada(s)`; }
      toast((nuevo ? 'Cliente creado' : 'Cambios guardados') + extra);
      location.hash = `#/cliente/${cid}`;
    } catch (e) { toast(e.message, { error: true }); btn.disabled = false; }
  };
}

// ================= SERVICIO =================
// Campos del servicio (se usan en el alta del cliente y en la hoja de servicio).
function camposServicio(cont, s, getProp, opcional = false) {
  const ts = tipos();
  const hoy = hoyISO();
  let tipoSel = s ? ts.find(t => t.id === s.tipo_servicio_id) || tipos(false).find(t => t.id === s.tipo_servicio_id) : null;
  cont.innerHTML = `
    ${s ? `<p style="margin-top:0"><b>${esc(tipoSel?.nombre || '')}</b> · ${MODOS[tipoSel?.modo_cobro] || ''}</p>` : `
    <div class="campo"><span>Servicio${opcional ? '' : ' <em>*</em>'}</span>
      <div class="chips" data-tipo>${opcional ? '<button type="button" class="chip on" data-v="">Ninguno por ahora</button>' : ''}
        ${ts.map(t => `<button type="button" class="chip" data-v="${t.id}">${esc(t.nombre)}</button>`).join('')}</div></div>`}
    <div data-resto ${s || !opcional ? '' : 'hidden'}>
      <label class="campo"><span>Frecuencia</span><select name="frecuencia">${Object.entries(FRECUENCIAS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></label>
      <label class="campo" data-intervalo hidden><span>Cada cuántos días <em>*</em></span><input type="number" name="intervalo_dias" min="1" max="365" inputmode="numeric" value="${s?.intervalo_dias || ''}"></label>
      <div class="campo" data-dias hidden><span>Días del mes</span><div class="fila"><input type="number" name="dia1" min="1" max="31" style="width:90px" inputmode="numeric"><span data-y>y</span><input type="number" name="dia2" min="1" max="31" style="width:90px" inputmode="numeric"></div>
        <small>Vacío = se calculan a partir de la fecha de inicio.</small></div>
      <label class="campo"><span data-lbl-inicio>${s ? 'Fecha de inicio del servicio' : 'Primera visita'} <em>*</em></span><input type="date" name="fecha_inicio" value="${s?.fecha_inicio || hoy}"></label>
      <label class="campo"><span>Horario</span><input type="time" name="horario" value="${s?.horario || ''}"><small>Opcional</small></label>
      <label class="campo" data-bloques hidden><span>Bloques estimados por visita</span><input type="number" name="bloques_estimados" min="0.5" step="0.5" value="${s?.bloques_estimados || 1}"></label>
      <label class="campo"><span>Precio personalizado</span><input type="number" name="precio_personalizado" min="0" step="500" inputmode="numeric" value="${s?.precio_personalizado ?? ''}" placeholder="">
        <small data-tarifa></small></label>
      <div class="campo"><span>Jardinero de este servicio</span>${chipsJardineros(s?.jardinero_id ? [s.jardinero_id] : [], { nombre: 'jsrv' })}
        <small>Opcional: si no elegís, se usa el habitual del cliente.</small></div>
      <label class="campo"><span>Observaciones del servicio</span><input type="text" name="obs_srv" value="${esc(s?.observaciones || '')}"></label>
    </div>`;
  const $ = q => cont.querySelector(q);
  const leerJ = conectarChips({ $: q => cont.querySelector(q) }, 'jsrv', { unico: true });
  const frec = $('[name=frecuencia]');
  if (s) { frec.value = s.frecuencia; if (s.dias_mes) { $('[name=dia1]').value = s.dias_mes[0] || ''; $('[name=dia2]').value = s.dias_mes[1] || ''; } }

  const actualizar = () => {
    const f = frec.value;
    $('[data-intervalo]').hidden = f !== 'personalizada';
    $('[data-dias]').hidden = !(f === 'mensual' || f === 'dos_por_mes');
    $('[name=dia2]').hidden = $('[data-y]').hidden = f !== 'dos_por_mes';
    if (!tipoSel) return;
    $('[data-bloques]').hidden = tipoSel.modo_cobro !== 'por_bloque';
    const prop = getProp();
    const tar = tipoSel.usa_tipo_propiedad ? tipoSel.tarifas[prop] : tipoSel.tarifas.unica;
    const unidad = tipoSel.modo_cobro === 'abono_mensual' ? ' por mes' : tipoSel.modo_cobro === 'por_bloque' ? ` por bloque de ${tipoSel.minutos_bloque} min` : ' por visita';
    $('[name=precio_personalizado]').placeholder = tar != null ? `Tarifa general: ${pesos(tar)}` : '';
    $('[data-tarifa]').textContent = `Vacío = tarifa general (${tar != null ? pesos(tar) : 'sin tarifa'}${unidad}${tipoSel.usa_tipo_propiedad ? `, propiedad ${prop === 'esquina' ? 'esquina' : 'común'}` : ''}). El precio personalizado prevalece.`;
  };
  frec.onchange = actualizar;
  if (!s) {
    $('[data-tipo]').onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      cont.querySelectorAll('[data-tipo] .chip').forEach(x => x.classList.toggle('on', x === b));
      tipoSel = ts.find(t => t.id === b.dataset.v) || null;
      $('[data-resto]').hidden = !tipoSel;
      if (tipoSel) frec.value = tipoSel.frecuencia_default || 'puntual';
      actualizar();
    };
  }
  actualizar();

  return () => {
    if (!tipoSel) return opcional ? null : (toast('Elegí el servicio', { error: true }), false);
    const f = frec.value;
    const v = n => $(`[name=${n}]`).value;
    if (!v('fecha_inicio')) { $('[name=fecha_inicio]').classList.add('error-campo'); toast('La fecha de inicio es obligatoria', { error: true }); return false; }
    if (f === 'personalizada' && !(Number(v('intervalo_dias')) >= 1)) { $('[name=intervalo_dias]').classList.add('error-campo'); toast('Indicá cada cuántos días', { error: true }); return false; }
    const dias = [v('dia1'), f === 'dos_por_mes' ? v('dia2') : ''].filter(Boolean).map(Number);
    if (dias.some(d => d < 1 || d > 31)) { toast('Los días del mes van de 1 a 31', { error: true }); return false; }
    return {
      tipo_servicio_id: tipoSel.id, frecuencia: f, intervalo_dias: f === 'personalizada' ? Number(v('intervalo_dias')) : null,
      dias_mes: dias.length ? dias : null, fecha_inicio: v('fecha_inicio'), horario: v('horario') || null,
      bloques_estimados: tipoSel.modo_cobro === 'por_bloque' ? Number(v('bloques_estimados')) || 1 : null,
      precio_personalizado: v('precio_personalizado') === '' ? null : Number(v('precio_personalizado')),
      jardinero_id: leerJ()[0] || null, observaciones: v('obs_srv') || null
    };
  };
}

function formServicio(c, s) {
  const hoy = hoyISO();
  abrirHoja({
    titulo: s ? 'Editar servicio' : 'Agregar servicio',
    cuerpo: `<div data-campos></div>
      ${s ? `<div class="tarjeta" style="margin-bottom:12px">
          <label class="campo"><span>Los cambios de programación rigen desde</span><input type="date" name="desde" value="${s.proxima && s.proxima > hoy ? s.proxima : hoy}">
          <small>Las visitas futuras que nadie tocó se rehacen con la nueva programación. Las ya asignadas a mano, con notas o modificadas se conservan.</small></label>
        </div>
        <div class="campo"><span>Estado del servicio</span><div class="seg" data-est>${[['activo', 'Activo'], ['pausado', 'Pausado'], ['baja', 'Baja']].map(([k, n]) => `<button type="button" data-v="${k}" class="${s.estado === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>` : ''}`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>Guardar</button>`,
    alAbrir: h => {
      const leer = camposServicio(h.$('[data-campos]'), s, () => c.tipo_propiedad, false);
      let est = s?.estado || 'activo';
      h.$('[data-est]')?.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; est = b.dataset.v; h.$$('[data-est] button').forEach(x => x.classList.toggle('on', x === b)); });
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const datos = leer(); if (!datos) return;
        if (s && est !== s.estado && est !== 'activo' &&
            !await confirmar(`¿${est === 'baja' ? 'Dar de baja' : 'Pausar'} este servicio? Se quitan sus visitas futuras (el historial queda).`, { ok: 'Sí' })) return;
        try {
          const r = await hacer(() => rpc('guardar_servicio', { p: { ...datos, id: s?.id || null, cliente_id: c.id, estado: est, desde: h.$('[name=desde]')?.value || null } }),
            { ok: r => s ? `Servicio guardado${r.generados != null ? ` · ${r.generados} visitas reprogramadas${r.conservados ? `, ${r.conservados} se mantuvieron` : ''}` : ''}` : `Servicio agregado · ${r.generados} visita(s) programada(s)` });
          h.cerrar();
        } catch {}
      };
    }
  });
}

// ================= REGISTRAR TRABAJO (puntual / adicional) =================
function registrarTrabajo(c) {
  const ts = tipos();
  const hoy = hoyISO();
  abrirHoja({
    titulo: 'Registrar trabajo',
    cuerpo: `<p class="mut" style="margin-top:0">${esc(c.nombre)}</p>
      <div class="campo"><span>Servicio <em>*</em></span><div class="chips" data-chips="tipo">${ts.map(t => `<button type="button" class="chip" data-v="${t.id}">${esc(t.nombre)}</button>`).join('')}</div></div>
      <div class="campo"><span>¿Ya está hecho?</span>
        <label class="radio-tarj"><input type="radio" name="hecho" value="1" checked><span><b>Sí, ya se hizo</b> (queda como realizado)</span></label>
        <label class="radio-tarj"><input type="radio" name="hecho" value="0"><span><b>No, programarlo</b></span></label></div>
      <label class="campo"><span>Fecha <em>*</em></span><input type="date" name="fecha" value="${hoy}"></label>
      <label class="campo"><span>Horario</span><input type="time" name="horario"></label>
      <label class="campo" data-bloques hidden><span>Bloques (1 bloque = 1 h 30 min)</span><input type="number" name="bloques" min="0.5" step="0.5" value="1"></label>
      <label class="campo"><span>Precio</span><input type="number" name="precio" min="0" step="500" inputmode="numeric"><small data-tarifa>Vacío = tarifa vigente</small></label>
      <div class="campo"><span>Jardineros</span>${chipsJardineros(c.jardinero_habitual_id ? [c.jardinero_habitual_id] : [])}</div>
      <label class="campo"><span>Observaciones</span><input type="text" name="obs"></label>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>Guardar</button>`,
    alAbrir: h => {
      const leerT = conectarChips(h, 'tipo', { unico: true });
      const leerJ = conectarChips(h, 'jard');
      const act = () => {
        const t = ts.find(x => x.id === leerT()[0]);
        h.$('[data-bloques]').hidden = t?.modo_cobro !== 'por_bloque';
        const srv = t && c.servicios.find(s => s.tipo_servicio_id === t.id && s.estado === 'activo');
        const tar = srv ? srv.precio_vigente : t ? (t.usa_tipo_propiedad ? t.tarifas[c.tipo_propiedad] : t.tarifas.unica) : null;
        h.$('[data-tarifa]').textContent = t ? (t.modo_cobro === 'abono_mensual' && !h.$('[name=precio]').value
          ? 'Vacío = incluido en el abono (sin costo extra). Poné un precio si es un trabajo adicional.'
          : `Vacío = ${pesos(tar || 0)}${t.modo_cobro === 'por_bloque' ? ' por bloque' : ''}`) : 'Vacío = tarifa vigente';
      };
      h.$('[data-chips=tipo]').addEventListener('click', () => setTimeout(act));
      h.$('[name=fecha]').max = '';
      h.$$('input[name=hecho]').forEach(r => r.onchange = () => { if (r.value === '1' && h.$('[name=fecha]').value > hoy) h.$('[name=fecha]').value = hoy; });
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const tipo = leerT()[0];
        if (!tipo) return toast('Elegí el servicio', { error: true });
        const fecha = exigir(h, '[name=fecha]', 'La fecha es obligatoria'); if (!fecha) return;
        const hecho = h.$('input[name=hecho]:checked').value === '1';
        if (hecho && fecha > hoy) return toast('Un trabajo hecho no puede tener fecha futura', { error: true });
        try {
          await hacer(() => rpc('crear_trabajo', { p: {
            cliente_id: c.id, tipo_servicio_id: tipo, fecha, horario: h.$('[name=horario]').value || null,
            bloques: h.$('[name=bloques]').value || null, precio: h.$('[name=precio]').value, jardineros: leerJ(),
            observaciones: h.$('[name=obs]').value || null, realizado: hecho
          } }), { ok: hecho ? 'Trabajo registrado como realizado' : 'Trabajo programado' });
          h.cerrar();
        } catch {}
      };
    }
  });
}
