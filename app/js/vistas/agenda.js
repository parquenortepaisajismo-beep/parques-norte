// Agenda: lista semanal (principal) + calendario Día / Semana / Mes, con filtros.
import { rpc } from '../db.js';
import {
  esc, hoyISO, lunesDe, sumarDias, inicioMes, finMes, sumarMeses, diaLargo, ddmm, mesAnio, DIAS_SEMANA_C, ESTADOS, ICONOS, aFecha, may
} from '../util.js';
import { tarjetaTrabajo, conectarTrabajos, listaPorDia, jardineros, tipos, accionReprogramar, abrirDetalle, cacheTrabajos } from '../ui.js';

// estado de la vista (se conserva al volver)
const st = { vista: 'lista', fecha: hoyISO(), filtros: {}, verFiltros: false };
try { Object.assign(st, JSON.parse(sessionStorage.getItem('pn-agenda') || '{}')); } catch {}
const guardar = () => { try { sessionStorage.setItem('pn-agenda', JSON.stringify({ vista: st.vista, filtros: st.filtros })); } catch {} };

function rango() {
  if (st.vista === 'dia') return [st.fecha, st.fecha];
  if (st.vista === 'mes') return [lunesDe(inicioMes(st.fecha)), sumarDias(lunesDe(finMes(st.fecha)), 6)];
  const l = lunesDe(st.fecha); return [l, sumarDias(l, 6)];
}
function titulo() {
  if (st.vista === 'dia') return may(diaLargo(st.fecha));
  if (st.vista === 'mes') return may(mesAnio(st.fecha));
  const l = lunesDe(st.fecha); return `${ddmm(l)} al ${ddmm(sumarDias(l, 6))}`;
}
function mover(n) {
  if (st.vista === 'dia') st.fecha = sumarDias(st.fecha, n);
  else if (st.vista === 'mes') st.fecha = sumarMeses(st.fecha, n);
  else st.fecha = sumarDias(st.fecha, 7 * n);
}

