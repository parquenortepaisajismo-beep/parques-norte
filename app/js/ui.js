// Componentes compartidos: hojas (modales), avisos, tarjeta de trabajo y sus acciones.
import { rpc } from './db.js';
import {
  esc, pesos, ddmm, ddmmaa, diaLargo, relativo, hoyISO, sumarDias, linkWhatsApp, linkMaps, linkTel,
  ESTADOS, ICONOS, METODOS, textoFrecuencia
} from './util.js';

// ---------- estado compartido ----------
export const estado = { config: null, refrescar: () => {} };
export async function cargarConfig() { estado.config = await rpc('api_config'); return estado.config; }
export const jardineros = (soloActivos = true) => (estado.config?.jardineros || []).filter(j => !soloActivos || j.activo);
export const tipos = (soloActivos = true) => (estado.config?.tipos_servicio || []).filter(t => !soloActivos || t.activo);
export const cfg = (clave, def) => estado.config?.config?.[clave] ?? def;

// ---------- avisos ----------
let toastTimer;
export function toast(msg, { deshacer, error = false, ms = 5000 } = {}) {
  const el = document.getElementById('toast');
  el.className = 'toast' + (error ? ' error' : '');
  el.innerHTML = `<span>${esc(msg)}</span>` + (deshacer ? '<button type="button">DESHACER</button>' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  if (deshacer) el.querySelector('button').onclick = async () => { el.hidden = true; await deshacer(); };
  toastTimer = setTimeout(() => { el.hidden = true; }, error ? 7000 : ms);
}
export const mostrarError = e => toast(e?.message || String(e), { error: true });

// Ejecuta una acción con manejo de error y refresco.
export async function hacer(fn, { ok, deshacer, refrescar = true } = {}) {
  try {
    const r = await fn();
    if (ok) toast(typeof ok === 'function' ? ok(r) : ok, { deshacer });
    if (refrescar) await estado.refrescar();
    return r;
  } catch (e) { mostrarError(e); throw e; }
}

// ---------- hojas ----------
export function abrirHoja({ titulo, cuerpo = '', pie = '', alAbrir, ancha = false }) {
  const capas = document.getElementById('capas');
  const velo = document.createElement('div');
  velo.className = 'velo';
  velo.innerHTML = `<div class="hoja" role="dialog" aria-modal="true" aria-label="${esc(titulo)}" ${ancha ? 'style="max-width:900px"' : ''}>
      <div class="agarre"></div>
      <div class="hoja-cab"><h3>${esc(titulo)}</h3><button class="cerrar" type="button" aria-label="Cerrar">×</button></div>
      <div class="hoja-cuerpo">${cuerpo}</div>
      ${pie ? `<div class="hoja-pie">${pie}</div>` : ''}
    </div>`;
  capas.appendChild(velo);
  document.body.style.overflow = 'hidden';
  const hoja = velo.querySelector('.hoja');
  let cerrada = false;
  const cerrar = () => {
    if (cerrada) return; cerrada = true;
    velo.remove();
    if (!capas.children.length) document.body.style.overflow = '';
    document.removeEventListener('keydown', esc_);
  };
  const esc_ = e => { if (e.key === 'Escape' && capas.lastElementChild === velo) cerrar(); };
  document.addEventListener('keydown', esc_);
  velo.addEventListener('click', e => { if (e.target === velo) cerrar(); });
  velo.querySelector('.cerrar').onclick = cerrar;
  const h = { el: hoja, cerrar, $: s => hoja.querySelector(s), $$: s => [...hoja.querySelectorAll(s)] };
  alAbrir?.(h);
  setTimeout(() => hoja.querySelector('[autofocus]')?.focus(), 50);
  return h;
}

export function confirmar(mensaje, { titulo = 'Confirmar', ok = 'Sí, confirmar', peligro = false } = {}) {
  return new Promise(res => {
    let r = false;
    const h = abrirHoja({
      titulo, cuerpo: `<p style="font-size:17px">${mensaje}</p>`,
      pie: `<button class="btn" data-no>Volver</button><button class="btn ${peligro ? 'peligro' : 'prim'}" data-si>${esc(ok)}</button>`
    });
    h.$('[data-no]').onclick = () => h.cerrar();
    h.$('[data-si]').onclick = () => { r = true; h.cerrar(); };
    new MutationObserver((_, o) => { if (!h.el.isConnected) { o.disconnect(); res(r); } }).observe(document.getElementById('capas'), { childList: true });
  });
}

// Marca un campo con error (validación en el frontend; la base vuelve a validar).
export function exigir(h, sel, msg) {
  const el = h.$(sel);
  const v = (el.value || '').trim();
  h.$$('.msg-error').forEach(m => m.remove());
  el.classList.toggle('error-campo', !v);
  if (!v) {
    el.insertAdjacentHTML('afterend', `<div class="msg-error">${esc(msg)}</div>`);
    el.focus();
    return null;
  }
  return v;
}

// ---------- chips ----------
export function chipsJardineros(sel = [], { soloActivos = true, chico = false, nombre = 'jard' } = {}) {
  const ids = new Set(sel);
  const lista = (estado.config?.jardineros || []).filter(j => j.activo || (!soloActivos) || ids.has(j.id));
  return `<div class="chips" data-chips="${nombre}">${lista.map(j =>
    `<button type="button" class="chip${chico ? ' chico' : ''}${ids.has(j.id) ? ' on' : ''}" data-jid="${j.id}" style="--c:${esc(j.color)}" aria-pressed="${ids.has(j.id)}">
       <span class="punto"></span>${esc(j.nombre)}</button>`).join('')}</div>`;
}
export function conectarChips(h, nombre = 'jard', { unico = false } = {}) {
  const cont = h.$(`[data-chips="${nombre}"]`);
  cont.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (unico) cont.querySelectorAll('.chip.on').forEach(x => { if (x !== b) { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); } });
    b.classList.toggle('on'); b.setAttribute('aria-pressed', b.classList.contains('on'));
  });
  return () => [...cont.querySelectorAll('.chip.on')].map(b => b.dataset.jid || b.dataset.v);
}
export function chipsTexto(opciones, nombre) {
  return `<div class="chips" data-chips="${nombre}">${opciones.map(o => `<button type="button" class="chip chico" data-v="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
}

