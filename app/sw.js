// Service worker: la app abre sin conexión (en modo local funciona completa offline).
// Subir VERSION en cada publicación.
const VERSION = 'pn-v2';
const APP = ['./', 'index.html', 'config.js', 'css/app.css', 'js/app.js', 'js/db.js', 'js/ui.js', 'js/util.js',
  'js/vistas/inicio.js', 'js/vistas/agenda.js', 'js/vistas/clientes.js', 'js/vistas/equipo.js', 'js/vistas/estadisticas.js',
  'js/vistas/config.js', 'sql/000_local_auth.sql', 'sql/001_esquema.sql', 'sql/local_perfil.sql', 'sql/demo.sql',
  'img/icono.svg', 'img/icono-192.png', 'manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION && k !== 'pn-cdn').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // librerías y fuentes versionadas: primero caché
  if (u.hostname === 'cdn.jsdelivr.net' || u.hostname.endsWith('gstatic.com') || u.hostname === 'fonts.googleapis.com') {
    e.respondWith(caches.open('pn-cdn').then(async c => {
      const r = await c.match(e.request);
      if (r) return r;
      const n = await fetch(e.request);
      if (n.ok) c.put(e.request, n.clone());
      return n;
    }));
    return;
  }
  if (u.origin !== location.origin) return;
  // archivos de la app: red primero (para recibir actualizaciones), caché si no hay señal
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
