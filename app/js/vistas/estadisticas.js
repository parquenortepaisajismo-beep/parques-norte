// Estadísticas del período + facturación recurrente + cobros pendientes.
import { rpc } from '../db.js';
import { esc, pesos, hoyISO, inicioMes, finMes, sumarMeses, ddmm, ddmmaa, mesAnio, METODOS } from '../util.js';
import { abrirCobro, abrirDetalle } from '../ui.js';

const st = { periodo: 'actual', desde: null, hasta: null };

function rango() {
  const hoy = hoyISO();
  if (st.periodo === 'anterior') { const m = sumarMeses(hoy, -1); return [m, finMes(m)]; }
  if (st.periodo === 'custom' && st.desde && st.hasta) return [st.desde, st.hasta];
  return [inicioMes(hoy), finMes(hoy)];
}

export async function render(v, params) {
  const [desde, hasta] = rango();
  const [e, cobros] = await Promise.all([rpc('api_estadisticas', { p_desde: desde, p_hasta: hasta }), rpc('api_cobros', { p_solo_pendientes: true })]);
  const t = e.trabajos, d = e.dinero;
  const maxJ = Math.max(1, ...e.por_jardinero.map(j => j.realizados));
  const porCliente = {};
  cobros.forEach(c => (porCliente[c.cliente_id] ||= { nombre: c.cliente, items: [] }).items.push(c));
  const titulo = st.periodo === 'custom' ? `${ddmmaa(desde)} al ${ddmmaa(hasta)}` : mesAnio(desde);
  const corte = e.por_servicio.find(s => s.codigo === 'corte_simple');
  const mant = e.por_servicio.find(s => s.codigo === 'mantenimiento');
  const cant = e.por_servicio.find(s => s.codigo === 'canteros');

  v.innerHTML = `
    <h1>Estadísticas</h1>
    <div class="seg">${[['actual', 'Mes actual'], ['anterior', 'Mes anterior'], ['custom', 'Rango']].map(([k, n]) => `<button data-p="${k}" class="${st.periodo === k ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="fila" data-rango style="margin-top:8px" ${st.periodo === 'custom' ? '' : 'hidden'}>
      <input type="date" data-desde value="${desde}" style="flex:1;min-width:140px"><input type="date" data-hasta value="${hasta}" style="flex:1;min-width:140px">
      <button class="btn prim" data-aplicar>Ver</button></div>
    <p class="mut" style="text-transform:capitalize;margin:10px 0 0">${titulo}</p>

    <h2>Trabajos</h2>
    <div class="kpis">
      <div class="kpi grande"><span>Total</span><b>${t.total}</b><span>sin contar los reprogramados</span></div>
      <div class="kpi grande verde"><span>Realizados</span><b>${t.realizados}</b><span>${t.pendientes} pendientes${t.atrasados ? ` · ${t.atrasados} atrasados` : ''}</span></div>
      <div class="kpi grande"><span>Cancelados</span><b>${t.cancelados}</b><span>&nbsp;</span></div>
      <div class="kpi grande"><span>Reprogramados</span><b>${t.reprogramados}</b><span>&nbsp;</span></div>
    </div>
    <div class="tarjeta" style="margin-top:10px">
      <table class="tabla"><thead><tr><th>Servicio</th><th class="n">Realizados</th><th class="n">Facturado</th></tr></thead><tbody>
        ${e.por_servicio.map(s => `<tr><td>${esc(s.nombre)}${s.modo_cobro === 'por_bloque' ? `<br><span class="muy-peq mut">${Number(s.bloques)} bloque(s) · ${(Number(s.bloques) * 1.5).toLocaleString('es-AR')} h</span>` : ''}</td>
          <td class="n">${s.realizados}</td><td class="n monto">${pesos(s.facturado)}</td></tr>`).join('')}
      </tbody></table>
    </div>

    <h2>Dinero</h2>
    <div class="kpis">
      <div class="kpi grande"><span>Facturado</span><b class="monto" style="font-size:24px">${pesos(d.facturado)}</b><span>trabajos hechos + abonos</span></div>
      <div class="kpi grande verde"><span>Cobrado</span><b class="monto" style="font-size:24px">${pesos(d.cobrado)}</b><span>${Object.entries(d.por_metodo).map(([k, x]) => `${METODOS[k]}: ${pesos(x)}`).join(' · ') || '&nbsp;'}</span></div>
      <div class="kpi grande ambar"><span>Pendiente de cobro</span><b class="monto" style="font-size:24px">${pesos(d.pendiente_periodo)}</b><span>del período · total ${pesos(d.pendiente_total)}</span></div>
      <div class="kpi grande"><span>Estimado a facturar</span><b class="monto" style="font-size:24px">${pesos(Number(d.facturado) + Number(d.estimado_pendientes))}</b><span>suma los pendientes del período</span></div>
    </div>

    <h2>Por jardinero</h2>
    <div class="tarjeta barras">
      <p class="muy-peq mut" style="margin-top:0">Trabajos realizados en el período. Un trabajo hecho entre dos cuenta para cada uno, pero se factura una sola vez (la columna "parte" lo reparte).</p>
      ${e.por_jardinero.length ? e.por_jardinero.map(j => `<div class="b" title="${esc(j.nombre)}: ${j.realizados} realizados, ${j.compartidos} compartidos">
          <span style="font-weight:700;overflow:hidden;text-overflow:ellipsis"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${esc(j.color)};margin-right:5px"></span>${esc(j.nombre)}</span>
          <div class="riel"><div class="relleno" style="width:${(j.realizados / maxJ) * 100}%"></div></div>
          <span class="v">${j.realizados}</span></div>`).join('') : '<p class="mut">Sin datos</p>'}
      <table class="tabla" style="margin-top:8px"><thead><tr><th>Jardinero</th><th class="n">Hechos</th><th class="n">Compart.</th><th class="n">Bloques</th><th class="n">Parte</th></tr></thead><tbody>
        ${e.por_jardinero.map(j => `<tr><td>${esc(j.nombre)}${j.activo ? '' : ' <span class="muy-peq mut">(inactivo)</span>'}</td><td class="n">${j.realizados}</td><td class="n">${j.compartidos}</td><td class="n">${Number(j.bloques)}</td><td class="n monto">${pesos(j.participacion)}</td></tr>`).join('')}
        ${e.sin_jardinero ? `<tr><td class="mut">Sin jardinero cargado</td><td class="n">${e.sin_jardinero}</td><td></td><td></td><td></td></tr>` : ''}
      </tbody></table>
    </div>

    <h2>Facturación recurrente</h2>
    <div class="tarjeta">
      <div class="dato"><span>Clientes activos</span><span><b>${e.clientes_activos}</b> (${e.recurrente.clientes} con servicio recurrente)</span></div>
      <div class="dato"><span>Recurrente mensual</span><span><b class="monto">${pesos(e.recurrente.mensual)}</b><br><span class="muy-peq mut">Abonos + servicios periódicos llevados a un mes, con precios de hoy</span></span></div>
      <div class="dato"><span>Trabajos adicionales</span><span><b class="monto">${pesos(e.adicionales)}</b><br><span class="muy-peq mut">Puntuales facturados en el período</span></span></div>
      <div class="dato"><span>Proyección mensual</span><span><b class="precio">${pesos(Number(e.recurrente.mensual) + Number(e.adicionales))}</b></span></div>
    </div>

    <h2 id="cobros">Pendiente de cobro (${pesos(d.pendiente_total)})</h2>
    ${Object.keys(porCliente).length ? Object.values(porCliente).map(pc => {
      const total = pc.items.reduce((a, x) => a + Number(x.saldo), 0);
      return `<div class="tarjeta"><div class="entre"><a href="#/cliente/${pc.items[0].cliente_id}"><b>${esc(pc.nombre)}</b></a><b class="monto">${pesos(total)}</b></div>
        ${pc.items.map(x => `<div class="entre peq" style="padding:5px 0"><span ${x.trabajo_id ? `data-tid="${x.trabajo_id}" style="cursor:pointer;text-decoration:underline dotted"` : ''}>${esc(x.concepto)} · ${ddmm(x.fecha)}</span><span class="monto">${pesos(x.saldo)}</span></div>`).join('')}
        <button class="btn chico prim" style="margin-top:6px" data-cobrar="${pc.items[0].cliente_id}">Cobrar ${pc.items.length > 1 ? 'todo' : ''}</button></div>`;
    }).join('') : '<div class="vacio">No hay nada pendiente de cobro 🎉</div>'}`;

  v.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
    st.periodo = b.dataset.p;
    if (st.periodo === 'custom') { v.querySelector('[data-rango]').hidden = false; v.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b)); return; }
    render(v, new URLSearchParams());
  });
  v.querySelector('[data-aplicar]').onclick = () => {
    st.desde = v.querySelector('[data-desde]').value; st.hasta = v.querySelector('[data-hasta]').value;
    if (!st.desde || !st.hasta || st.desde > st.hasta) return v.querySelector('[data-hasta]').classList.add('error-campo');
    render(v, new URLSearchParams());
  };
  v.querySelectorAll('[data-cobrar]').forEach(b => b.onclick = () => { const pc = porCliente[b.dataset.cobrar]; abrirCobro(pc.items, pc.nombre); });
  v.querySelectorAll('[data-tid]').forEach(el => el.onclick = () => abrirDetalle(el.dataset.tid));
  if (params.get('cobros')) setTimeout(() => v.querySelector('#cobros')?.scrollIntoView({ behavior: 'smooth' }), 50);
}