// ---------- tarjeta de trabajo ----------
export const cacheTrabajos = new Map();

export function badgeEstado(t) {
  if (t.atrasado) return `<span class="badge e-atrasado">Atrasado</span>`;
  if (t.estado === 'pendiente' && !t.jardineros?.length) return `<span class="badge e-pendiente">Sin asignar</span>`;
  return `<span class="badge e-${t.estado}">${ESTADOS[t.estado]}</span>`;
}

function textoPrecio(t) {
  if (t.modo_cobro === 'abono_mensual' && !(t.precio > 0)) return 'Incluido en abono';
  let s = pesos(t.precio);
  if (t.modo_cobro === 'por_bloque' && t.bloques) s += ` · ${Number(t.bloques)} bloque${t.bloques == 1 ? '' : 's'}`;
  return s;
}

export function tarjetaTrabajo(t, { compacto = false, conFecha = false } = {}) {
  cacheTrabajos.set(t.id, t);
  const abierto = t.estado === 'pendiente' || t.estado === 'asignado';
  const c = t.cliente;
  const wa = linkWhatsApp(c.whatsapp);
  const maps = linkMaps(c);
  const asignados = new Set(t.jardineros.map(j => j.id));
  let jard = '';
  if (abierto) {
    jard = `<div class="jard">${chipsJardineros([...asignados], { chico: true })}</div>`;
  } else if (t.jardineros.length) {
    jard = `<div class="meta"><span>${t.estado === 'realizado' ? 'Hecho por' : 'Asignado'}: <b>${t.jardineros.map(j => esc(j.nombre)).join(', ')}</b></span></div>`;
  }
  let motivo = '';
  if (t.estado === 'reprogramado') motivo = `<div class="motivo">→ pasó al <b>${ddmm(t.reprogramado_a)}</b> · ${esc(t.motivo_reprogramacion)}</div>`;
  if (t.estado === 'cancelado') motivo = `<div class="motivo">Motivo: ${esc(t.motivo_cancelacion)}</div>`;
  if (t.fecha_original && abierto) motivo = `<div class="motivo">Reprogramado (era el ${ddmm(t.fecha_original)})</div>`;
  const cobro = t.cobro && !t.cobro.abono && t.estado === 'realizado'
    ? (Number(t.cobro.saldo) > 0 ? `<span class="badge e-pendiente">A cobrar</span>` : `<span class="badge e-realizado">Cobrado</span>`) : '';

  return `<article class="trabajo est-${t.estado}${compacto ? ' compacto' : ''}" data-id="${t.id}">
    <div class="cab">
      ${abierto || t.estado === 'realizado' ? `<button class="check" data-acc="${abierto ? 'realizado' : 'deshacer'}" aria-label="${abierto ? 'Marcar realizado' : 'Desmarcar realizado'}">${ICONOS.ok}</button>` : ''}
      <div class="titulo" data-acc="detalle">
        <div class="entre"><span class="cliente">${esc(c.nombre)}</span>${badgeEstado(t)}</div>
        ${c.direccion ? `<div class="dir">${esc(c.direccion)}</div>` : ''}
        <div class="meta">
          ${conFecha ? `<span><b>${ddmm(t.fecha)}</b></span>` : ''}
          ${t.horario ? `<span>${ICONOS.reloj.replace('class="ico"', 'class="ico" style="width:15px;height:15px;vertical-align:-2px"')} <b>${t.horario}</b></span>` : ''}
          <span><b>${esc(t.servicio.nombre)}</b></span>
          <span>${textoPrecio(t)}</span> ${cobro}
        </div>
      </div>
    </div>
    ${jard}${motivo}
    ${c.observaciones && abierto && !compacto ? `<div class="nota">${esc(c.observaciones)}</div>` : ''}
    ${t.observaciones && !compacto ? `<div class="nota">📝 ${esc(t.observaciones)}</div>` : ''}
    ${abierto ? `<div class="acciones">
      <button class="btn ok" data-acc="realizado">${ICONOS.ok}Hecho</button>
      <button class="btn" data-acc="reprogramar">${ICONOS.rep}Reprog.</button>
      <button class="btn" data-acc="cancelar">${ICONOS.x}Cancelar</button>
      ${maps ? `<a class="btn" href="${esc(maps)}" target="_blank" rel="noopener">${ICONOS.mapa}Maps</a>` : '<span></span>'}
      ${wa ? `<a class="btn" href="${esc(wa)}" target="_blank" rel="noopener">${ICONOS.wa}WhatsApp</a>` : '<span></span>'}
    </div>` : ''}
  </article>`;
}

