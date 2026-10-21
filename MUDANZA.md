# Parques Norte · cómo mudar la app a sus cuentas propias

Hoy la app funciona en **modo local**: los datos viven en el navegador de cada dispositivo.
Para que todos (celu, compu, el equipo) vean los mismos datos hay que pasarla a Supabase.

## 1. Supabase (base de datos en la nube)

1. Crear una cuenta en https://supabase.com con el mail de Parques Norte → **New project**
   (región São Paulo `sa-east-1`, plan gratis).
2. **SQL Editor** → pegar y correr `app/sql/001_esquema.sql` (crea tablas, reglas y tarifas iniciales).
3. Pegar y correr `supabase/remoto.sql` (seguridad).
4. **Settings → API → Exposed schemas**: agregar `parques`.
5. **Authentication → Sign In / Providers**: desactivar "Allow new users to sign up".
6. **Authentication → Users → Add user**: crear el usuario administrador (mail + contraseña).
7. En SQL Editor, dar de alta el perfil (último bloque de `remoto.sql`, con el mail real).
8. **Settings → API**: copiar *Project URL* y la *publishable key* (o anon key) a `app/config.js`:

   ```js
   window.PN_CONFIG = { modo: 'supabase', supabaseUrl: 'https://xxxx.supabase.co', supabaseKey: 'sb_publishable_…', schema: 'parques' };
   ```

   La clave pública está pensada para estar en la página: los datos los protegen el login y las reglas.
   **Nunca** poner la `service_role` / secret key en la página.

## 2. Pasar los datos

1. En el dispositivo donde se cargaron los datos reales (modo local): **Config. → Datos → Exportar respaldo**.
2. Publicar la app con `modo: 'supabase'`, entrar con el usuario admin.
3. **Config. → Datos → Importar respaldo** → elegir el archivo. Reemplaza todo por lo del archivo.
4. Si quedaron los clientes de demostración: **Config. → Datos → Borrar clientes de demostración**.

## 3. GitHub (la página)

Hoy está en `Clubdelacro1/parques-norte`. La publica la acción `.github/workflows/pages.yml` (sube la carpeta `app/`).
Para pasarla: en el repo → **Settings → General → Transfer ownership** → cuenta nueva de Parques Norte.
Después, en la cuenta nueva: **Settings → Pages → Source: GitHub Actions** (la acción ya viene en el repo).
La dirección pasa a ser `https://<cuenta-nueva>.github.io/parques-norte/`.

## Estructura

- `app/` — la app (lo que se publica). `index.html`, `css/`, `js/` (`db.js` = capa de datos, `ui.js` = componentes, `vistas/`).
- `app/sql/001_esquema.sql` — base de datos completa (la misma en local y en Supabase).
- `app/sql/000_local_auth.sql`, `local_perfil.sql`, `demo.sql` — solo para el modo local.
- `app/tests.html` — pruebas automáticas de la base (abrir en el navegador: debe decir TODO OK).
- `supabase/remoto.sql` — seguridad para Supabase.
- `servir.ps1` — servidor local para probar: `powershell -File servir.ps1` → http://localhost:8770/
- `tools/captura.ps1` — recorre la app en Chrome sin ventana y saca capturas.

Al publicar cambios, subir `VERSION` en `app/sw.js` para que los celulares bajen la versión nueva.