export async function render(v, params) {
  if (params.get('jardinero')) { st.filtros = { jardinero_id: params.get('jardinero') }; st.verFiltros = true; history.replaceState(null, '', '#/agenda'); }
  if (params.get('fecha')) { st.fecha = params.get('fecha'); st.vista = 'dia'; history.replaceState(null, '', '#/agenda'); }
  const [desde, hasta] = rango();
  const f = Object.fromEntries(Object.entries(st.filtros).filter(([, x]) => x));
  const trabajos = await rpc('api_trabajos', { p_desde: desde, p_hasta: hasta, p_filtros: f });
  const nFiltros = Object.keys(f).length;

  v.innerHTML = `
    <div class="seg" role="tablist">
      ${[['lista', 'Semana (lista)'], ['dia', 'Día'], ['semana', 'Semana'], ['mes', 'Mes']].map(([k, n]) =>
        `<button role="tab" data-vista="${k}" class="${st.vista === k ? 'on' : ''}" aria-selected="${st.vista === k}">${n}</button>`).join('')}
    </div>
    <div class="cal-nav">
      <button class="btn" data-mov="-1" aria-label="Anterior">${ICONOS.izq}</button>
      <div class="tit">${titulo()}</div>
      <button class="btn" data-mov="1" aria-label="Siguiente">${ICONOS.der}</button>
    </div>
    <div class="fila" style="margin-bottom:8px">
      <button class="btn chico" data-hoy>Hoy</button>
      <button class="btn chico" data-filtros>${ICONOS.filtro} Filtros${nFiltros ? ` (${nFiltros})` : ''}</button>
      ${nFiltros ? '<button class="btn-texto" data-limpiar>Quitar filtros</button>' : ''}
      <span class="mut peq" style="margin-left:auto">${trabajos.filter(t => t.estado !== 'reprogramado').length} trabajos</span>
    </div>
    <div class="filtros" ${st.verFiltros ? '' : 'hidden'}>
      <div class="grilla">
        <label class="campo" style="margin:0"><span class="peq">Jardinero</span><select data-f="jardinero_id"><option value="">Todos</option>
          ${jardineros(false).map(j => `<option value="${j.id}" ${f.jardinero_id === j.id ? 'selected' : ''}>${esc(j.nombre)}${j.activo ? '' : ' (inactivo)'}</option>`).join('')}</select></label>
        <label class="campo" style="margin:0"><span class="peq">Estado</span><select data-f="estado"><option value="">Todos</option>
          <option value="abiertos" ${f.estado === 'abiertos' ? 'selected' : ''}>Por hacer</option>
          <option value="sin_asignar" ${f.estado === 'sin_asignar' ? 'selected' : ''}>Sin asignar</option>
          ${Object.entries(ESTADOS).map(([k, n]) => `<option value="${k}" ${f.estado === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="campo" style="margin:0"><span class="peq">Servicio</span><select data-f="tipo_servicio_id"><option value="">Todos</option>
          ${tipos(false).map(t => `<option value="${t.id}" ${f.tipo_servicio_id === t.id ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('')}</select></label>
        <label class="campo" style="margin:0"><span class="peq">Cliente</span><input type="search" data-f="buscar" value="${esc(f.buscar || '')}" placeholder="Nombre o dirección"></label>
      </div>
    </div>
    <div id="cuerpo"></div>`;

  const cuerpo = v.querySelector('#cuerpo');
  if (st.vista === 'lista') {
    cuerpo.innerHTML = listaPorDia(trabajos, desde, hasta);
    conectarTrabajos(cuerpo);
  } else if (st.vista === 'dia') {
    cuerpo.innerHTML = trabajos.length ? trabajos.map(t => tarjetaTrabajo(t)).join('') : '<div class="vacio">Sin trabajos este día</div>';
    conectarTrabajos(cuerpo);
  } else if (st.vista === 'semana') {
    cuerpo.innerHTML = leyenda() + semana(trabajos, desde) + '<p class="muy-peq mut">Tocá un trabajo para abrirlo. En computadora podés arrastrarlo a otro día (pide el motivo).</p>';
    conectarCalendario(cuerpo, trabajos);
  } else {
    cuerpo.innerHTML = leyenda() + mes(trabajos, desde, hasta) + `<div id="dia-sel"></div>`;
    conectarCalendario(cuerpo, trabajos);
    mostrarDia(cuerpo, trabajos);
  }

  v.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => { st.vista = b.dataset.vista; guardar(); render(v, new URLSearchParams()); });
  v.querySelectorAll('[data-mov]').forEach(b => b.onclick = () => { mover(Number(b.dataset.mov)); render(v, new URLSearchParams()); });
  v.querySelector('[data-hoy]').onclick = () => { st.fecha = hoyISO(); render(v, new URLSearchParams()); };
  v.querySelector('[data-filtros]').onclick = () => { st.verFiltros = !st.verFiltros; v.querySelector('.filtros').hidden = !st.verFiltros; };
  v.querySelector('[data-limpiar]')?.addEventListener('click', () => { st.filtros = {}; guardar(); render(v, new URLSearchParams()); });
  let tBuscar;
  v.querySelectorAll('[data-f]').forEach(el => el[el.tagName === 'INPUT' ? 'oninput' : 'onchange'] = () => {
    st.filtros[el.dataset.f] = el.value || undefined; guardar();
    clearTimeout(tBuscar); tBuscar = setTimeout(() => render(v, new URLSearchParams()), el.tagName === 'INPUT' ? 350 : 0);
  });
}

const leyenda = () => `<div class="leyenda">${Object.entries(ESTADOS).map(([k, n]) => `<span><i class="p-${k}"></i>${n}</span>`).join('')}</div>`;

function mini(t) {
  cacheTrabajos.set(t.id, t);
  const arrastrable = t.estado === 'pendiente' || t.estado === 'asignado';
  return `<div class="mini e-${t.estado}" data-tid="${t.id}" ${arrastrable ? 'draggable="true"' : ''} title="${esc(t.cliente.nombre)} · ${esc(t.servicio.nombre)} · ${ESTADOS[t.estado]}">
    ${t.horario ? `${t.horario} ` : ''}${esc(t.cliente.nombre)}${t.jardineros.length ? ` · ${t.jardineros.map(j => esc(j.nombre)).join(', ')}` : ''}</div>`;
}

function semana(trabajos, desde) {
  const hoy = hoyISO();
  let html = '<div class="semana-grid">';
  for (let i = 0; i < 7; i++) {
    const d = sumarDias(desde, i);
    const l = trabajos.filter(t => t.fecha === d);
    html += `<div class="sem-col${d === hoy ? ' hoy' : ''}" data-dia="${d}"><h4><span>${DIAS_SEMANA_C[i]} ${aFecha(d).getDate()}</span><small class="mut">${l.filter(t => t.estado !== 'reprogramado').length || ''}</small></h4>
      ${l.map(mini).join('')}</div>`;
  }
  return html + '</div>';
}

function mes(trabajos, desde, hasta) {
  const hoy = hoyISO(), m = st.fecha.slice(0, 7);
  let html = '<div class="mes">' + DIAS_SEMANA_C.map(d => `<div class="dsem">${d}</div>`).join('');
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
    const l = trabajos.filter(t => t.fecha === d);
    html += `<div class="celda${d.slice(0, 7) !== m ? ' otro' : ''}${d === hoy ? ' hoy' : ''}${d === st.fecha ? ' sel' : ''}" data-dia="${d}">
      <div class="num">${aFecha(d).getDate()}</div>
      <div class="puntos">${l.slice(0, 8).map(t => `<i class="p-${t.estado}"></i>`).join('')}</div>
      ${l.slice(0, 3).map(mini).join('')}${l.length > 3 ? `<div class="mini mas">+${l.length - 3} más</div>` : ''}
    </div>`;
  }
  return html + '</div>';
}

function mostrarDia(cuerpo, trabajos) {
  const l = trabajos.filter(t => t.fecha === st.fecha);
  const cont = cuerpo.querySelector('#dia-sel');
  cont.innerHTML = `<div class="dia-cab"><span>${diaLargo(st.fecha)}</span><small>${l.length} trabajo(s)</small></div>` +
    (l.length ? l.map(t => tarjetaTrabajo(t)).join('') : '<div class="vacio peq">Sin trabajos</div>');
  if (!cont.dataset.conectado) { conectarTrabajos(cont); cont.dataset.conectado = 1; }
}

function conectarCalendario(cuerpo, trabajos) {
  cuerpo.addEventListener('click', e => {
    const m = e.target.closest('.mini[data-tid]');
    if (m) { e.stopPropagation(); return abrirDetalle(m.dataset.tid); }
    const celda = e.target.closest('.celda[data-dia]');
    if (celda) {
      st.fecha = celda.dataset.dia;
      cuerpo.querySelectorAll('.celda.sel').forEach(c => c.classList.remove('sel'));
      celda.classList.add('sel');
      const ts = trabajos;
      mostrarDia(cuerpo, ts);
      cuerpo.querySelector('#dia-sel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  // arrastrar y soltar → pide motivo antes de confirmar
  cuerpo.addEventListener('dragstart', e => { const m = e.target.closest('.mini[data-tid]'); if (m) e.dataTransfer.setData('text/plain', m.dataset.tid); });
  cuerpo.addEventListener('dragover', e => { const c = e.target.closest('[data-dia]'); if (c) { e.preventDefault(); c.classList.add('sobre'); } });
  cuerpo.addEventListener('dragleave', e => e.target.closest('[data-dia]')?.classList.remove('sobre'));
  cuerpo.addEventListener('drop', e => {
    const c = e.target.closest('[data-dia]'); if (!c) return;
    e.preventDefault(); c.classList.remove('sobre');
    const t = cacheTrabajos.get(e.dataTransfer.getData('text/plain'));
    if (t && t.fecha !== c.dataset.dia) accionReprogramar(t, c.dataset.dia);
  });
}