// Delegación de eventos para todas las tarjetas de un contenedor.
export function conectarTrabajos(cont) {
  cont.addEventListener('click', async e => {
    const art = e.target.closest('.trabajo[data-id]'); if (!art) return;
    const t = cacheTrabajos.get(art.dataset.id); if (!t) return;
    const chip = e.target.closest('.chip[data-jid]');
    if (chip) { e.preventDefault(); return toggleJardinero(t, chip.dataset.jid); }
    const acc = e.target.closest('[data-acc]')?.dataset.acc; if (!acc) return;
    if (acc === 'realizado') return accionRealizado(t);
    if (acc === 'deshacer') return accionDeshacer(t);
    if (acc === 'reprogramar') return accionReprogramar(t);
    if (acc === 'cancelar') return accionCancelar(t);
    if (acc === 'detalle') return abrirDetalle(t.id);
  });
}

// ---------- acciones ----------
export async function toggleJardinero(t, jid) {
  const ids = new Set(t.jardineros.map(j => j.id));
  ids.has(jid) ? ids.delete(jid) : ids.add(jid);
  const nombre = jardineros(false).find(j => j.id === jid)?.nombre;
  await hacer(() => rpc('asignar_jardineros', { p_trabajo: t.id, p_jardineros: [...ids] }),
    { ok: `${nombre} ${ids.has(jid) ? 'asignado a' : 'quitado de'} ${t.cliente.nombre}` }).catch(() => {});
}

