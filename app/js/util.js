// Formatos y utilidades (fechas en hora de Argentina, pesos ARS).
const fmtPesos = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
export const pesos = n => '$ ' + fmtPesos.format(Math.round(Number(n) || 0));

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Fechas como 'YYYY-MM-DD' (sin horas, sin corrimientos de zona).
export function hoyISO() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p;
}
export const aFecha = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const aISO = f => `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
export const sumarDias = (iso, n) => { const f = aFecha(iso); f.setDate(f.getDate() + n); return aISO(f); };
export const lunesDe = iso => { const f = aFecha(iso); const d = (f.getDay() + 6) % 7; f.setDate(f.getDate() - d); return aISO(f); };
export const inicioMes = iso => iso.slice(0, 8) + '01';
export const finMes = iso => { const f = aFecha(inicioMes(iso)); f.setMonth(f.getMonth() + 1); f.setDate(0); return aISO(f); };
export const sumarMeses = (iso, n) => { const f = aFecha(inicioMes(iso)); f.setMonth(f.getMonth() + n); return aISO(f); };
export const difDias = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 864e5);

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DIAS_C = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const ddmm = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '';
export const ddmmaa = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
export const diaLargo = iso => { const f = aFecha(iso); return `${DIAS[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`; };
export const may = s => s ? s[0].toUpperCase() + s.slice(1) : s;
export const diaCorto = iso => { const f = aFecha(iso); return `${DIAS_C[f.getDay()]} ${f.getDate()}`; };
export const nombreDia = iso => DIAS[aFecha(iso).getDay()];
export const mesAnio = iso => { const f = aFecha(iso); return `${MESES[f.getMonth()]} ${f.getFullYear()}`; };
export const DIAS_SEMANA_C = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

export function relativo(iso) {
  const d = difDias(hoyISO(), iso);
  if (d === 0) return 'hoy';
  if (d === 1) return 'mañana';
  if (d === -1) return 'ayer';
  if (d > 1 && d < 7) return `en ${d} días`;
  if (d < -1 && d > -60) return `hace ${-d} días`;
  return ddmmaa(iso);
}

// ---------- enlaces ----------
export function linkWhatsApp(num) {
  let d = String(num || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  if (!d.startsWith('54')) {
    // celular argentino: 11 15 1234-5678 → 11 1234-5678
    d = d.replace(/^(\d{2,4})15(\d{6,8})$/, '$1$2');
    d = '549' + d;
  }
  return `https://wa.me/${d}`;
}
export const linkTel = num => num ? `tel:${String(num).replace(/[^\d+]/g, '')}` : null;
export function linkMaps(c) {
  if (!c) return null;
  if (c.maps_url) return c.maps_url;
  if (c.lat != null && c.lng != null) return `https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`;
  if (c.direccion) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.direccion + ', Buenos Aires, Argentina')}`;
  return null;
}

export const ESTADOS = {
  pendiente: 'Pendiente', asignado: 'Asignado', realizado: 'Realizado', reprogramado: 'Reprogramado', cancelado: 'Cancelado'
};
export const FRECUENCIAS = {
  semanal: 'Semanal', cada_10: 'Cada 10 días', cada_15: 'Cada 15 días', dos_por_mes: '2 veces por mes',
  mensual: 'Mensual', personalizada: 'Personalizada', puntual: 'Sin recurrencia (puntual)'
};
export function textoFrecuencia(s) {
  if (s.frecuencia === 'personalizada') return `Cada ${s.intervalo_dias} días`;
  if ((s.frecuencia === 'dos_por_mes' || s.frecuencia === 'mensual') && s.dias_mes?.length) {
    return `${FRECUENCIAS[s.frecuencia]} (día${s.dias_mes.length > 1 ? 's' : ''} ${s.dias_mes.join(' y ')})`;
  }
  return FRECUENCIAS[s.frecuencia] || s.frecuencia;
}
export const MODOS = { por_visita: 'Por visita', abono_mensual: 'Abono mensual', por_bloque: 'Por bloque de tiempo' };
export const METODOS = { efectivo: 'Efectivo', transferencia: 'Transferencia', otro: 'Otro' };

export const ICONOS = {
  ok: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  rep: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  mapa: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
  wa: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2z"/></svg>',
  tel: '<svg class="ico" viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
  mas: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  lapiz: '<svg class="ico" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  ojo: '<svg class="ico" viewBox="0 0 24 24"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  alerta: '<svg class="ico" viewBox="0 0 24 24"><path d="M12 3l10 18H2zM12 10v5M12 18v.5"/></svg>',
  reloj: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  persona: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  lluvia: '<svg class="ico" viewBox="0 0 24 24"><path d="M7 15a5 5 0 1 1 1-9.9A6 6 0 0 1 19 9a4 4 0 0 1-1 7.9H7zM8 19l-1 2M12 19l-1 2M16 19l-1 2"/></svg>',
  plata: '<svg class="ico" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  filtro: '<svg class="ico" viewBox="0 0 24 24"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>',
  izq: '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  der: '<svg class="ico" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'
};

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
