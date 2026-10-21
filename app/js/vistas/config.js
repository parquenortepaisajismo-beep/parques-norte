// Configuración: tarifas, servicios, jardineros, preferencias, datos.
import { rpc, json, modo, salir, borrarBaseLocal, cambiarClave } from '../db.js';
import { esc, pesos, ddmmaa, hoyISO, MODOS, FRECUENCIAS, ICONOS } from '../util.js';
import { estado, cargarConfig, tipos, jardineros, abrirHoja, hacer, confirmar, exigir, toast, cfg } from '../ui.js';
import { form as formJardinero } from './equipo.js';

export async function render(v) {
  await cargarConfig();
  const c = estado.config;
  const ts = tipos(false);
  v.innerHTML = `
    <h1>Configuración</h1>

    <h2>Tarifas</h2>
    <p class="mut peq" style="margin-top:-4px">Cambiar una tarifa afecta las visitas pendientes. Los trabajos ya realizados conservan su precio. Los clientes con precio personalizado no cambian.</p>
    ${ts.filter(t => t.activo).map(t => `<div class="tarjeta">
      <div class="entre"><b>${esc(t.nombre)}</b><span class="muy-peq mut">${MODOS[t.modo_cobro]}${t.modo_cobro === 'por_bloque' ? ` de ${t.minutos_bloque} min` : ''}</span></div>
      <div class="grilla dos" style="margin-top:10px">
        ${(t.usa_tipo_propiedad ? [['comun', 'Común'], ['esquina', 'Esquina']] : [[null, t.modo_cobro === 'por_bloque' ? 'Por bloque' : 'Precio']]).map(([p, n]) =>
          `<label class="campo" style="margin:0"><span class="peq">${n}${t.modo_cobro === 'abono_mensual' ? ' (por mes)' : ''}</span>
            <div class="fila" style="flex-wrap:nowrap"><input type="number" inputmode="numeric" min="0" step="500" data-tarifa="${t.id}" data-prop="${p ?? ''}" value="${t.tarifas[p ?? 'unica'] ?? ''}">
            <button class="btn chico" data-guardar-tarifa>Guardar</button></div></label>`).join('')}
      </div>
      ${t.historial_tarifas.length > (t.usa_tipo_propiedad ? 2 : 1) ? `<details style="margin-top:8px"><summary class="peq" style="cursor:pointer">Historial de precios</summary>
        <table class="tabla peq">${t.historial_tarifas.map(h => `<tr><td>${ddmmaa(h.vigente_desde)}</td><td>${h.tipo_propiedad ? (h.tipo_propiedad === 'comun' ? 'Común' : 'Esquina') : ''}</td><td class="n monto">${pesos(h.monto)}</td><td class="muy-peq mut">${esc(h.creado_por || '')}</td></tr>`).join('')}</table></details>` : ''}
    </div>`).join('')}

    <h2>Servicios</h2>
    <div class="tarjeta">
      ${ts.map(t => `<div class="entre" style="padding:8px 0;border-bottom:1px solid #eeece4;${t.activo ? '' : 'opacity:.55'}">
        <span><b>${esc(t.nombre)}</b><br><span class="muy-peq mut">${MODOS[t.modo_cobro]} · por defecto ${FRECUENCIAS[t.frecuencia_default] || ''}${t.activo ? '' : ' · inactivo'}</span></span>
        <button class="btn chico" data-srv="${t.id}">Editar</button></div>`).join('')}
      <button class="btn bloque" style="margin-top:10px" data-srv-nuevo>${ICONOS.mas} Nuevo tipo de servicio</button>
    </div>

    <h2>Jardineros</h2>
    <div class="tarjeta">
      ${jardineros(false).map(j => `<div class="entre" style="padding:6px 0"><span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(j.color)};margin-right:6px"></span><b>${esc(j.nombre)}</b>${j.activo ? '' : ' <span class="muy-peq mut">(inactivo)</span>'}</span>
        <button class="btn-texto" data-jard="${j.id}">Editar</button></div>`).join('')}
      <div class="fila" style="margin-top:8px"><button class="btn chico" data-jard-nuevo>${ICONOS.mas} Agregar</button><a class="btn chico" href="#/equipo">Ver equipo</a></div>
    </div>

    <h2>Preferencias</h2>
    <div class="tarjeta">
      <label class="campo"><span>Programar trabajos con anticipación de</span>
        <div class="fila"><input type="number" min="1" max="26" data-cfg="horizonte_semanas" value="${cfg('horizonte_semanas', 8)}" style="width:100px"> semanas</div>
        <small>Los trabajos recurrentes se generan solos hasta esa distancia.</small></label>
      <label class="check-linea"><input type="checkbox" data-cfg="asignar_habitual" ${cfg('asignar_habitual', true) ? 'checked' : ''}> Asignar automáticamente el jardinero habitual a los trabajos nuevos</label>
      <label class="campo"><span>Avisar visitas de los próximos</span>
        <div class="fila"><input type="number" min="1" max="14" data-cfg="dias_proximos" value="${cfg('dias_proximos', 3)}" style="width:100px"> días</div></label>
      <label class="campo"><span>Motivos rápidos de reprogramación</span><input type="text" data-cfg-lista="motivos_reprogramacion" value="${esc(cfg('motivos_reprogramacion', []).join(', '))}"><small>Separados por coma</small></label>
      <label class="campo"><span>Motivos rápidos de cancelación</span><input type="text" data-cfg-lista="motivos_cancelacion" value="${esc(cfg('motivos_cancelacion', []).join(', '))}"></label>
      <label class="campo"><span>Observaciones rápidas de clientes</span><input type="text" data-cfg-lista="observaciones_rapidas" value="${esc(cfg('observaciones_rapidas', []).join(', '))}"></label>
      <button class="btn prim" data-guardar-pref>Guardar preferencias</button>
    </div>

    <h2>Datos</h2>
    <div class="tarjeta">
      ${modo() === 'local' ? `<p style="margin-top:0"><b>Modo local:</b> los datos se guardan <b>solo en este dispositivo</b> (en el navegador). Hacé un respaldo seguido y no borres los datos del navegador. Cuando esté la cuenta de Supabase, los datos se mudan con "Exportar" → "Importar".</p>`
        : `<p style="margin-top:0">Datos guardados en la nube (Supabase). Usuario: <b>${esc(c.perfil?.nombre || '')}</b></p>`}
      <div class="grilla dos">
        <button class="btn" data-exportar>Exportar respaldo (.json)</button>
        <label class="btn" style="cursor:pointer">Importar respaldo<input type="file" accept="application/json,.json" data-importar hidden></label>
      </div>
      ${c.hay_demo ? `<button class="btn borde-peligro bloque" style="margin-top:10px" data-demo>Borrar clientes de demostración</button>` : ''}
      ${modo() === 'local' ? `<button class="btn-texto" style="margin-top:10px;color:var(--peligro)" data-reset>Empezar de cero (borra toda la base de este dispositivo)</button>` : ''}
      ${modo() === 'supabase' ? `<div class="grilla dos" style="margin-top:10px"><button class="btn" data-clave>Cambiar contraseña</button><button class="btn" data-salir>Cerrar sesión</button></div>` : ''}
    </div>
    <p class="muy-peq mut" style="text-align:center;margin-top:20px">Parques Norte · v1</p>`;

  // tarifas
  v.querySelectorAll('[data-guardar-tarifa]').forEach(b => b.onclick = async () => {
    const inp = b.parentElement.querySelector('[data-tarifa]');
    const monto = Number(inp.value);
    if (inp.value === '' || monto < 0) return inp.classList.add('error-campo');
    const t = ts.find(x => x.id === inp.dataset.tarifa);
    if (!await confirmar(`¿Cambiar la tarifa de <b>${esc(t.nombre)}</b>${inp.dataset.prop ? ` (${inp.dataset.prop === 'comun' ? 'común' : 'esquina'})` : ''} a <b>${pesos(monto)}</b> desde hoy?`, { ok: 'Cambiar tarifa' })) return;
    hacer(() => rpc('cambiar_tarifa', { p_tipo: t.id, p_propiedad: inp.dataset.prop || null, p_monto: monto }),
      { ok: r => `Tarifa actualizada · ${r.trabajos_actualizados} visita(s) pendiente(s) con precio nuevo` }).catch(() => {});
  });
  // servicios
  v.querySelectorAll('[data-srv]').forEach(b => b.onclick = () => formTipo(ts.find(t => t.id === b.dataset.srv)));
  v.querySelector('[data-srv-nuevo]').onclick = () => formTipo(null);
  // jardineros
  v.querySelectorAll('[data-jard]').forEach(b => b.onclick = () => formJardinero(jardineros(false).find(j => j.id === b.dataset.jard), () => estado.refrescar()));
  v.querySelector('[data-jard-nuevo]').onclick = () => formJardinero(null, () => estado.refrescar());
  // preferencias
  v.querySelector('[data-guardar-pref]').onclick = async () => {
    try {
      for (const el of v.querySelectorAll('[data-cfg]')) {
        const val = el.type === 'checkbox' ? el.checked : Number(el.value);
        if (val !== cfg(el.dataset.cfg)) await rpc('guardar_config', { p_clave: el.dataset.cfg, p_valor: json(val) });
      }
      for (const el of v.querySelectorAll('[data-cfg-lista]')) {
        const lista = el.value.split(',').map(s => s.trim()).filter(Boolean);
        await rpc('guardar_config', { p_clave: el.dataset.cfgLista, p_valor: json(lista) });
      }
      toast('Preferencias guardadas');
      await estado.refrescar();
    } catch (e) { toast(e.message, { error: true }); }
  };
  // datos
  v.querySelector('[data-exportar]').onclick = async () => {
    try {
      const d = await rpc('api_exportar');
      const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `parques-norte-respaldo-${hoyISO()}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      toast(`Respaldo descargado (${d.clientes.length} clientes, ${d.trabajos.length} trabajos)`);
    } catch (e) { toast(e.message, { error: true }); }
  };
  v.querySelector('[data-importar]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    let d;
    try { d = JSON.parse(await f.text()); } catch { return toast('El archivo no es válido', { error: true }); }
    if (d.app !== 'parques-norte') return toast('El archivo no es un respaldo de Parques Norte', { error: true });
    if (!await confirmar(`Se van a <b>reemplazar todos los datos</b> por los del respaldo (${d.clientes.length} clientes, ${d.trabajos.length} trabajos, exportado el ${ddmmaa(String(d.exportado).slice(0, 10))}). ¿Seguir?`, { ok: 'Reemplazar datos', peligro: true })) return;
    hacer(() => rpc('api_importar', { p: d }), { ok: r => `Importado: ${r.clientes} clientes, ${r.trabajos} trabajos` }).catch(() => {});
  };
  v.querySelector('[data-demo]')?.addEventListener('click', async () => {
    if (!await confirmar('¿Borrar los 8 clientes de demostración y todos sus trabajos y cobros? Tus clientes reales no se tocan.', { ok: 'Borrar demo', peligro: true })) return;
    hacer(() => rpc('borrar_demo'), { ok: r => `${r.clientes_borrados} clientes de demostración borrados` }).catch(() => {});
  });
  v.querySelector('[data-reset]')?.addEventListener('click', async () => {
    if (!await confirmar('Esto borra <b>TODA</b> la base de este dispositivo (clientes, trabajos, cobros). Se vuelve a crear vacía con los datos de demostración. ¿Exportaste un respaldo?', { ok: 'Borrar todo', peligro: true })) return;
    await borrarBaseLocal(); location.reload();
  });
  v.querySelector('[data-salir]')?.addEventListener('click', async () => { await salir(); location.reload(); });
  v.querySelector('[data-clave]')?.addEventListener('click', () => abrirHoja({
    titulo: 'Cambiar contraseña',
    cuerpo: `<label class="campo"><span>Contraseña nueva <em>*</em></span><input type="password" data-c1 autocomplete="new-password" minlength="8" autofocus><small>Mínimo 8 caracteres.</small></label>
      <label class="campo"><span>Repetila <em>*</em></span><input type="password" data-c2 autocomplete="new-password"></label>`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>Guardar</button>`,
    alAbrir: h => {
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const c1 = h.$('[data-c1]').value, c2 = h.$('[data-c2]').value;
        if (c1.length < 8) return toast('La contraseña debe tener al menos 8 caracteres', { error: true });
        if (c1 !== c2) return toast('Las dos contraseñas no coinciden', { error: true });
        try { await cambiarClave(c1); toast('Contraseña cambiada'); h.cerrar(); } catch (e) { toast(e.message, { error: true }); }
      };
    }
  }));
}