export async function accionRealizado(t) {
  const hoy = hoyISO();
  const necesitaHoja = t.modo_cobro === 'por_bloque' || !t.jardineros.length || t.fecha < hoy;
  const marcar = async (args) => hacer(() => rpc('marcar_realizado', { p_trabajo: t.id, ...args }), {
    ok: `✓ ${t.cliente.nombre}: realizado`,
    deshacer: () => hacer(() => rpc('deshacer_realizado', { p_trabajo: t.id }), { ok: 'Se desmarcó' }).catch(() => {})
  }).catch(() => {});
  if (!necesitaHoja) return marcar({});

  const h = abrirHoja({
    titulo: 'Marcar realizado',
    cuerpo: `<p class="mut" style="margin-top:0"><b>${esc(t.cliente.nombre)}</b> · ${esc(t.servicio.nombre)}</p>
      <div class="campo"><span>¿Quién lo hizo?</span>${chipsJardineros(t.jardineros.map(j => j.id))}
        <small>Podés dejarlo sin marcar y asignarlo después.</small></div>
      ${t.modo_cobro === 'por_bloque' ? `<label class="campo"><span>Bloques de ${t.servicio.minutos_bloque || 90} min</span>
        <div class="fila"><button type="button" class="btn" data-menos>−</button>
        <input type="number" min="0.5" step="0.5" value="${Number(t.bloques || 1)}" data-bloques style="width:110px;text-align:center;font-weight:700">
        <button type="button" class="btn" data-mas>+</button></div>
        <small data-calc></small></label>` : ''}
      ${t.fecha < hoy ? `<div class="campo"><span>¿Cuándo se hizo?</span>
        <label class="radio-tarj"><input type="radio" name="cuando" value="${t.fecha}" checked><span>El día programado (${ddmmaa(t.fecha)})</span></label>
        <label class="radio-tarj"><input type="radio" name="cuando" value="${hoy}"><span>Hoy</span></label></div>` : ''}`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>${ICONOS.ok} Realizado</button>`,
    alAbrir: h => {
      const leer = conectarChips(h);
      const inp = h.$('[data-bloques]');
      const calc = () => { if (inp) h.$('[data-calc]').textContent = `Total: ${pesos((t.precio_unitario || 0) * (Number(inp.value) || 0))}`; };
      if (inp) {
        h.$('[data-menos]').onclick = () => { inp.value = Math.max(0.5, Number(inp.value) - 0.5); calc(); };
        h.$('[data-mas]').onclick = () => { inp.value = Number(inp.value) + 0.5; calc(); };
        inp.oninput = calc; calc();
      }
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const bloques = inp ? Number(inp.value) : undefined;
        if (inp && !(bloques > 0)) { inp.classList.add('error-campo'); return; }
        h.cerrar();
        await marcar({ p_jardineros: leer(), p_bloques: bloques, p_fecha: h.$('input[name=cuando]:checked')?.value });
      };
    }
  });
}

export async function accionDeshacer(t) {
  if (!await confirmar(`¿Desmarcar "realizado" en <b>${esc(t.cliente.nombre)}</b>? Queda registrado en el historial.`, { ok: 'Desmarcar' })) return;
  await hacer(() => rpc('deshacer_realizado', { p_trabajo: t.id }), { ok: 'Trabajo vuelve a pendiente' }).catch(() => {});
}

export function accionReprogramar(t, fechaSugerida = null) {
  const hoy = hoyISO();
  const base = t.fecha > hoy ? t.fecha : hoy;
  const rapidas = [['Mañana', sumarDias(hoy, 1)], ['Pasado', sumarDias(hoy, 2)], ['+1 semana', sumarDias(base, 7)]];
  const recurrente = !!t.servicio_cliente_id;
  abrirHoja({
    titulo: 'Reprogramar',
    cuerpo: `<p class="mut" style="margin-top:0"><b>${esc(t.cliente.nombre)}</b> · ${esc(t.servicio.nombre)} · era el <b>${ddmmaa(t.fecha)}</b></p>
      <div class="campo"><span>Motivo <em>*</em></span>${chipsTexto(cfg('motivos_reprogramacion', ['Lluvia']), 'motivo')}
        <input type="text" data-motivo placeholder="Escribí o elegí un motivo" style="margin-top:8px" maxlength="200"></div>
      <div class="campo"><span>Nueva fecha <em>*</em></span>
        <div class="chips" data-rapidas>${rapidas.map(([n, f]) => `<button type="button" class="chip chico" data-f="${f}">${n} · ${ddmm(f)}</button>`).join('')}</div>
        <input type="date" data-fecha value="${fechaSugerida || ''}" min="${sumarDias(hoy, -60)}" style="margin-top:8px"></div>
      <label class="campo"><span>Observaciones</span><textarea data-obs placeholder="Opcional" maxlength="500"></textarea></label>
      ${recurrente ? `<div class="campo"><span>¿Qué se modifica?</span>
        <label class="radio-tarj"><input type="radio" name="alcance" value="uno" checked><span><b>Solo este trabajo</b><br><small class="mut">Los próximos siguen en sus fechas.</small></span></label>
        <label class="radio-tarj"><input type="radio" name="alcance" value="sig"><span><b>Este y los siguientes</b><br><small class="mut">La programación del servicio se corre a partir de la nueva fecha.</small></span></label></div>` : ''}`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>${ICONOS.rep} Reprogramar</button>`,
    alAbrir: h => {
      h.$('[data-chips=motivo]').onclick = e => { const b = e.target.closest('.chip'); if (b) { h.$('[data-motivo]').value = b.dataset.v; h.$$('[data-chips=motivo] .chip').forEach(x => x.classList.toggle('on', x === b)); } };
      h.$('[data-rapidas]').onclick = e => { const b = e.target.closest('.chip'); if (b) { h.$('[data-fecha]').value = b.dataset.f; h.$$('[data-rapidas] .chip').forEach(x => x.classList.toggle('on', x === b)); } };
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const motivo = exigir(h, '[data-motivo]', 'El motivo es obligatorio'); if (!motivo) return;
        const fecha = exigir(h, '[data-fecha]', 'Elegí la nueva fecha'); if (!fecha) return;
        if (fecha === t.fecha) { exigir(h, '[data-fecha]', ''); h.$('[data-fecha]').classList.add('error-campo'); return toast('La nueva fecha es igual a la actual', { error: true }); }
        const sig = h.$('input[name=alcance]:checked')?.value === 'sig';
        h.$('[data-si]').disabled = true;
        try {
          const r = await hacer(() => rpc('reprogramar_trabajo', {
            p_trabajo: t.id, p_nueva_fecha: fecha, p_motivo: motivo, p_observaciones: h.$('[data-obs]').value || null, p_siguientes: sig
          }), { ok: r => `Reprogramado al ${ddmm(fecha)}` + (sig && r.conservados ? ` · ${r.conservados} trabajo(s) ya tocados se mantuvieron` : '') });
          h.cerrar();
          return r;
        } catch { h.$('[data-si]').disabled = false; }
      };
    }
  });
}

