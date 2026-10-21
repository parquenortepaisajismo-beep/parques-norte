// Equipo: jardineros, su carga y su historial.
import { rpc } from '../db.js';
import { esc, hoyISO, inicioMes, finMes, sumarDias, ddmm, ICONOS, linkWhatsApp, linkTel } from '../util.js';
import { abrirHoja, hacer, confirmar, exigir, cargarConfig, jardineros } from '../ui.js';

const COLORES = ['#2f6b3a', '#b5651d', '#3b6ea5', '#8a3f8f', '#a8326e', '#2d7f7a', '#7a6a12', '#5b5b5b'];

export async function render(v) {
  const hoy = hoyISO();
  const [est, prox] = await Promise.all([
    rpc('api_estadisticas', { p_desde: inicioMes(hoy), p_hasta: finMes(hoy) }),
    rpc('api_trabajos', { p_desde: hoy, p_hasta: sumarDias(hoy, 6), p_filtros: { estado: 'abiertos' } })
  ]);
  const js = jardineros(false);
  const delMes = Object.fromEntries(est.por_jardinero.map(j => [j.id, j]));
  v.innerHTML = `
    <h1>Equipo</h1>
    <p class="mut" style="margin-top:0">Trabajos realizados este mes y asignados para los próximos 7 días.</p>
    ${js.map(j => {
      const m = delMes[j.id] || { realizados: 0, compartidos: 0, bloques: 0 };
      const asign = prox.filter(t => t.jardineros.some(x => x.id === j.id));
      const wa = linkWhatsApp(j.telefono), tel = linkTel(j.telefono);
      return `<div class="tarjeta" style="border-left:6px solid ${esc(j.color)};${j.activo ? '' : 'opacity:.6'}">
        <div class="entre"><h3 style="margin:0">${esc(j.nombre)}</h3>${j.activo ? '' : '<span class="badge e-baja">Inactivo</span>'}</div>
        <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:10px 0">
          <div class="kpi"><b>${m.realizados}</b><span>Hechos este mes</span></div>
          <div class="kpi"><b>${asign.length}</b><span>Próx. 7 días</span></div>
          <div class="kpi"><b>${m.compartidos}</b><span>Compartidos</span></div>
        </div>
        ${asign.length ? `<div class="peq mut">${asign.slice(0, 5).map(t => `${ddmm(t.fecha)} ${esc(t.cliente.nombre)}`).join(' · ')}${asign.length > 5 ? '…' : ''}</div>` : ''}
        <div class="fila" style="margin-top:10px">
          <a class="btn chico" href="#/agenda?jardinero=${j.id}">Ver su agenda</a>
          ${tel ? `<a class="btn chico" href="${esc(tel)}">${ICONOS.tel}</a>` : ''}
          ${wa ? `<a class="btn chico" href="${esc(wa)}" target="_blank" rel="noopener">${ICONOS.wa}</a>` : ''}
          <button class="btn chico" data-editar="${j.id}">${ICONOS.lapiz} Editar</button>
          <button class="btn chico ${j.activo ? 'borde-peligro' : ''}" data-activo="${j.id}">${j.activo ? 'Desactivar' : 'Reactivar'}</button>
        </div>
      </div>`;
    }).join('')}
    <button class="btn prim fab" data-nuevo>${ICONOS.mas} Jardinero</button>`;

  v.querySelector('[data-nuevo]').onclick = () => form(null);
  v.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => form(js.find(j => j.id === b.dataset.editar)));
  v.querySelectorAll('[data-activo]').forEach(b => b.onclick = async () => {
    const j = js.find(x => x.id === b.dataset.activo);
    if (j.activo && !await confirmar(`¿Desactivar a <b>${esc(j.nombre)}</b>? Se lo saca de los trabajos futuros pendientes. Sus trabajos realizados y su historial se conservan.`, { ok: 'Desactivar', peligro: true })) return;
    await guardar({ ...j, activo: !j.activo }, j.activo ? `${j.nombre} desactivado` : `${j.nombre} reactivado`);
  });
}

async function guardar(datos, ok) {
  try {
    await hacer(async () => { await rpc('guardar_jardinero', { p: datos }); await cargarConfig(); }, { ok });
    return true;
  } catch { return false; }
}

export function form(j, despues) {
  const usados = new Set(jardineros(false).map(x => x.color));
  const color = j?.color || COLORES.find(c => !usados.has(c)) || COLORES[0];
  abrirHoja({
    titulo: j ? `Editar ${j.nombre}` : 'Nuevo jardinero',
    cuerpo: `<label class="campo"><span>Nombre <em>*</em></span><input type="text" name="nombre" value="${esc(j?.nombre || '')}" maxlength="60" autofocus></label>
      <label class="campo"><span>Teléfono</span><input type="tel" name="telefono" value="${esc(j?.telefono || '')}" inputmode="tel"></label>
      <div class="campo"><span>Color</span><div class="chips" data-color>${COLORES.map(c => `<button type="button" class="chip${c === color ? ' on' : ''}" data-v="${c}" style="--c:${c}" aria-label="Color ${c}"><span class="punto"></span></button>`).join('')}</div></div>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>Guardar</button>`,
    alAbrir: h => {
      let col = color;
      h.$('[data-color]').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; col = b.dataset.v; h.$$('[data-color] .chip').forEach(x => x.classList.toggle('on', x === b)); };
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const nombre = exigir(h, '[name=nombre]', 'El nombre es obligatorio'); if (!nombre) return;
        if (await guardar({ id: j?.id || null, nombre, telefono: h.$('[name=telefono]').value, color: col, activo: j ? j.activo : true }, j ? 'Guardado' : `${nombre} agregado al equipo`)) {
          h.cerrar(); despues?.();
        }
      };
    }
  });
}
