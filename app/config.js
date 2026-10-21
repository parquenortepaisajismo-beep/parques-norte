// Configuración de dónde viven los datos.
// modo 'local'    → base de datos dentro del navegador (los datos quedan en ESTE dispositivo).
// modo 'supabase' → base compartida en Supabase, con login. Completar url y clave pública (publishable/anon).
//                   La clave pública está pensada para ir en el navegador: los datos los protege el login + RLS.
window.PN_CONFIG = {
  modo: 'local',
  supabaseUrl: '',
  supabaseKey: '',
  schema: 'parques'
};