export function accionCancelar(t) {
  abrirHoja({
    titulo: 'Cancelar trabajo',
    cuerpo: `<p class="mut" style="margin-top:0"><b>${esc(t.cliente.nombre)}</b> · ${esc(t.servicio.nombre)} · ${ddmmaa(t.fecha)}</p>
      <div class="campo"><span>Motivo de cancelación <em>*</em></span>${chipsTexto(cfg('motivos_cancelacion', []), 'motivo')}
        <input type="text" data-motivo placeholder="Escribí o elegí un motivo" style="margin-top:8px" maxlength="200"></div>
      <label class="campo"><span>Observaciones</span><textarea data-obs placeholder="Opcional" maxlength="500"></textarea></label>
      <p class="muy-peq mut">El trabajo no se borra: queda en el historial como CANCELADO.</p>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn peligro" data-si>${ICONOS.x} Cancelar trabajo</button>`,
    alAbrir: h => {
      h.$('[data-chips=motivo]').onclick = e => { const b = e.target.closest('.chip'); if (b) { h.$('[data-motivo]').value = b.dataset.v; h.$$('[data-chips=motivo] .chip').forEach(x => x.classList.toggle('on', x === b)); } };
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const motivo = exigir(h, '[data-motivo]', 'El motivo es obligatorio'); if (!motivo) return;
        try {
          await hacer(() => rpc('cancelar_trabajo', { p_trabajo: t.id, p_motivo: motivo, p_observaciones: h.$('[data-obs]').value || null }),
            { ok: `${t.cliente.nombre}: cancelado` });
          h.cerrar();
        } catch {}
      };
    }
  });
}

// "Lluvia": reprograma todos los trabajos abiertos de un día.
export function accionReprogramarDia(fecha, cantidad) {
  const rapidas = [['Mañana', sumarDias(fecha, 1)], ['Pasado', sumarDias(fecha, 2)], ['+1 semana', sumarDias(fecha, 7)]];
  abrirHoja({
    titulo: 'Reprogramar todo el día',
    cuerpo: `<p style="margin-top:0">Se van a reprogramar los <b>${cantidad}</b> trabajos sin hacer del <b>${diaLargo(fecha)}</b>.</p>
      <div class="campo"><span>Motivo <em>*</em></span><input type="text" data-motivo value="Lluvia" maxlength="200"></div>
      <div class="campo"><span>Nueva fecha <em>*</em></span>
        <div class="chips" data-rapidas>${rapidas.map(([n, f]) => `<button type="button" class="chip chico" data-f="${f}">${n} · ${ddmm(f)}</button>`).join('')}</div>
        <input type="date" data-fecha style="margin-top:8px"></div>
      <label class="campo"><span>Observaciones</span><textarea data-obs placeholder="Opcional"></textarea></label>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>${ICONOS.lluvia} Reprogramar ${cantidad}</button>`,
    alAbrir: h => {
      h.$('[data-rapidas]').onclick = e => { const b = e.target.closest('.chip'); if (b) { h.$('[data-fecha]').value = b.dataset.f; h.$$('[data-rapidas] .chip').forEach(x => x.classList.toggle('on', x === b)); } };
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const motivo = exigir(h, '[data-motivo]', 'El motivo es obligatorio'); if (!motivo) return;
        const nueva = exigir(h, '[data-fecha]', 'Elegí la nueva fecha'); if (!nueva) return;
        try {
          await hacer(() => rpc('reprogramar_dia', { p_fecha: fecha, p_nueva_fecha: nueva, p_motivo: motivo, p_observaciones: h.$('[data-obs]').value || null }),
            { ok: r => `${r.reprogramados} trabajos pasados al ${ddmm(nueva)}` });
          h.cerrar();
        } catch {}
      };
    }
  });
}

// ---------- detalle de un trabajo ----------
const TXT_HIST = { creado: 'Creado', asignado: 'Asignación', realizado: 'Realizado', deshecho: 'Desmarcado', reprogramado: 'Reprogramado', cancelado: 'Cancelado', observacion: 'Observación', editado: 'Editado' };
const COLOR_HIST = { realizado: 'var(--e-realizado)', reprogramado: 'var(--e-reprogramado)', cancelado: 'var(--e-cancelado)', asignado: 'var(--e-asignado)', deshecho: 'var(--e-pendiente)' };

