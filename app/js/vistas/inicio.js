import { rpc } from '../db.js';
import { esc, pesos, diaLargo, ddmm, ICONOS, may } from '../util.js';
import { tarjetaTrabajo, conectarTrabajos, accionReprogramarDia, abrirHoja } from '../ui.js';

export async function render(v) {
  const d = await rpc('api_inicio');
  const ts = d.trabajos;
  const visibles = ts.filter(t => t.estado !== 'reprogramado');
  const realizados = ts.filter(t => t.estado === 'realizado').length;
  const abiertos = ts.filter(t => t.estado === 'pendiente' || t.estado === 'asignado');
  const sinAsignar = abiertos.filter(t => !t.jardineros.length).length;
  const a = d.alertas;
  // orden: primero lo que falta hacer
  const orden = { asignado: 0, pendiente: 0, realizado: 1, reprogramado: 2, cancelado: 3 };
  const lista = [...ts].sort((x, y) => orden[x.estado] - orden[y.estado] || (x.horario || '99').localeCompare(y.horario || '99'));

  v.innerHTML = `
    <div class="saludo">
      <div class="fecha">${may(diaLargo(d.hoy))}</div>
      <h1>HOY · ${visibles.length} trabajo${visibles.length === 1 ? '' : 's'}</h1>
    </div>
    <div class="resumen-hoy">
      <div class="kpi"><b>${visibles.length}</b><span>Total</span></div>
      <div class="kpi verde"><b>${realizados}</b><span>Realizados</span></div>
      <div class="kpi ambar"><b>${abiertos.length}</b><span>Pendientes</span></div>
      <div class="kpi ${sinAsignar ? 'rojo' : ''}"><b>${sinAsignar}</b><span>Sin asignar</span></div>
    </div>

    <h2>Trabajos de hoy</h2>
    <div id="lista-hoy">${lista.length ? lista.map(t => tarjetaTrabajo(t)).join('') : '<div class="vacio">No hay trabajos para hoy.<br><a href="#/agenda">Ver la agenda</a></div>'}</div>
    ${abiertos.length > 1 ? `<button class="btn bloque" style="margin-top:12px" id="lluvia">${ICONOS.lluvia} Reprogramar todo el día (lluvia)</button>` : ''}

    <h2>Avisos</h2>
    <div id="alertas">
      ${a.atrasados.length ? `<div class="alerta roja" data-lista="atrasados">${ICONOS.alerta}<div><b>${a.atrasados.length} trabajo(s) atrasado(s)</b><span class="peq mut">Quedaron sin hacer en días anteriores</span></div></div>` : ''}
      ${a.sin_asignar.length ? `<div class="alerta" data-lista="sin_asignar">${ICONOS.persona}<div><b>${a.sin_asignar.length} trabajo(s) sin jardinero</b><span class="peq mut">Próximos 7 días</span></div></div>` : ''}
      ${a.proximos.length ? `<div class="alerta azul" data-lista="proximos">${ICONOS.reloj}<div><b>${a.proximos.length} cliente(s) a visitar en los próximos días</b><span class="peq mut">${a.proximos.slice(0, 4).map(t => `${esc(t.cliente.nombre)} (${ddmm(t.fecha)})`).join(' · ')}${a.proximos.length > 4 ? '…' : ''}</span></div></div>` : ''}
      ${a.sin_proxima.length ? `<div class="alerta" data-lista="sin_proxima">${ICONOS.alerta}<div><b>${a.sin_proxima.length} cliente(s) activo(s) sin próxima visita</b><span class="peq mut">${a.sin_proxima.slice(0, 4).map(c => esc(c.nombre)).join(' · ')}</span></div></div>` : ''}
      ${Number(a.saldo_pendiente) > 0 ? `<a class="alerta" href="#/estadisticas?cobros=1" style="text-decoration:none;color:inherit">${ICONOS.plata}<div><b>${pesos(a.saldo_pendiente)} pendiente de cobro</b><span class="peq mut">Ver detalle</span></div></a>` : ''}
      ${!a.atrasados.length && !a.sin_asignar.length && !a.proximos.length && !a.sin_proxima.length && !(Number(a.saldo_pendiente) > 0) ? '<div class="vacio peq">Todo en orden 🌿</div>' : ''}
    </div>

    <h2>Resumen</h2>
    <div class="kpis">
      <div class="kpi grande"><span>Esta semana</span><b>${d.semana.total}</b><span>${d.semana.realizados} hechos · ${d.semana.abiertos} por hacer</span></div>
      <div class="kpi grande"><span>Este mes · realizados</span><b>${d.mes.realizados}</b><span>${d.mes.pendientes} pendientes</span></div>
      <div class="kpi grande"><span>Cancelados / reprog.</span><b>${d.mes.cancelados} / ${d.mes.reprogramados}</b><span>este mes</span></div>
      <div class="kpi grande"><span>Facturación estimada</span><b class="monto" style="font-size:24px">${pesos(d.mes.estimado)}</b><span>facturado: ${pesos(d.mes.facturado)}</span></div>
    </div>`;

  conectarTrabajos(v.querySelector('#lista-hoy'));
  v.querySelector('#lluvia')?.addEventListener('click', () => accionReprogramarDia(d.hoy, abiertos.length));
  v.querySelectorAll('[data-lista]').forEach(el => el.onclick = () => {
    const k = el.dataset.lista;
    if (k === 'sin_proxima') {
      return abrirHoja({
        titulo: 'Clientes sin próxima visita',
        cuerpo: `<p class="mut peq" style="margin-top:0">Activos y sin ningún trabajo programado. Entrá al cliente para registrar uno o agregarle un servicio.</p>` +
          a.sin_proxima.map(c => `<a class="cli" href="#/cliente/${c.id}" onclick="this.closest('.velo').remove();document.body.style.overflow=''"><span class="n">${esc(c.nombre)}</span></a>`).join('')
      });
    }
    const titulos = { atrasados: 'Trabajos atrasados', sin_asignar: 'Sin jardinero (próximos 7 días)', proximos: 'Próximas visitas' };
    const h = abrirHoja({ titulo: titulos[k], cuerpo: `<div data-l>${a[k].map(t => tarjetaTrabajo(t, { conFecha: true })).join('')}</div>` });
    conectarTrabajos(h.$('[data-l]'));
  });
}
