// Configuración de dónde viven los datos.
// modo 'local'    → base de datos dentro del navegador (los datos quedan en ESTE dispositivo).
// modo 'supabase' → base compartida en Supabase (proyecto "Parques Norte" de parquenortepaisajismo@gmail.com), con login.
//                   La clave pública (publishable) está pensada para ir en el navegador: los datos los protege el login + las reglas de la base.
window.PN_CONFIG = {
  modo: 'supabase',
  supabaseUrl: 'https://pwemsreanpeiieegtyca.supabase.co',
  supabaseKey: 'sb_publishable_FlGxVnmdZc55VZXvXE4j2Q_jgnR3waR',
  schema: 'parques'
};
