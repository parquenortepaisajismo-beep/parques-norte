// Arranque y navegación.
import { iniciar, rpc, modo, sesion, entrar } from './db.js';
import { estado, cargarConfig, mostrarError } from './ui.js';
import { esc } from './util.js';
import * as inicio from './vistas/inicio.js';
import * as agenda from './vistas/agenda.js';
import * as clientes from './vistas/clientes.js';
import * as equipo from './vistas/equipo.js';
import * as estadisticas from './vistas/estadisticas.js';
import * as config from './vistas/config.js';

const vista = document.getElementById('vista');
const txt = m => { const el = document.getElementById('arranque-txt'); if (el) el.textContent = m; };

const RUTAS = [
  [/^inicio$/, 'inicio', (v, p) => inicio.render(v, p)],
  [/^agenda$/, 'agenda', (v, p) => agenda.render(v, p)],
  [/^clientes$/, 'clientes', v => clientes.renderLista(v)],
  [/^cliente\/nuevo$/, 'clientes', v => clientes.renderForm(v, null)],
  [/^cliente\/([\w-]+)\/editar$/, 'clientes', (v, p, m) => clientes.renderForm(v, m[1])],
  [/^cliente\/([\w-]+)$/, 'clientes', (v, p, m) => clientes.renderFicha(v, m[1])],
  [/^equipo$/, 'equipo', v => equipo.render(v)],
  [/^estadisticas$/, 'estadisticas', (v, p) => estadisticas.render(v, p)],
  [/^config$/, 'config', v => config.render(v)]
];

let rutaActual = '';
async function navegar() {
  const [ruta, qs] = (location.hash.replace(/^#\/?/, '') || 'inicio').split('?');
  const params = new URLSearchParams(qs || '');
  let r = RUTAS.find(([re]) => re.test(ruta));
  if (!r) { location.hash = '#/inicio'; return; }
  const m = ruta.match(r[0]);
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('activo', a.dataset.nav === r[1]));
  const cambio = ruta !== rutaActual;
  rutaActual = ruta;
  // cerrar hojas abiertas al navegar
  document.getElementById('capas').innerHTML = ''; document.body.style.overflow = '';
  const pintar = async () => {
    const y = window.scrollY;
    try { await r[2](vista, params, m); } catch (e) {
      console.error(e);
      vista.innerHTML = `<div class="vacio">No se pudo cargar: ${esc(e.message)}<br><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
    }
    return y;
  };
  estado.refrescar = async () => { const y = window.scrollY; await r[2](vista, new URLSearchParams(), m).catch(mostrarError); window.scrollTo(0, y); };
  await pintar();
  if (cambio) { window.scrollTo(0, 0); vista.focus({ preventScroll: true }); }
  const t = { inicio: 'Hoy', agenda: 'Agenda', clientes: 'Clientes', equipo: 'Equipo', estadisticas: 'Estadísticas', config: 'Configuración' }[r[1]];
  document.title = `${t} · Parques Norte`;
}

function pantallaLogin() {
  return new Promise(res => {
    vista.innerHTML = `<div class="login tarjeta">
      <h1 style="text-align:center">Ingresar</h1>
      <form id="login">
        <label class="campo"><span>Mail</span><input type="email" name="email" autocomplete="username" required></label>
        <label class="campo"><span>Contraseña</span><input type="password" name="pass" autocomplete="current-password" required></label>
        <div class="msg-error" id="err" hidden></div>
        <button class="btn prim bloque">Entrar</button>
      </form></div>`;
    vista.querySelector('#login').onsubmit = async e => {
      e.preventDefault();
      const f = e.target;
      try { await entrar(f.email.value.trim(), f.pass.value); res(); }
      catch (er) { const el = vista.querySelector('#err'); el.hidden = false; el.textContent = er.message; }
    };
  });
}

async function arrancar() {
  try {
    if (modo() === 'supabase') {
      await new Promise((ok, mal) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
        s.onload = ok; s.onerror = () => mal(new Error('Sin conexión: no se pudo cargar la app'));
        document.head.appendChild(s);
      });
    }
    await iniciar({ progreso: txt });
    if (modo() === 'supabase' && !(await sesion())) await pantallaLogin();
    if (modo() === 'local') {
      const av = document.getElementById('aviso-modo');
      av.textContent = 'Datos en este equipo'; av.title = 'Modo local: los datos se guardan solo en este dispositivo'; av.hidden = false;
    }
    txt('Preparando la agenda…');
    await cargarConfig();
    await rpc('generar_trabajos');   // completa las recurrencias hasta el horizonte
    window.addEventListener('hashchange', navegar);
    await navegar();
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<div class="vacio"><b>No se pudo iniciar.</b><br>${esc(e.message)}<br><br><button class="btn" onclick="location.reload()">Reintentar</button></div>`;
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
arrancar();