function formTipo(t) {
  abrirHoja({
    titulo: t ? `Editar ${t.nombre}` : 'Nuevo tipo de servicio',
    cuerpo: `<label class="campo"><span>Nombre <em>*</em></span><input type="text" name="nombre" value="${esc(t?.nombre || '')}" autofocus></label>
      ${t ? `<p class="peq mut">Modo de cobro: <b>${MODOS[t.modo_cobro]}</b> (no se cambia para no alterar el historial).</p>` : `
      <div class="campo"><span>¿Cómo se cobra? <em>*</em></span>
        ${Object.entries(MODOS).map(([k, n]) => `<label class="radio-tarj"><input type="radio" name="modo" value="${k}" ${k === 'por_visita' ? 'checked' : ''}><span><b>${n}</b><br><small class="mut">${{ por_visita: 'Un precio cada vez que se hace', abono_mensual: 'Un precio fijo por mes, las visitas van incluidas', por_bloque: 'Precio por bloque de tiempo (ej. 1 h 30)' }[k]}</small></span></label>`).join('')}</div>
      <label class="check-linea"><input type="checkbox" name="usa_prop" checked> Precio distinto para propiedad común y esquina</label>`}
      <label class="campo" data-min ${t?.modo_cobro === 'por_bloque' ? '' : 'hidden'}><span>Minutos por bloque</span><input type="number" name="minutos" min="15" step="15" value="${t?.minutos_bloque || 90}"></label>
      <label class="campo"><span>Frecuencia por defecto</span><select name="frec">${Object.entries(FRECUENCIAS).map(([k, n]) => `<option value="${k}" ${(t?.frecuencia_default || 'puntual') === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${t ? `<label class="check-linea"><input type="checkbox" name="activo" ${t.activo ? 'checked' : ''}> Activo (se puede contratar)</label>` : ''}
      ${!t ? `<p class="peq mut">Después de crearlo, cargá su tarifa en la sección Tarifas.</p>` : ''}`,
    pie: `<button class="btn" data-no>Volver</button><button class="btn prim" data-si>Guardar</button>`,
    alAbrir: h => {
      h.$$('input[name=modo]').forEach(r => r.onchange = () => { h.$('[data-min]').hidden = r.value !== 'por_bloque' || !r.checked; });
      h.$('[data-no]').onclick = h.cerrar;
      h.$('[data-si]').onclick = async () => {
        const nombre = exigir(h, '[name=nombre]', 'El nombre es obligatorio'); if (!nombre) return;
        const modo = t ? t.modo_cobro : h.$('input[name=modo]:checked').value;
        try {
          await hacer(async () => {
            const id = await rpc('guardar_tipo_servicio', { p: {
              id: t?.id || null, nombre, modo_cobro: modo, minutos_bloque: modo === 'por_bloque' ? Number(h.$('[name=minutos]').value) || 90 : null,
              usa_tipo_propiedad: t ? t.usa_tipo_propiedad : h.$('[name=usa_prop]').checked, frecuencia_default: h.$('[name=frec]').value,
              activo: t ? h.$('[name=activo]').checked : true
            } });
            if (!t) await rpc('cambiar_tarifa', { p_tipo: id, p_propiedad: null, p_monto: 0 });
          }, { ok: t ? 'Servicio guardado' : 'Servicio creado: cargale la tarifa' });
          h.cerrar();
        } catch {}
      };
    }
  });
}