export async function abrirDetalle(id) {
  let t;
  try { t = await rpc('api_trabajo', { p_id: id }); } catch (e) { return mostrarError(e); }
  if (!t) return toast('No se encontró el trabajo', { error: true });
  cacheTrabajos.set(t.id, t);
  const c = t.cliente;
  const abierto = t.estado === 'pendiente' || t.estado === 'asignado';
  const wa = linkWhatsApp(c.whatsapp), maps = linkMaps(c), tel = linkTel(c.telefono);
  const hist = t.historial.map(h => `<li style="--c:${COLOR_HIST[h.tipo] || 'var(--verde-600)'}">
      <div class="cuando">${ddmmaa(h.creado.slice(0, 10))} ${h.creado.slice(11, 16)} · ${esc(h.usuario || '')}</div>
      <b>${TXT_HIST[h.tipo] || h.tipo}</b>
      ${h.tipo === 'reprogramado' ? ` del ${ddmm(h.fecha_anterior)} al <b>${ddmm(h.fecha_nueva)}</b>` : ''}
      ${h.motivo ? `<div>Motivo: ${esc(h.motivo)}</div>` : ''}
      ${h.detalle ? `<div class="mut peq">${esc(h.detalle)}</div>` : ''}</li>`).join('');
  const cobro = t.cobro;
  let cobroHtml = '';
  if (cobro) {
    cobroHtml = `<div class="tarjeta"><div class="entre"><b>${cobro.abono ? esc(cobro.concepto) : 'Cobro de este trabajo'}</b>
        ${Number(cobro.saldo) > 0 ? '<span class="badge e-pendiente">Pendiente</span>' : '<span class="badge e-realizado">Cobrado</span>'}</div>
      <div class="peq mut">Total ${pesos(cobro.monto)} · cobrado ${pesos(cobro.cobrado)}${Number(cobro.saldo) > 0 ? ` · falta <b>${pesos(cobro.saldo)}</b>` : ''}</div>
      ${Number(cobro.saldo) > 0 ? `<button class="btn prim bloque" style="margin-top:10px" data-cobrar>${ICONOS.plata} Registrar cobro</button>` : ''}</div>`;
  } else if (t.modo_cobro === 'abono_mensual') {
    cobroHtml = `<p class="peq mut">Incluido en el abono mensual del cliente.</p>`;
  } else if (abierto) {
    cobroHtml = `<p class="peq mut">Se podrá cobrar una vez realizado (${pesos(t.precio)}).</p>`;
  }

  abrirHoja({
    titulo: c.nombre,
    cuerpo: `
      <div class="fila" style="margin-bottom:8px">${badgeEstado(t)} <span class="mut">${esc(t.servicio.nombre)}</span></div>
      <div class="tarjeta">
        <div class="dato"><span>Fecha</span><span><b>${diaLargo(t.fecha)}</b> (${relativo(t.fecha)})</span></div>
        ${t.fecha_original ? `<div class="dato"><span>Fecha original</span><span>${ddmmaa(t.fecha_original)}</span></div>` : ''}
        ${t.estado === 'reprogramado' ? `<div class="dato"><span>Nueva fecha</span><span><b>${ddmmaa(t.reprogramado_a)}</b> · ${esc(t.motivo_reprogramacion)}</span></div>` : ''}
        ${t.estado === 'cancelado' ? `<div class="dato"><span>Motivo</span><span>${esc(t.motivo_cancelacion)}</span></div>` : ''}
        ${t.fecha_realizado ? `<div class="dato"><span>Realizado</span><span>${ddmmaa(t.fecha_realizado)}</span></div>` : ''}
        <div class="dato"><span>Horario</span><span>${abierto ? `<input type="time" data-horario value="${t.horario || ''}" style="max-width:150px;min-height:40px">` : (t.horario || '—')}</span></div>
        <div class="dato"><span>Precio</span><span>${t.modo_cobro === 'abono_mensual' && !(t.precio > 0) ? 'Incluido en abono' : `<b>${pesos(t.precio)}</b>${t.precio_manual ? ' <span class="muy-peq mut">(manual)</span>' : ''}`}
          ${abierto ? ` <button class="btn-texto" data-editar-precio>cambiar</button>` : ''}</span></div>
        ${t.modo_cobro === 'por_bloque' ? `<div class="dato"><span>Bloques</span><span>${Number(t.bloques || 1)} × ${pesos(t.precio_unitario)}</span></div>` : ''}
        ${c.direccion ? `<div class="dato"><span>Dirección</span><span>${esc(c.direccion)}</span></div>` : ''}
        ${c.observaciones ? `<div class="dato"><span>Del cliente</span><span>${esc(c.observaciones)}</span></div>` : ''}
        ${t.servicio_cliente ? `<div class="dato"><span>Frecuencia</span><span>${esc(textoFrecuencia(t.servicio_cliente))}</span></div>` : ''}
      </div>
      <h3>Jardineros</h3>
      ${t.estado === 'reprogramado' || t.estado === 'cancelado'
        ? `<p class="mut">${t.jardineros.map(j => esc(j.nombre)).join(', ') || 'Sin asignar'}</p>`
        : chipsJardineros(t.jardineros.map(j => j.id))}
      <div class="acciones-cliente" style="grid-template-columns:repeat(4,1fr)">
        ${tel ? `<a class="btn" href="${esc(tel)}">${ICONOS.tel}Llamar</a>` : '<span></span>'}
        ${wa ? `<a class="btn wa" href="${esc(wa)}" target="_blank" rel="noopener">${ICONOS.wa}WhatsApp</a>` : '<span></span>'}
        ${maps ? `<a class="btn" href="${esc(maps)}" target="_blank" rel="noopener">${ICONOS.mapa}Maps</a>` : '<span></span>'}
        <a class="btn" href="#/cliente/${c.id}" data-ir>${ICONOS.persona}Ver cliente</a>
      </div>
      ${abierto ? `<div class="grilla tres" style="grid-template-columns:repeat(3,1fr)">
        <button class="btn prim" data-acc2="realizado">${ICONOS.ok} Hecho</button>
        <button class="btn" data-acc2="reprogramar">${ICONOS.rep} Reprog.</button>
        <button class="btn borde-peligro" data-acc2="cancelar">${ICONOS.x} Cancelar</button></div>` : ''}
      ${t.estado === 'realizado' ? `<button class="btn bloque" data-acc2="deshacer">Desmarcar realizado</button>` : ''}
      ${t.estado === 'reprogramado' && t.reprogramado_id ? `<button class="btn bloque" data-ver="${t.reprogramado_id}">Ver el trabajo del ${ddmm(t.reprogramado_a)}</button>` : ''}
      ${t.origen_id ? `<button class="btn bloque" style="margin-top:8px" data-ver="${t.origen_id}">Ver el trabajo original</button>` : ''}
      <h3>Cobro</h3>${cobroHtml || '<p class="peq mut">Sin cargo.</p>'}
      <h3>Observaciones</h3>
      ${t.observaciones ? `<div class="nota" style="white-space:pre-line;font-size:15px;background:var(--tierra-100);padding:8px 10px;border-radius:8px;margin-bottom:8px">${esc(t.observaciones)}</div>` : ''}
      <div class="fila"><input type="text" data-obs placeholder="Agregar observación…" style="flex:1" maxlength="500"><button class="btn" data-add-obs>Agregar</button></div>
      <h3>Historial</h3><ul class="linea-tiempo">${hist}</ul>`,
    alAbrir: h => {
      const chips = h.$('[data-chips=jard]');
      if (chips) chips.onclick = async e => {
        const b = e.target.closest('.chip'); if (!b) return;
        await toggleJardinero(t, b.dataset.jid); h.cerrar(); abrirDetalle(t.id);
      };
      const acc = { realizado: accionRealizado, reprogramar: accionReprogramar, cancelar: accionCancelar, deshacer: accionDeshacer };
      h.$$('[data-acc2]').forEach(b => b.onclick = () => { h.cerrar(); acc[b.dataset.acc2](t); });
      h.$$('[data-ver]').forEach(b => b.onclick = () => { h.cerrar(); abrirDetalle(b.dataset.ver); });
      h.$('[data-ir]').onclick = () => h.cerrar();
      h.$('[data-add-obs]').onclick = async () => {
        const v = h.$('[data-obs]').value.trim(); if (!v) return h.$('[data-obs]').focus();
        try { await hacer(() => rpc('agregar_observacion', { p_trabajo: t.id, p_texto: v }), { ok: 'Observación agregada' }); h.cerrar(); abrirDetalle(t.id); } catch {}
      };
      const hor = h.$('[data-horario]');
      if (hor) hor.onchange = () => hacer(() => rpc('editar_trabajo', { p_trabajo: t.id, p: { horario: hor.value } }), { ok: 'Horario guardado' }).catch(() => {});
      const ep = h.$('[data-editar-precio]');
      if (ep) ep.onclick = () => editarPrecio(t, () => { h.cerrar(); abrirDetalle(t.id); });
      const cb = h.$('[data-cobrar]');
      if (cb) cb.onclick = () => abrirCobro([{ id: cobro.cargo_id, concepto: cobro.concepto || t.servicio.nombre, saldo: cobro.saldo }], c.nombre, () => { h.cerrar(); abrirDetalle(t.id); });
    }
  });
}

