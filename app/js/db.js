// Capa de datos: la app solo llama funciones de la base (rpc).
// Modo "local": Postgres dentro del navegador (PGlite), datos guardados en este dispositivo.
// Modo "supabase": las mismas funciones en Supabase, con login.
const CFG = window.PN_CONFIG || { modo: 'local' };
const PGLITE = 'https://cdn.jsdelivr.net/npm/@electric-sql/pglite@0.2.17/dist/index.js';
const MIGRACIONES = ['000_local_auth.sql', '001_esquema.sql', 'local_perfil.sql'];

let pg = null;   // PGlite
let sb = null;   // cliente Supabase

export const modo = () => CFG.modo;

async function leerSql(nombre) {
  const r = await fetch(new URL(`../sql/${nombre}`, import.meta.url), { cache: 'no-cache' });
  if (!r.ok) throw new Error(`No se pudo leer ${nombre}`);
  return r.text();
}

export async function iniciar({ memoria = false, demo = true, progreso = () => {} } = {}) {
  if (CFG.modo === 'supabase') {
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { db: { schema: CFG.schema || 'parques' } });
    return { nueva: false };
  }
  progreso('Abriendo la base de datos…');
  const { PGlite } = await import(PGLITE);
  pg = new PGlite(memoria ? undefined : 'idb://parques-norte');
  await pg.waitReady;
  await pg.exec(`create table if not exists public.pn_migraciones (nombre text primary key, aplicada timestamptz default now())`);
  const hechas = new Set((await pg.query('select nombre from public.pn_migraciones')).rows.map(r => r.nombre));
  const nueva = !hechas.has('001_esquema.sql');
  for (const m of MIGRACIONES) {
    if (hechas.has(m)) continue;
    progreso(`Preparando la base (${m})…`);
    await pg.transaction(async tx => {
      await tx.exec(await leerSql(m));
      await tx.query('insert into public.pn_migraciones (nombre) values ($1)', [m]);
    });
  }
  if (nueva && demo) {
    progreso('Cargando datos de demostración…');
    await pg.exec(await leerSql('demo.sql'));
  }
  return { nueva };
}

// Para parámetros jsonb que son valores sueltos (número, booleano, lista): rpc(..., { p_valor: json(x) })
export const json = v => ({ __json: v });

function aParam(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object' && '__json' in v) return JSON.stringify(v.__json);
  if (Array.isArray(v)) return '{' + v.map(x => '"' + String(x).replace(/["\\]/g, '\\$&') + '"').join(',') + '}';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

export async function rpc(fn, args = {}) {
  if (!/^[a-z_]+$/.test(fn)) throw new Error('Función inválida');
  if (sb) {
    const a = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v && typeof v === 'object' && '__json' in v ? v.__json : v]));
    const { data, error } = await sb.rpc(fn, a);
    if (error) throw new Error(limpiarError(error.message));
    return data;
  }
  const claves = Object.keys(args).filter(k => args[k] !== undefined);
  const sql = `select parques.${fn}(${claves.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  try {
    const res = await pg.query(sql, claves.map(k => aParam(args[k])));
    return res.rows[0]?.r ?? null;
  } catch (e) {
    throw new Error(limpiarError(e.message));
  }
}

function limpiarError(m = '') {
  if (/violates check constraint/.test(m)) return 'Hay un dato inválido. Revisá el formulario.';
  if (/jardineros_nombre_uq/.test(m)) return 'Ya existe un jardinero con ese nombre.';
  if (/duplicate key/.test(m)) return 'Ese dato ya existe.';
  return m.replace(/^ERROR:\s*/, '');
}

// ---------- sesión (solo Supabase) ----------
export async function sesion() {
  if (!sb) return { local: true };
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function entrar(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Mail o contraseña incorrectos' : error.message);
}
export async function salir() { if (sb) await sb.auth.signOut(); }
export async function cambiarClave(password) {
  const { error } = await sb.auth.updateUser({ password });
  if (error) throw new Error(/should be different/i.test(error.message) ? 'La contraseña nueva es igual a la actual' : error.message);
}

// ---------- utilidades de la base local ----------
export async function borrarBaseLocal() {
  if (pg) await pg.close();
  await new Promise(res => { const r = indexedDB.deleteDatabase('/pglite/parques-norte'); r.onsuccess = r.onerror = r.onblocked = res; });
}