function editarPrecio(t, despues) {
  abrirHoja({
    titulo: 'Precio de este trabajo',
    cuerpo: `<label class="campo"><span>Precio ($)</span><input type="number" inputmode="numeric" min="0" step="500" data-precio value="${Number(t.precio)}" autofocus>
      <small>Cambia solo este trabajo. Para cambiar el precio de todos, editá el servicio del cliente o las tarifas.</small></label>
      ${t.precio_manual ? '<button class="btn bloque" data-tarifa>Volver a la tarifa</button>' : ''}`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>Guardar</button>`,
    alAbrir: h => {
      h.$('[data-no]').onclick = h.cerrar;
      const guardar = async precio => {
        try { await hacer(() => rpc('editar_trabajo', { p_trabajo: t.id, p: { precio } }), { ok: 'Precio actualizado' }); h.cerrar(); despues(); } catch {}
      };
      h.$('[data-si]').onclick = () => { const v = h.$('[data-precio]').value; if (v === '' || Number(v) < 0) return h.$('[data-precio]').classList.add('error-campo'); guardar(Number(v)); };
      h.$('[data-tarifa]')?.addEventListener('click', () => guardar(''));
    }
  });
}

// ---------- cobro ----------
export function abrirCobro(cargos, cliente, despues = () => {}) {
  const total = cargos.reduce((a, c) => a + Number(c.saldo), 0);
  const uno = cargos.length === 1;
  abrirHoja({
    titulo: 'Registrar cobro',
    cuerpo: `<p style="margin-top:0"><b>${esc(cliente)}</b></p>
      <div class="tarjeta" style="margin-bottom:14px">${cargos.map(c => `<div class="entre peq"><span>${esc(c.concepto)}${c.fecha ? ` · ${ddmm(c.fecha)}` : ''}</span><b class="monto">${pesos(c.saldo)}</b></div>`).join('')}
        ${!uno ? `<div class="entre" style="margin-top:6px;border-top:1px solid var(--linea);padding-top:6px"><b>Total</b><b class="monto">${pesos(total)}</b></div>` : ''}</div>
      <div class="campo"><span>Forma de pago <em>*</em></span>
        <div class="chips" data-chips="metodo">${Object.entries(METODOS).map(([k, v]) => `<button type="button" class="chip" data-v="${k}">${v}</button>`).join('')}</div></div>
      ${uno ? `<label class="campo"><span>Importe</span><input type="number" inputmode="numeric" min="1" max="${total}" value="${total}" data-monto><small>Si es un pago parcial, cambiá el importe.</small></label>` : ''}
      <label class="campo"><span>Fecha de cobro</span><input type="date" data-fecha value="${hoyISO()}"></label>
      <label class="campo"><span>Nota</span><input type="text" data-nota placeholder="Opcional"></label>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>${ICONOS.plata} Cobrado</button>`,
    alAbrir: h => {
      const metodo = conectarChips(h, 'metodo', { unico: true });
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const m = metodo()[0];
        if (!m) return toast('Elegí la forma de pago', { error: true });
        const monto = uno ? Number(h.$('[data-monto]').value) : null;
        if (uno && !(monto > 0 && monto <= total)) return h.$('[data-monto]').classList.add('error-campo');
        try {
          await hacer(() => rpc('registrar_pago', { p_cargos: cargos.map(c => c.id), p_metodo: m, p_fecha: h.$('[data-fecha]').value || null, p_monto: monto, p_nota: h.$('[data-nota]').value || null }),
            { ok: r => `Cobro de ${pesos(r.monto)} registrado` });
          h.cerrar(); despues();
        } catch {}
      };
    }
  });
}

// Lista de trabajos agrupada por día.
export function listaPorDia(trabajos, desde, hasta, { vacios = true, compacto = false } = {}) {
  const porDia = {};
  trabajos.forEach(t => (porDia[t.fecha] ||= []).push(t));
  const hoy = hoyISO();
  let html = '';
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const l = porDia[d] || [];
    if (!l.length && !vacios) continue;
    const abiertos = l.filter(t => t.estado === 'pendiente' || t.estado === 'asignado').length;
    html += `<div class="dia-cab${d === hoy ? ' hoy' : ''}"><span>${d === hoy ? 'HOY · ' : ''}${diaLargo(d)}</span><small>${l.length ? `${l.filter(t => t.estado !== 'reprogramado').length} trabajo(s)${abiertos ? ` · ${abiertos} por hacer` : ''}` : ''}</small></div>`;
    html += l.length ? l.map(t => tarjetaTrabajo(t, { compacto })).join('') : `<div class="vacio peq" style="padding:12px">Sin trabajos</div>`;
  }
  return html;
}
