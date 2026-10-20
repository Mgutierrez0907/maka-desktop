const SUPABASE_URL = 'https://weogaglkqshgwdhpkagn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cqp7jMes8kqIuquE3YFk2A_i58ivrsO';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
const LOGO_URL = new URL('assets/logo.png', document.baseURI).href;

let currentUser = null;
let currentPerfil = null; // { id, nombre, rol }

// Contexto de "venir desde un Pedido" — se usa para prellenar Presupuestos
// o Ventas cuando se llega ahí con el botón "Armar presupuesto" / "Registrar
// venta" de la pantalla Pedidos. Se limpia apenas se consume.
let pedidoParaPresupuesto = null; // { codigo, cliente_id }
let pedidoParaVenta = null; // { codigo, cliente_id }

const TALLAS_OPCIONES = [
  { grupo: 'Infantil', valores: ['2', '4', '6', '8', '10', '12', '14', '16'] },
  { grupo: 'Adulto', valores: ['S', 'M', 'L', 'XL'] },
];
const CORTE_OPCIONES = ['Slim fit', 'Clásica', 'Oversize'];

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const content = document.getElementById('content');

// ============================================================
// Autenticación
// ============================================================

document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error');
  errorBox.textContent = '';

  if (!email || !password) {
    errorBox.textContent = 'Completá correo y contraseña.';
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    errorBox.textContent = 'No se pudo iniciar sesión: ' + error.message;
    return;
  }

  await afterLogin(data.user);
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentUser = null;
  currentPerfil = null;
  appScreen.style.display = 'none';
  loginScreen.style.display = 'flex';
});

async function afterLogin(user) {
  currentUser = user;

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error || !perfil) {
    document.getElementById('login-error').textContent =
      'Tu usuario no tiene un perfil asignado todavía (tabla perfiles). Avisale al admin.';
    await supabase.auth.signOut();
    return;
  }

  currentPerfil = perfil;
  document.getElementById('user-role-label').textContent =
    perfil.rol === 'admin' ? 'Administrador' : 'Ventas';
  document.getElementById('user-email-label').textContent = user.email;

  // Ocultar ítems solo-admin si corresponde
  document.querySelectorAll('[data-admin-only]').forEach((el) => {
    el.style.display = perfil.rol === 'admin' ? 'block' : 'none';
  });

  loginScreen.style.display = 'none';
  appScreen.style.display = 'grid';

  goToView('resumen');
}

// Restaurar sesión si ya había un login previo (persistSession)
supabase.auth.getSession().then(({ data }) => {
  if (data.session && data.session.user) {
    afterLogin(data.session.user);
  }
});

// ============================================================
// Navegación
// ============================================================

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => goToView(item.dataset.view));
});

const views = {
  resumen: viewResumen,
  materiaPrima: viewMateriaPrima,
  productos: viewProductos,
  equipos: viewEquipos,
  disenos: viewDisenos,
  produccion: viewProduccion,
  clientes: viewClientes,
  ventas: viewVentas,
  presupuestos: viewPresupuestos,
  pedidos: viewPedidos,
  compras: viewCompras,
  config: viewConfig,
};

function goToView(name) {
  document.querySelectorAll('.nav-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.view === name);
  });
  content.innerHTML = '<p>Cargando...</p>';
  views[name]().catch((err) => {
    content.innerHTML = `<p class="msg err">Error: ${err.message}</p>`;
  });
}

function fmt(n) {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isAdmin() {
  return currentPerfil && currentPerfil.rol === 'admin';
}

// Etapas de producción de un pedido (independiente del estado comercial
// pendiente/aprobado/etc., que sigue al presupuesto y a la venta).
const ETAPAS_PEDIDO = ['Presupuestado', 'En diseño', 'Para impresión', 'Producción', 'Listo para entrega'];

// Un pago expresado en USD: los pagos en VES se convierten con la tasa
// BCV con la que se registraron.
function pagoEnUsd(p) {
  const monto = Number(p.monto);
  if (p.moneda === 'VES') {
    const tasa = Number(p.tasa_cambio_bcv_aplicada);
    return tasa > 0 ? monto / tasa : 0;
  }
  return monto;
}

// ============================================================
// Resumen
// ============================================================

async function viewResumen() {
  const { data: productos } = await supabase.from('productos').select('codigo,nombre,stock');
  const { data: materiales } = await supabase.from('materia_prima').select('codigo,nombre,stock');
  const { data: pedidosResumen } = await supabase.from('pedidos').select('estado,etapa');
  const { data: ventasRecientes } = await supabase
    .from('ventas')
    .select('numero_factura,fecha,gran_total,moneda_pago,cliente_id')
    .order('fecha', { ascending: false })
    .limit(8);

  const stockTotalProductos = (productos || []).reduce((a, p) => a + Number(p.stock), 0);
  const bajoStock = (productos || []).filter((p) => Number(p.stock) <= 3);
  const pedidosActivos = (pedidosResumen || []).filter((p) => !['completado', 'rechazado'].includes(p.estado));
  const pedidosListos = pedidosActivos.filter((p) => p.etapa === 'Listo para entrega');
  const conteoEtapas = ETAPAS_PEDIDO.map((et) => ({ etapa: et, n: pedidosActivos.filter((p) => p.etapa === et).length }));
  const sinEtapa = pedidosActivos.filter((p) => !p.etapa).length;

  content.innerHTML = `
    <h2>Resumen</h2>
    <div class="stat-row">
      <div class="stat"><div class="label">Productos (SKUs)</div><div class="value">${(productos || []).length}</div></div>
      <div class="stat"><div class="label">Unidades en stock</div><div class="value">${fmt(stockTotalProductos)}</div></div>
      <div class="stat"><div class="label">Materiales (SKUs)</div><div class="value">${(materiales || []).length}</div></div>
      <div class="stat"><div class="label">Con stock bajo (≤3)</div><div class="value">${bajoStock.length}</div></div>
      <div class="stat"><div class="label">Pedidos activos</div><div class="value">${pedidosActivos.length}</div></div>
      <div class="stat"><div class="label">Listos para entrega</div><div class="value">${pedidosListos.length}</div></div>
    </div>

    <div class="card">
      <h3>Pedidos activos por etapa</h3>
      <table>
        <tr><th>Etapa</th><th>Pedidos</th></tr>
        ${conteoEtapas.map((c) => `<tr><td>${c.etapa}</td><td>${c.n}</td></tr>`).join('')}
        <tr><td style="color:var(--muted);">Sin etapa asignada</td><td>${sinEtapa}</td></tr>
      </table>
    </div>

    <div class="card">
      <h3>Stock de producto terminado</h3>
      <table>
        <tr><th>Código</th><th>Nombre</th><th>Stock</th></tr>
        ${(productos || [])
          .map((p) => `<tr><td>${p.codigo}</td><td>${p.nombre}</td><td>${fmt(p.stock)}</td></tr>`)
          .join('')}
      </table>
    </div>

    <div class="card">
      <h3>Últimas ventas</h3>
      <table>
        <tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Moneda</th></tr>
        ${(ventasRecientes || [])
          .map(
            (v) =>
              `<tr><td>#${v.numero_factura}</td><td>${v.fecha}</td><td>${v.cliente_id || '-'}</td><td>${fmt(v.gran_total)}</td><td>${v.moneda_pago}</td></tr>`
          )
          .join('')}
      </table>
    </div>
  `;
}

// ============================================================
// Materia prima
// ============================================================

async function viewMateriaPrima() {
  const { data: materiales } = await supabase.from('materia_prima').select('*').order('codigo');

  content.innerHTML = `
    <h2>Materia prima</h2>
    ${isAdmin() ? `
    <form class="inline-form" id="form-material">
      <input type="hidden" name="_editing" value="" />
      <div class="field">Código<input name="codigo" required placeholder="FR001" /></div>
      <div class="field">Nombre<input name="nombre" required placeholder="Franela blanca" /></div>
      <div class="field">Unidad<input name="unidad" required placeholder="unidad" /></div>
      <div class="field">Categoría<input name="categoria" placeholder="Textil" /></div>
      <button type="submit" id="material-submit-btn">Agregar</button>
      <button type="button" id="material-cancel-btn" style="display:none;background:var(--panel-2);">Cancelar</button>
    </form>
    <p style="color:var(--muted);font-size:13px;">
      El stock y el costo unitario no se editan acá — se actualizan solos cada vez que registrás
      una <strong>Compra</strong> de este material (el costo queda como promedio ponderado). Esta
      pantalla solo sirve para dar de alta un material nuevo o corregir su nombre/unidad/categoría.
    </p>
    <div id="material-msg" class="msg"></div>
    ` : ''}
    <table>
      <tr><th>Código</th><th>Nombre</th><th>Unidad</th><th>Stock</th><th>Costo unit. (USD)</th><th>Categoría</th><th>Estado</th>${isAdmin() ? '<th></th>' : ''}</tr>
      ${(materiales || [])
        .map(
          (m) =>
            `<tr data-codigo="${m.codigo}"><td>${m.codigo}</td><td>${m.nombre}</td><td>${m.unidad}</td><td>${fmt(m.stock)}</td><td>${fmt(m.costo_unitario)}</td><td>${m.categoria || '-'}</td>
              <td>${m.activo === false ? '<span class="badge" style="color:var(--muted);">Inactivo</span>' : '<span class="badge" style="color:var(--ok);">Activo</span>'}</td>
              ${isAdmin() ? `<td>
                <span class="badge edit-material" style="cursor:pointer;">Editar</span>
                ${m.activo === false
                  ? `<span class="badge activar-material" style="cursor:pointer;color:var(--ok);">Reactivar</span>`
                  : `<span class="badge delete-material" style="cursor:pointer;color:var(--err);">Eliminar</span>`}
              </td>` : ''}
            </tr>`
        )
        .join('')}
    </table>
  `;

  const form = document.getElementById('form-material');
  if (!form) return;

  const codigoInput = form.elements['codigo'];
  const submitBtn = document.getElementById('material-submit-btn');
  const cancelBtn = document.getElementById('material-cancel-btn');

  function resetForm() {
    form.reset();
    form.elements['_editing'].value = '';
    codigoInput.disabled = false;
    submitBtn.textContent = 'Agregar';
    cancelBtn.style.display = 'none';
  }

  cancelBtn.addEventListener('click', resetForm);

  content.querySelectorAll('.edit-material').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.closest('tr').dataset.codigo;
      const m = (materiales || []).find((x) => x.codigo === codigo);
      if (!m) return;
      form.elements['codigo'].value = m.codigo;
      form.elements['nombre'].value = m.nombre;
      form.elements['unidad'].value = m.unidad;
      form.elements['categoria'].value = m.categoria || '';
      form.elements['_editing'].value = codigo;
      codigoInput.disabled = true;
      submitBtn.textContent = 'Guardar cambios';
      cancelBtn.style.display = 'inline-block';
      content.scrollIntoView({ behavior: 'smooth' });
    });
  });

  content.querySelectorAll('.delete-material').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.closest('tr').dataset.codigo;
      if (!confirm(`¿Eliminar el material ${codigo}?`)) return;
      const { error } = await supabase.from('materia_prima').delete().eq('codigo', codigo);
      if (error) {
        if (error.code === '23503') {
          if (confirm(`${codigo} ya tiene compras o recetas asociadas, así que no se puede borrar sin perder ese historial.\n\n¿Lo desactivo en su lugar? (deja de aparecer para usarlo en recetas nuevas, pero conserva todo lo registrado)`)) {
            const { error: err2 } = await supabase.from('materia_prima').update({ activo: false }).eq('codigo', codigo);
            if (err2) alert('No se pudo desactivar: ' + err2.message);
            else goToView('materiaPrima');
          }
        } else {
          alert('No se pudo eliminar: ' + error.message);
        }
      } else {
        goToView('materiaPrima');
      }
    });
  });

  content.querySelectorAll('.activar-material').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.closest('tr').dataset.codigo;
      const { error } = await supabase.from('materia_prima').update({ activo: true }).eq('codigo', codigo);
      if (error) alert('No se pudo reactivar: ' + error.message);
      else goToView('materiaPrima');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const editingCodigo = payload._editing;
    delete payload._editing;

    const msg = document.getElementById('material-msg');
    const query = editingCodigo
      ? supabase.from('materia_prima').update(payload).eq('codigo', editingCodigo)
      : supabase.from('materia_prima').insert(payload);

    const { error } = await query;
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = editingCodigo ? 'Material actualizado.' : 'Material agregado.';
      goToView('materiaPrima');
    }
  });
}

// ============================================================
// Productos
// ============================================================

async function viewProductos() {
  const { data: productos } = await supabase.from('productos').select('*').order('codigo');
  const { data: disenos } = await supabase.from('disenos').select('id,nombre').eq('activo', true);
  const { data: materiales } = await supabase.from('materia_prima').select('codigo,nombre').eq('activo', true);

  content.innerHTML = `
    <h2>Productos</h2>
    ${isAdmin() ? `
    <form class="inline-form" id="form-producto">
      <input type="hidden" name="_editing" value="" />
      <div class="field">Código<input name="codigo" required placeholder="CAM-KNY" /></div>
      <div class="field">Nombre<input name="nombre" required placeholder="Camisa Konoha" /></div>
      <div class="field">Diseño
        <select name="diseno_id">
          <option value="">(ninguno)</option>
          ${(disenos || []).map((d) => `<option value="${d.id}">${d.id} — ${d.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="field">Precio base (USD)<input name="precio_base" type="number" step="0.000001" required /></div>
      <div class="field">Costo (USD)<input name="costo" type="number" step="0.000001" value="0" /></div>
      <div class="field">IVA %<input name="porcentaje_iva" type="number" step="0.01" value="16" /></div>
      <div class="field">Exento
        <select name="es_exento"><option value="false">No</option><option value="true">Sí</option></select>
      </div>
      <div class="field">Corte
        <select name="corte">
          <option value="">(no aplica)</option>
          ${CORTE_OPCIONES.map((c) => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="field">Talla
        <select name="talla">
          <option value="">(no aplica)</option>
          ${TALLAS_OPCIONES.map(
            (g) => `<optgroup label="${g.grupo}">${g.valores.map((v) => `<option value="${v}">${v}</option>`).join('')}</optgroup>`
          ).join('')}
        </select>
      </div>
      <div class="field">Stock<input name="stock" type="number" step="0.0001" value="0" /></div>
      <div class="field">Categoría<input name="categoria" placeholder="Camisas" /></div>
      <button type="submit" id="producto-submit-btn">Agregar</button>
      <button type="button" id="producto-cancel-btn" style="display:none;background:var(--panel-2);">Cancelar</button>
    </form>
    <div id="producto-msg" class="msg"></div>
    ` : ''}
    <table>
      <tr><th>Código</th><th>Nombre</th><th>Corte</th><th>Talla</th><th>Precio base</th><th>IVA%</th><th>Exento</th><th>Stock</th><th>Estado</th>${isAdmin() ? '<th></th>' : ''}</tr>
      ${(productos || [])
        .map(
          (p) =>
            `<tr data-codigo="${p.codigo}"><td>${p.codigo}</td><td>${p.nombre}</td><td>${p.corte || '-'}</td><td>${p.talla || '-'}</td><td>${fmt(p.precio_base)}</td><td>${p.porcentaje_iva}</td><td>${p.es_exento ? 'Sí' : 'No'}</td><td>${fmt(p.stock)}</td>
              <td>${p.activo === false ? '<span class="badge" style="color:var(--muted);">Inactivo</span>' : '<span class="badge" style="color:var(--ok);">Activo</span>'}</td>
              ${isAdmin() ? `<td>
                <span class="badge edit-producto" style="cursor:pointer;">Editar</span>
                ${p.activo === false
                  ? `<span class="badge activar-producto" style="cursor:pointer;color:var(--ok);">Reactivar</span>`
                  : `<span class="badge delete-producto" style="cursor:pointer;color:var(--err);">Eliminar</span>`}
              </td>` : ''}
            </tr>`
        )
        .join('')}
    </table>

    ${isAdmin() ? `
    <div class="card">
      <h3>Receta de un producto</h3>
      <p style="color:var(--muted);font-size:13px;">
        Definí de qué materiales se compone cada producto y en qué cantidad. Esto es lo que usa
        "Producción" para descontar materia prima automáticamente al armar un lote.
      </p>
      <div class="inline-form">
        <div class="field">Producto
          <select id="receta-producto-select">
            <option value="">Elegí un producto...</option>
            ${(productos || []).map((p) => `<option value="${p.codigo}">${p.codigo} — ${p.nombre}</option>`).join('')}
          </select>
        </div>
      </div>
      <div id="receta-detalle"></div>
    </div>
    ` : ''}
  `;

  // ---- alta / edición de producto ----
  const form = document.getElementById('form-producto');
  if (form) {
    const codigoInput = form.elements['codigo'];
    const submitBtn = document.getElementById('producto-submit-btn');
    const cancelBtn = document.getElementById('producto-cancel-btn');

    cancelBtn.addEventListener('click', () => {
      form.reset();
      form.elements['_editing'].value = '';
      codigoInput.disabled = false;
      submitBtn.textContent = 'Agregar';
      cancelBtn.style.display = 'none';
    });

    content.querySelectorAll('.edit-producto').forEach((el) => {
      el.addEventListener('click', () => {
        const codigo = el.closest('tr').dataset.codigo;
        const p = (productos || []).find((x) => x.codigo === codigo);
        if (!p) return;
        form.elements['codigo'].value = p.codigo;
        form.elements['nombre'].value = p.nombre;
        form.elements['diseno_id'].value = p.diseno_id || '';
        form.elements['precio_base'].value = p.precio_base;
        form.elements['costo'].value = p.costo;
        form.elements['porcentaje_iva'].value = p.porcentaje_iva;
        form.elements['es_exento'].value = String(p.es_exento);
        form.elements['corte'].value = p.corte || '';
        form.elements['talla'].value = p.talla || '';
        form.elements['stock'].value = p.stock;
        form.elements['categoria'].value = p.categoria || '';
        form.elements['_editing'].value = codigo;
        codigoInput.disabled = true;
        submitBtn.textContent = 'Guardar cambios';
        cancelBtn.style.display = 'inline-block';
        content.scrollIntoView({ behavior: 'smooth' });
      });
    });

    content.querySelectorAll('.delete-producto').forEach((el) => {
      el.addEventListener('click', async () => {
        const codigo = el.closest('tr').dataset.codigo;
        if (!confirm(`¿Eliminar el producto ${codigo}?`)) return;
        const { error } = await supabase.from('productos').delete().eq('codigo', codigo);
        if (error) {
          if (error.code === '23503') {
            if (confirm(`${codigo} ya tiene ventas, lotes de producción o receta asociados, así que no se puede borrar sin perder ese historial.\n\n¿Lo desactivo en su lugar? (deja de aparecer para vender/producir, pero conserva todo lo registrado)`)) {
              const { error: err2 } = await supabase.from('productos').update({ activo: false }).eq('codigo', codigo);
              if (err2) alert('No se pudo desactivar: ' + err2.message);
              else goToView('productos');
            }
          } else {
            alert('No se pudo eliminar: ' + error.message);
          }
        } else {
          goToView('productos');
        }
      });
    });

    content.querySelectorAll('.activar-producto').forEach((el) => {
      el.addEventListener('click', async () => {
        const codigo = el.closest('tr').dataset.codigo;
        const { error } = await supabase.from('productos').update({ activo: true }).eq('codigo', codigo);
        if (error) alert('No se pudo reactivar: ' + error.message);
        else goToView('productos');
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      const editingCodigo = payload._editing;
      delete payload._editing;
      payload.precio_base = Number(payload.precio_base);
      payload.costo = Number(payload.costo);
      payload.porcentaje_iva = Number(payload.porcentaje_iva);
      payload.es_exento = payload.es_exento === 'true';
      payload.stock = Number(payload.stock);
      if (!payload.diseno_id) delete payload.diseno_id;
      if (!payload.corte) delete payload.corte;
      if (!payload.talla) delete payload.talla;

      const msg = document.getElementById('producto-msg');
      const query = editingCodigo
        ? supabase.from('productos').update(payload).eq('codigo', editingCodigo)
        : supabase.from('productos').insert(payload);

      const { error } = await query;
      if (error) {
        msg.className = 'msg err';
        msg.textContent = error.message;
      } else {
        msg.className = 'msg ok';
        msg.textContent = editingCodigo ? 'Producto actualizado.' : 'Producto agregado.';
        goToView('productos');
      }
    });
  }

  // ---- receta de un producto ----
  const recetaSelect = document.getElementById('receta-producto-select');
  if (recetaSelect) {
    recetaSelect.addEventListener('change', () => renderReceta(recetaSelect.value, materiales || []));
  }
}

async function renderReceta(productoCodigo, materiales) {
  const box = document.getElementById('receta-detalle');
  if (!productoCodigo) {
    box.innerHTML = '';
    return;
  }

  const { data: componentes } = await supabase
    .from('receta_componentes')
    .select('id,material_codigo,cantidad')
    .eq('producto_codigo', productoCodigo);

  box.innerHTML = `
    <table>
      <tr><th>Material</th><th>Cantidad por unidad</th><th></th></tr>
      ${(componentes || [])
        .map((c) => {
          const m = materiales.find((x) => x.codigo === c.material_codigo);
          return `<tr data-id="${c.id}"><td>${c.material_codigo} — ${m ? m.nombre : ''}</td><td>${fmt(c.cantidad)}</td>
            <td><span class="badge quitar-componente" style="cursor:pointer;color:var(--err);">Quitar</span></td></tr>`;
        })
        .join('') || '<tr><td colspan="3" style="color:var(--muted);">Todavía no tiene receta.</td></tr>'}
    </table>
    <form class="inline-form" id="form-receta-item">
      <div class="field">Material
        <select name="material_codigo" required>
          <option value="">Elegí...</option>
          ${materiales.map((m) => `<option value="${m.codigo}">${m.codigo} — ${m.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="field">Cantidad por unidad<input name="cantidad" type="number" step="0.000001" required /></div>
      <button type="submit">Agregar a la receta</button>
    </form>
    <div id="receta-msg" class="msg"></div>
  `;

  box.querySelectorAll('.quitar-componente').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.closest('tr').dataset.id;
      const { error } = await supabase.from('receta_componentes').delete().eq('id', id);
      if (error) {
        alert('No se pudo quitar: ' + error.message);
      } else {
        renderReceta(productoCodigo, materiales);
      }
    });
  });

  document.getElementById('form-receta-item').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('receta-msg');
    const { error } = await supabase.from('receta_componentes').insert({
      producto_codigo: productoCodigo,
      material_codigo: fd.get('material_codigo'),
      cantidad: Number(fd.get('cantidad')),
    });
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      renderReceta(productoCodigo, materiales);
    }
  });
}

// ============================================================
// Equipos (máquinas y herramientas: planchas, papel encerado,
// quitapelusa, etc. — distinto de materia prima, no se consume
// por receta, se gestiona a mano)
// ============================================================

const ESTADOS_EQUIPO = ['Operativo', 'En reparación', 'Dañado', 'De baja'];

async function viewEquipos() {
  const { data: equipos } = await supabase.from('equipos').select('*').order('codigo');

  content.innerHTML = `
    <h2>Equipos</h2>
    <p style="color:var(--muted);font-size:13px;">
      Máquinas y herramientas de trabajo (planchas, papel encerado, quitapelusa, etc.) —
      separado de materia prima porque no se consume por receta, se gestiona a mano.
    </p>
    ${isAdmin() ? `
    <form class="inline-form" id="form-equipo">
      <input type="hidden" name="_editing" value="" />
      <div class="field">Código<input name="codigo" required placeholder="EQ001" /></div>
      <div class="field">Nombre<input name="nombre" required placeholder="Plancha térmica" /></div>
      <div class="field">Categoría<input name="categoria" placeholder="Sublimación" /></div>
      <div class="field">Cantidad<input name="cantidad" type="number" step="0.0001" value="1" /></div>
      <div class="field">Estado
        <select name="estado">${ESTADOS_EQUIPO.map((e) => `<option>${e}</option>`).join('')}</select>
      </div>
      <div class="field">Notas<input name="notas" placeholder="Opcional" /></div>
      <button type="submit" id="equipo-submit-btn">Agregar</button>
      <button type="button" id="equipo-cancel-btn" style="display:none;background:var(--panel-2);">Cancelar</button>
    </form>
    <div id="equipo-msg" class="msg"></div>
    ` : ''}
    <table>
      <tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Cantidad</th><th>Estado</th><th>Notas</th><th>Activo</th>${isAdmin() ? '<th></th>' : ''}</tr>
      ${(equipos || [])
        .map(
          (eq) =>
            `<tr data-codigo="${eq.codigo}"><td>${eq.codigo}</td><td>${eq.nombre}</td><td>${eq.categoria || '-'}</td><td>${fmt(eq.cantidad)}</td><td>${eq.estado}</td><td>${eq.notas || '-'}</td>
              <td>${eq.activo === false ? '<span class="badge" style="color:var(--muted);">Inactivo</span>' : '<span class="badge" style="color:var(--ok);">Activo</span>'}</td>
              ${isAdmin() ? `<td>
                <span class="badge edit-equipo" style="cursor:pointer;">Editar</span>
                ${eq.activo === false
                  ? `<span class="badge activar-equipo" style="cursor:pointer;color:var(--ok);">Reactivar</span>`
                  : `<span class="badge delete-equipo" style="cursor:pointer;color:var(--err);">Eliminar</span>`}
              </td>` : ''}
            </tr>`
        )
        .join('') || `<tr><td colspan="${isAdmin() ? 8 : 7}" style="color:var(--muted);">Todavía no hay equipos cargados.</td></tr>`}
    </table>
  `;

  const form = document.getElementById('form-equipo');
  if (!form) return;

  const codigoInput = form.elements['codigo'];
  const submitBtn = document.getElementById('equipo-submit-btn');
  const cancelBtn = document.getElementById('equipo-cancel-btn');

  function resetForm() {
    form.reset();
    form.elements['_editing'].value = '';
    codigoInput.disabled = false;
    submitBtn.textContent = 'Agregar';
    cancelBtn.style.display = 'none';
  }

  cancelBtn.addEventListener('click', resetForm);

  content.querySelectorAll('.edit-equipo').forEach((el) => {
    el.addEventListener('click', () => {
      const codigo = el.closest('tr').dataset.codigo;
      const eq = (equipos || []).find((x) => x.codigo === codigo);
      if (!eq) return;
      form.elements['codigo'].value = eq.codigo;
      form.elements['nombre'].value = eq.nombre;
      form.elements['categoria'].value = eq.categoria || '';
      form.elements['cantidad'].value = eq.cantidad;
      form.elements['estado'].value = eq.estado;
      form.elements['notas'].value = eq.notas || '';
      form.elements['_editing'].value = codigo;
      codigoInput.disabled = true;
      submitBtn.textContent = 'Guardar cambios';
      cancelBtn.style.display = 'inline-block';
      content.scrollIntoView({ behavior: 'smooth' });
    });
  });

  content.querySelectorAll('.delete-equipo').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.closest('tr').dataset.codigo;
      if (!confirm(`¿Eliminar el equipo ${codigo}?`)) return;
      const { error } = await supabase.from('equipos').delete().eq('codigo', codigo);
      if (error) {
        if (error.code === '23503') {
          if (confirm(`${codigo} tiene historial asociado, así que no se puede borrar.\n\n¿Lo desactivo en su lugar?`)) {
            const { error: err2 } = await supabase.from('equipos').update({ activo: false }).eq('codigo', codigo);
            if (err2) alert('No se pudo desactivar: ' + err2.message);
            else goToView('equipos');
          }
        } else {
          alert('No se pudo eliminar: ' + error.message);
        }
      } else {
        goToView('equipos');
      }
    });
  });

  content.querySelectorAll('.activar-equipo').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.closest('tr').dataset.codigo;
      const { error } = await supabase.from('equipos').update({ activo: true }).eq('codigo', codigo);
      if (error) alert('No se pudo reactivar: ' + error.message);
      else goToView('equipos');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const editingCodigo = payload._editing;
    delete payload._editing;
    payload.cantidad = Number(payload.cantidad || 0);
    if (!payload.notas) delete payload.notas;

    const msg = document.getElementById('equipo-msg');
    const query = editingCodigo
      ? supabase.from('equipos').update(payload).eq('codigo', editingCodigo)
      : supabase.from('equipos').insert(payload);

    const { error } = await query;
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = editingCodigo ? 'Equipo actualizado.' : 'Equipo agregado.';
      goToView('equipos');
    }
  });
}

// ============================================================
// Diseños (catálogo DTF, opcional — admin)
// ============================================================

async function viewDisenos() {
  const { data: disenos } = await supabase.from('disenos').select('*').order('id');

  content.innerHTML = `
    <h2>Diseños</h2>
    <p style="color:var(--muted);font-size:13px;">
      Catálogo de diseños (DTF u otros) que podés enlazar a un producto en "Productos". Es opcional —
      si no lo usás, dejá el campo "Diseño" en (ninguno) al crear productos.
    </p>
    <form class="inline-form" id="form-diseno">
      <input type="hidden" name="_editing" value="" />
      <div class="field">Código<input name="id" required placeholder="D001" /></div>
      <div class="field">Nombre<input name="nombre" required placeholder="Naruto corriendo" /></div>
      <div class="field">Tipo<input name="tipo" placeholder="DTF-TX" /></div>
      <div class="field">Costo DTF (USD)<input name="costo_dtf" type="number" step="0.000001" value="1" /></div>
      <button type="submit" id="diseno-submit-btn">Agregar</button>
      <button type="button" id="diseno-cancel-btn" style="display:none;background:var(--panel-2);">Cancelar</button>
    </form>
    <div id="diseno-msg" class="msg"></div>
    <table>
      <tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Costo DTF</th><th>Estado</th><th></th></tr>
      ${(disenos || [])
        .map(
          (d) =>
            `<tr data-id="${d.id}"><td>${d.id}</td><td>${d.nombre}</td><td>${d.tipo || '-'}</td><td>${fmt(d.costo_dtf)}</td>
              <td>${d.activo === false ? '<span class="badge" style="color:var(--muted);">Inactivo</span>' : '<span class="badge" style="color:var(--ok);">Activo</span>'}</td>
              <td>
                <span class="badge edit-diseno" style="cursor:pointer;">Editar</span>
                ${d.activo === false
                  ? `<span class="badge activar-diseno" style="cursor:pointer;color:var(--ok);">Reactivar</span>`
                  : (isAdmin() ? `<span class="badge delete-diseno" style="cursor:pointer;color:var(--err);">Eliminar</span>` : '')}
              </td>
            </tr>`
        )
        .join('')}
    </table>
  `;

  const form = document.getElementById('form-diseno');
  const idInput = form.elements['id'];
  const submitBtn = document.getElementById('diseno-submit-btn');
  const cancelBtn = document.getElementById('diseno-cancel-btn');

  cancelBtn.addEventListener('click', () => {
    form.reset();
    form.elements['_editing'].value = '';
    idInput.disabled = false;
    submitBtn.textContent = 'Agregar';
    cancelBtn.style.display = 'none';
  });

  content.querySelectorAll('.edit-diseno').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.closest('tr').dataset.id;
      const d = (disenos || []).find((x) => x.id === id);
      if (!d) return;
      form.elements['id'].value = d.id;
      form.elements['nombre'].value = d.nombre;
      form.elements['tipo'].value = d.tipo || '';
      form.elements['costo_dtf'].value = d.costo_dtf;
      form.elements['_editing'].value = id;
      idInput.disabled = true;
      submitBtn.textContent = 'Guardar cambios';
      cancelBtn.style.display = 'inline-block';
      content.scrollIntoView({ behavior: 'smooth' });
    });
  });

  content.querySelectorAll('.delete-diseno').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.closest('tr').dataset.id;
      if (!confirm(`¿Eliminar el diseño ${id}?`)) return;
      const { error } = await supabase.from('disenos').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') {
          if (confirm(`${id} ya está enlazado a algún producto, así que no se puede borrar sin perder esa referencia.\n\n¿Lo desactivo en su lugar?`)) {
            const { error: err2 } = await supabase.from('disenos').update({ activo: false }).eq('id', id);
            if (err2) alert('No se pudo desactivar: ' + err2.message);
            else goToView('disenos');
          }
        } else {
          alert('No se pudo eliminar: ' + error.message);
        }
      } else {
        goToView('disenos');
      }
    });
  });

  content.querySelectorAll('.activar-diseno').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.closest('tr').dataset.id;
      const { error } = await supabase.from('disenos').update({ activo: true }).eq('id', id);
      if (error) alert('No se pudo reactivar: ' + error.message);
      else goToView('disenos');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const editingId = payload._editing;
    delete payload._editing;
    payload.costo_dtf = Number(payload.costo_dtf);

    const msg = document.getElementById('diseno-msg');
    const query = editingId
      ? supabase.from('disenos').update(payload).eq('id', editingId)
      : supabase.from('disenos').insert(payload);

    const { error } = await query;
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = editingId ? 'Diseño actualizado.' : 'Diseño agregado.';
      goToView('disenos');
    }
  });
}

// ============================================================
// Producción (arma un producto desde su receta)
// ============================================================

async function viewProduccion() {
  const { data: productos } = await supabase.from('productos').select('codigo,nombre').eq('activo', true);
  const { data: lotes } = await supabase
    .from('lotes_produccion')
    .select('codigo,fecha,producto_codigo,cantidad')
    .order('fecha', { ascending: false })
    .limit(15);

  content.innerHTML = `
    <h2>Producción</h2>
    <p style="color:var(--muted);font-size:13px;">
      Arma un producto terminado según su receta (descuenta materia prima automáticamente).
      La receta de cada producto (de qué materiales se compone y cuánto lleva) se define en
      Productos → "Receta de un producto".
    </p>
    <form class="inline-form" id="form-produccion">
      <div class="field">Producto
        <select name="producto_codigo" required>
          <option value="">Elegí...</option>
          ${(productos || []).map((p) => `<option value="${p.codigo}">${p.codigo} — ${p.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="field">Cantidad a producir<input name="cantidad" type="number" step="0.0001" required /></div>
      <button type="submit">Producir</button>
    </form>
    <div id="produccion-msg" class="msg"></div>

    <div class="card">
      <h3>Últimos lotes</h3>
      <table>
        <tr><th>Lote</th><th>Fecha</th><th>Producto</th><th>Cantidad</th></tr>
        ${(lotes || [])
          .map((l) => `<tr><td>${l.codigo}</td><td>${l.fecha}</td><td>${l.producto_codigo}</td><td>${fmt(l.cantidad)}</td></tr>`)
          .join('')}
      </table>
    </div>
  `;

  document.getElementById('form-produccion').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const producto_codigo = fd.get('producto_codigo');
    const cantidad = Number(fd.get('cantidad'));
    const msg = document.getElementById('produccion-msg');

    const { data, error } = await supabase.rpc('producir_lote', {
      p_producto_codigo: producto_codigo,
      p_cantidad: cantidad,
    });

    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = `Lote ${data} registrado.`;
      goToView('produccion');
    }
  });
}

// ============================================================
// Clientes
// ============================================================

async function viewClientes() {
  const { data: clientes } = await supabase.from('clientes').select('*').order('id');

  content.innerHTML = `
    <h2>Clientes</h2>
    <form class="inline-form" id="form-cliente">
      <div class="field">Tipo
        <select name="tipo_documento">
          <option value="V">V</option><option value="E">E</option><option value="J">J</option>
          <option value="G">G</option><option value="P">P</option><option value="C">C</option>
        </select>
      </div>
      <div class="field">Número doc.<input name="numero_documento" required placeholder="12345678" /></div>
      <div class="field">Nombre<input name="nombre" required /></div>
      <div class="field">Dirección fiscal<input name="direccion_fiscal" required placeholder="mín. 15 caracteres" style="width:220px" /></div>
      <div class="field">Teléfono<input name="telefono" /></div>
      <div class="field">Email<input name="email" type="email" /></div>
      <button type="submit">Agregar</button>
    </form>
    <div id="cliente-msg" class="msg"></div>
    <table>
      <tr><th>Código</th><th>Doc.</th><th>Nombre</th><th>Dirección fiscal</th><th>Teléfono</th><th></th></tr>
      ${(clientes || [])
        .map(
          (c) =>
            `<tr data-id="${c.id}"><td>${c.id}</td><td>${c.tipo_documento}-${c.numero_documento}</td><td>${c.nombre}</td><td>${c.direccion_fiscal}</td><td>${c.telefono || '-'}</td>
              <td>${isAdmin() ? `<span class="badge delete-cliente" style="cursor:pointer;color:var(--err);">Eliminar</span>` : ''}</td></tr>`
        )
        .join('')}
    </table>
  `;

  content.querySelectorAll('.delete-cliente').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.closest('tr').dataset.id;
      if (!confirm(`¿Eliminar el cliente ${id}? No se puede deshacer.`)) return;
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') {
          alert(`${id} ya tiene ventas, presupuestos o pedidos asociados, así que no se puede borrar sin perder ese historial.`);
        } else {
          alert('No se pudo eliminar: ' + error.message);
        }
      } else {
        goToView('clientes');
      }
    });
  });

  document.getElementById('form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    const msg = document.getElementById('cliente-msg');

    if (payload.direccion_fiscal.length < 15) {
      msg.className = 'msg err';
      msg.textContent = 'La dirección fiscal debe tener al menos 15 caracteres.';
      return;
    }

    const { error } = await supabase.from('clientes').insert(payload);
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = 'Cliente agregado.';
      goToView('clientes');
    }
  });
}

// ============================================================
// Ventas
// ============================================================

async function viewVentas() {
  let clientes = (await supabase.from('clientes').select('id,nombre')).data || [];
  const { data: productos } = await supabase.from('productos').select('codigo,nombre,precio_base,porcentaje_iva,es_exento').eq('activo', true);
  const { data: config } = await supabase.from('config_global').select('*').single();
  const { data: ventas } = await supabase
    .from('ventas')
    .select('id,numero_factura,fecha,cliente_id,gran_total,moneda_pago,metodo_pago,tasa_cambio_bcv_aplicada,subtotal_base_imponible,monto_total_iva')
    .order('fecha', { ascending: false })
    .limit(15);

  function clienteOptions() {
    return clientes.map((c) => `<option value="${c.id}">${c.id} — ${c.nombre}</option>`).join('');
  }

  const contexto = pedidoParaVenta;
  pedidoParaVenta = null; // se consume una sola vez

  content.innerHTML = `
    <h2>Ventas</h2>
    ${contexto ? `<div class="msg ok">Registrando la venta final del pedido <strong>${contexto.codigo}</strong>.</div>` : ''}
    <div class="card">
      <h3>Nueva venta</h3>
      <form id="form-venta">
        <input type="hidden" name="pedido_id" value="${contexto ? contexto.codigo : ''}" />
        <div class="inline-form">
          <div class="field">Cliente
            <select name="cliente_id" id="venta-cliente-select" required>
              <option value="">Elegí...</option>
              ${clienteOptions()}
            </select>
          </div>
          <button type="button" id="toggle-nuevo-cliente" class="badge" style="cursor:pointer;align-self:flex-end;height:34px;">+ Cliente nuevo</button>
          <div class="field">Moneda de pago
            <select name="moneda_pago" id="venta-moneda-select">
              <option value="USD">USD</option><option value="VES">VES</option>
            </select>
          </div>
          <div class="field">Método de pago
            <select name="metodo_pago">
              <option>Efectivo</option><option>Transferencia</option>
              <option>Pago Móvil</option><option>USDT</option>
            </select>
          </div>
          <div class="field">Tasa BCV aplicada<input name="tasa_cambio" id="venta-tasa-input" type="number" step="0.0001" value="${config ? config.tasa_bcv_actual : 1}" /></div>
          <div class="field">Descuento manual (USD)<input name="descuento_manual" id="venta-descuento-input" type="number" step="0.000001" value="0" /></div>
        </div>

        <div id="nuevo-cliente-box" class="card" style="display:none;">
          <div class="inline-form" style="margin-bottom:0;">
            <div class="field">Tipo
              <select id="nc-tipo">
                <option value="V">V</option><option value="E">E</option><option value="J">J</option>
                <option value="G">G</option><option value="P">P</option><option value="C">C</option>
              </select>
            </div>
            <div class="field">Número doc.<input id="nc-numero" placeholder="12345678" /></div>
            <div class="field">Nombre<input id="nc-nombre" /></div>
            <div class="field">Dirección fiscal<input id="nc-direccion" placeholder="mín. 15 caracteres" style="width:200px" /></div>
            <div class="field">Teléfono<input id="nc-telefono" /></div>
            <button type="button" id="nc-guardar">Guardar cliente</button>
          </div>
          <div id="nc-msg" class="msg"></div>
        </div>

        <div class="venta-items" id="venta-items"></div>
        <button type="button" id="add-item-btn" style="margin-bottom:12px;">+ Agregar producto</button>

        <div class="card" style="margin-top:0;">
          <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:14px;">
            <div>Subtotal: <strong id="resumen-subtotal">0,00</strong> USD</div>
            <div>IVA: <strong id="resumen-iva">0,00</strong> USD</div>
            <div>Total: <strong id="resumen-total">0,00</strong> USD</div>
            <div id="resumen-ves-box" style="display:none;">≈ <strong id="resumen-total-ves">0,00</strong> Bs</div>
          </div>
        </div>

        <div>
          <button type="submit">Registrar venta</button>
        </div>
      </form>
      <div id="venta-msg" class="msg"></div>
    </div>

    <div class="card">
      <h3>Últimas ventas</h3>
      <table>
        <tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th>Total</th><th>Moneda</th><th>Método</th><th></th></tr>
        ${(ventas || [])
          .map(
            (v) => `
              <tr data-venta-id="${v.id}">
                <td>#${v.numero_factura}</td><td>${v.fecha}</td><td>${v.cliente_id || '-'}</td><td>${fmt(v.gran_total)}</td><td>${v.moneda_pago}</td><td>${v.metodo_pago}</td>
                <td>
                  <span class="badge imprimir-nota" data-id="${v.id}" style="cursor:pointer;">Nota de entrega</span>
                  <span class="badge toggle-pagos-venta" data-id="${v.id}" style="cursor:pointer;">Pagos</span>
                  ${isAdmin() ? `<span class="badge delete-venta" data-id="${v.id}" style="cursor:pointer;color:var(--err);">Eliminar</span>` : ''}
                </td>
              </tr>
              <tr class="pagos-venta-row" data-venta-pagos="${v.id}" style="display:none;"><td colspan="7"></td></tr>`
          )
          .join('')}
      </table>
    </div>
  `;

  // ---- cliente nuevo sin salir de Ventas ----
  const ncBox = document.getElementById('nuevo-cliente-box');
  document.getElementById('toggle-nuevo-cliente').addEventListener('click', () => {
    ncBox.style.display = ncBox.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('nc-guardar').addEventListener('click', async () => {
    const payload = {
      tipo_documento: document.getElementById('nc-tipo').value,
      numero_documento: document.getElementById('nc-numero').value.trim(),
      nombre: document.getElementById('nc-nombre').value.trim(),
      direccion_fiscal: document.getElementById('nc-direccion').value.trim(),
      telefono: document.getElementById('nc-telefono').value.trim(),
    };
    const ncMsg = document.getElementById('nc-msg');

    if (!payload.numero_documento || !payload.nombre) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = 'Completá al menos número de documento y nombre.';
      return;
    }
    if (payload.direccion_fiscal.length < 15) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = 'La dirección fiscal debe tener al menos 15 caracteres.';
      return;
    }

    const { data, error } = await supabase.from('clientes').insert(payload).select().single();
    if (error) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = error.message;
    } else {
      clientes.push({ id: data.id, nombre: data.nombre });
      const sel = document.getElementById('venta-cliente-select');
      sel.innerHTML = '<option value="">Elegí...</option>' + clienteOptions();
      sel.value = data.id;
      ncMsg.className = 'msg ok';
      ncMsg.textContent = `Cliente ${data.id} creado y seleccionado.`;
      ['nc-numero', 'nc-nombre', 'nc-direccion', 'nc-telefono'].forEach((id) => (document.getElementById(id).value = ''));
    }
  });

  // ---- items + resumen en vivo ----
  const itemsBox = document.getElementById('venta-items');
  const productOptions = (productos || [])
    .map((p) => `<option value="${p.codigo}" data-precio="${p.precio_base}" data-iva="${p.porcentaje_iva}" data-exento="${p.es_exento}">${p.codigo} — ${p.nombre}</option>`)
    .join('');

  function recalcularResumen() {
    let subtotal = 0;
    let iva = 0;
    itemsBox.querySelectorAll('.row').forEach((row) => {
      const sel = row.querySelector('.item-producto');
      const opt = sel.options[sel.selectedIndex];
      const cantidad = Number(row.querySelector('.item-cantidad').value) || 0;
      if (!opt || !opt.value) return;
      const precio = Number(opt.dataset.precio) || 0;
      const porcentajeIva = Number(opt.dataset.iva) || 0;
      const esExento = opt.dataset.exento === 'true';
      subtotal += precio * cantidad;
      if (!esExento) iva += precio * cantidad * (porcentajeIva / 100);
    });
    const descuento = Number(document.getElementById('venta-descuento-input').value) || 0;
    subtotal -= descuento;
    const total = subtotal + iva;
    const tasa = Number(document.getElementById('venta-tasa-input').value) || 0;
    const moneda = document.getElementById('venta-moneda-select').value;

    document.getElementById('resumen-subtotal').textContent = fmt(subtotal);
    document.getElementById('resumen-iva').textContent = fmt(iva);
    document.getElementById('resumen-total').textContent = fmt(total);

    const vesBox = document.getElementById('resumen-ves-box');
    if (moneda === 'VES') {
      vesBox.style.display = 'block';
      document.getElementById('resumen-total-ves').textContent = fmt(total * tasa);
    } else {
      vesBox.style.display = 'none';
    }
  }

  function addItemRow() {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <select class="item-producto">${'<option value="">Producto...</option>' + productOptions}</select>
      <input class="item-cantidad" type="number" step="0.0001" placeholder="Cantidad" value="1" style="width:100px" />
      <span class="remove-item">Quitar</span>
    `;
    row.querySelector('.remove-item').addEventListener('click', () => {
      row.remove();
      recalcularResumen();
    });
    row.querySelector('.item-producto').addEventListener('change', recalcularResumen);
    row.querySelector('.item-cantidad').addEventListener('input', recalcularResumen);
    itemsBox.appendChild(row);
  }
  addItemRow();
  document.getElementById('add-item-btn').addEventListener('click', () => {
    addItemRow();
    recalcularResumen();
  });

  document.getElementById('venta-moneda-select').addEventListener('change', recalcularResumen);
  document.getElementById('venta-tasa-input').addEventListener('input', recalcularResumen);
  document.getElementById('venta-descuento-input').addEventListener('input', recalcularResumen);
  recalcularResumen();

  if (contexto && contexto.cliente_id) {
    document.getElementById('venta-cliente-select').value = contexto.cliente_id;
  }

  // ---- nota de entrega ----
  content.querySelectorAll('.imprimir-nota').forEach((el) => {
    el.addEventListener('click', () => imprimirNotaEntrega(Number(el.dataset.id)));
  });

  // ---- pagos de una venta (expandir/colapsar) ----
  content.querySelectorAll('.toggle-pagos-venta').forEach((el) => {
    el.addEventListener('click', async () => {
      const ventaId = Number(el.dataset.id);
      const row = content.querySelector(`tr[data-venta-pagos="${ventaId}"]`);
      const abierto = row.style.display !== 'none';
      if (abierto) {
        row.style.display = 'none';
        row.querySelector('td').innerHTML = '';
      } else {
        row.style.display = '';
        await renderPagosPanel(row.querySelector('td'), { venta_id: ventaId });
      }
    });
  });

  // ---- eliminar venta ----
  content.querySelectorAll('.delete-venta').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.id);
      if (!confirm('¿Eliminar esta venta? No se restaura el stock automáticamente y no se puede deshacer.')) return;
      const { error } = await supabase.from('ventas').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') {
          alert('Esta venta tiene pagos u otros registros asociados (por ejemplo, un pedido enlazado). Borrá primero esos registros.');
        } else {
          alert('No se pudo eliminar: ' + error.message);
        }
      } else {
        goToView('ventas');
      }
    });
  });

  // ---- registrar venta ----
  document.getElementById('form-venta').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('venta-msg');

    const items = Array.from(itemsBox.querySelectorAll('.row'))
      .map((row) => ({
        producto_codigo: row.querySelector('.item-producto').value,
        cantidad: Number(row.querySelector('.item-cantidad').value),
      }))
      .filter((it) => it.producto_codigo && it.cantidad > 0);

    if (items.length === 0) {
      msg.className = 'msg err';
      msg.textContent = 'Agregá al menos un producto.';
      return;
    }

    const { data, error } = await supabase.rpc('registrar_venta', {
      p_cliente_id: fd.get('cliente_id'),
      p_items: items,
      p_moneda_pago: fd.get('moneda_pago'),
      p_metodo_pago: fd.get('metodo_pago'),
      p_tasa_cambio: Number(fd.get('tasa_cambio')),
      p_descuento_manual: Number(fd.get('descuento_manual') || 0),
      p_pedido_id: fd.get('pedido_id') || null,
    });

    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = `Venta registrada (factura #${data[0].numero_factura}).`;
      goToView('ventas');
    }
  });
}

// ============================================================
// Nota de entrega (imprimible, con logo)
// ============================================================

async function imprimirNotaEntrega(ventaId) {
  const { data: venta } = await supabase.from('ventas').select('*').eq('id', ventaId).single();
  if (!venta) {
    alert('No se encontró la venta.');
    return;
  }
  const { data: items } = await supabase
    .from('venta_items')
    .select('producto_codigo,cantidad,precio_base_unitario,porcentaje_iva')
    .eq('venta_id', ventaId);
  const { data: cliente } = venta.cliente_id
    ? await supabase.from('clientes').select('*').eq('id', venta.cliente_id).single()
    : { data: null };
  const { data: productosInfo } = await supabase
    .from('productos')
    .select('codigo,nombre')
    .in('codigo', (items || []).map((i) => i.producto_codigo));

  const nombreProducto = (codigo) => {
    const p = (productosInfo || []).find((x) => x.codigo === codigo);
    return p ? p.nombre : codigo;
  };

  const filas = (items || [])
    .map(
      (it) => `
      <tr>
        <td>${it.producto_codigo} — ${nombreProducto(it.producto_codigo)}</td>
        <td style="text-align:center;">${fmt(it.cantidad)}</td>
        <td style="text-align:right;">${fmt(it.precio_base_unitario)}</td>
        <td style="text-align:right;">${fmt(it.precio_base_unitario * it.cantidad)}</td>
      </tr>`
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Nota de entrega #${venta.numero_factura}</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; color: #222; padding: 32px; }
        .header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #e23b3b; padding-bottom: 16px; margin-bottom: 20px; }
        .header img { width: 80px; height: 80px; object-fit: contain; }
        .header h1 { font-size: 20px; margin: 0; }
        .header p { margin: 2px 0; color: #555; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background: #f4f4f4; }
        .totales { margin-top: 16px; text-align: right; font-size: 13px; }
        .totales div { margin: 2px 0; }
        .totales .gran-total { font-size: 16px; font-weight: bold; margin-top: 6px; }
        .meta { display: flex; justify-content: space-between; margin-bottom: 16px; font-size: 13px; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${LOGO_URL}" />
        <div>
          <h1>Maka Clothing</h1>
          <p>@maka.clothing.ve</p>
          <p>Nota de entrega — Factura #${venta.numero_factura}</p>
        </div>
      </div>

      <div class="meta">
        <div>
          <strong>Fecha:</strong> ${venta.fecha}<br/>
          <strong>Cliente:</strong> ${cliente ? cliente.nombre : 'Consumidor final'}<br/>
          ${cliente ? `<strong>${cliente.tipo_documento}-${cliente.numero_documento}</strong><br/>` : ''}
          ${cliente ? `${cliente.direccion_fiscal}` : ''}
        </div>
        <div>
          <strong>Método de pago:</strong> ${venta.metodo_pago}<br/>
          <strong>Moneda:</strong> ${venta.moneda_pago}<br/>
          <strong>Tasa BCV aplicada:</strong> ${fmt(venta.tasa_cambio_bcv_aplicada)}
        </div>
      </div>

      <table>
        <tr><th>Producto</th><th style="text-align:center;">Cantidad</th><th style="text-align:right;">Precio unit. (USD)</th><th style="text-align:right;">Subtotal (USD)</th></tr>
        ${filas}
      </table>

      <div class="totales">
        <div>Subtotal: ${fmt(venta.subtotal_base_imponible)} USD</div>
        <div>IVA: ${fmt(venta.monto_total_iva)} USD</div>
        <div class="gran-total">Total: ${fmt(venta.gran_total)} USD ${venta.moneda_pago === 'VES' ? `(≈ ${fmt(venta.gran_total * venta.tasa_cambio_bcv_aplicada)} Bs)` : ''}</div>
      </div>

      <button onclick="window.print()" style="margin-top:24px;padding:10px 20px;">Imprimir / Guardar como PDF</button>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=700,height=900');
  win.document.write(html);
  win.document.close();
}

// ============================================================
// Presupuestos
// ============================================================

async function viewPresupuestos() {
  let clientes = (await supabase.from('clientes').select('id,nombre')).data || [];
  const { data: productos } = await supabase.from('productos').select('codigo,nombre,precio_base,porcentaje_iva,es_exento').eq('activo', true);
  const { data: config } = await supabase.from('config_global').select('*').single();
  const { data: presupuestos } = await supabase
    .from('presupuestos')
    .select('id,fecha,cliente_id,total_estimado,moneda,estado,pedido_id')
    .order('fecha', { ascending: false })
    .limit(15);

  function clienteOptions() {
    return clientes.map((c) => `<option value="${c.id}">${c.id} — ${c.nombre}</option>`).join('');
  }

  const contexto = pedidoParaPresupuesto;
  pedidoParaPresupuesto = null; // se consume una sola vez

  content.innerHTML = `
    <h2>Presupuestos</h2>
    ${contexto ? `<div class="msg ok">Armando presupuesto para el pedido <strong>${contexto.codigo}</strong>.</div>` : ''}
    <div class="card">
      <h3>Nuevo presupuesto</h3>
      <form id="form-presupuesto">
        <input type="hidden" name="pedido_id" value="${contexto ? contexto.codigo : ''}" />
        <div class="inline-form">
          <div class="field">Cliente
            <select name="cliente_id" id="presu-cliente-select">
              <option value="">(sin especificar)</option>
              ${clienteOptions()}
            </select>
          </div>
          <button type="button" id="presu-toggle-nuevo-cliente" class="badge" style="cursor:pointer;align-self:flex-end;height:34px;">+ Cliente nuevo</button>
          <div class="field">Moneda
            <select name="moneda" id="presu-moneda-select">
              <option value="USD">USD</option><option value="VES">VES</option>
            </select>
          </div>
          <div class="field">Tasa BCV<input name="tasa_bcv_aplicada" id="presu-tasa-input" type="number" step="0.0001" value="${config ? config.tasa_bcv_actual : 1}" /></div>
        </div>

        <div id="presu-nuevo-cliente-box" class="card" style="display:none;">
          <div class="inline-form" style="margin-bottom:0;">
            <div class="field">Tipo
              <select id="presu-nc-tipo">
                <option value="V">V</option><option value="E">E</option><option value="J">J</option>
                <option value="G">G</option><option value="P">P</option><option value="C">C</option>
              </select>
            </div>
            <div class="field">Número doc.<input id="presu-nc-numero" placeholder="12345678" /></div>
            <div class="field">Nombre<input id="presu-nc-nombre" /></div>
            <div class="field">Dirección fiscal<input id="presu-nc-direccion" placeholder="mín. 15 caracteres" style="width:200px" /></div>
            <div class="field">Teléfono<input id="presu-nc-telefono" /></div>
            <button type="button" id="presu-nc-guardar">Guardar cliente</button>
          </div>
          <div id="presu-nc-msg" class="msg"></div>
        </div>

        <div class="venta-items" id="presu-items"></div>
        <button type="button" id="presu-add-item-btn" style="margin-bottom:12px;">+ Agregar producto</button>

        <div class="card" style="margin-top:0;">
          <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:14px;">
            <div>Subtotal: <strong id="presu-resumen-subtotal">0,00</strong> USD</div>
            <div>IVA: <strong id="presu-resumen-iva">0,00</strong> USD</div>
            <div>Total: <strong id="presu-resumen-total">0,00</strong> USD</div>
            <div id="presu-resumen-ves-box" style="display:none;">≈ <strong id="presu-resumen-total-ves">0,00</strong> Bs</div>
          </div>
        </div>

        <button type="submit">Guardar presupuesto</button>
      </form>
      <div id="presu-msg" class="msg"></div>
    </div>

    <div class="card">
      <h3>Últimos presupuestos</h3>
      <table>
        <tr><th>Fecha</th><th>Cliente</th><th>Pedido</th><th>Total</th><th>Moneda</th><th>Estado</th><th></th></tr>
        ${(presupuestos || [])
          .map(
            (p) => `<tr data-id="${p.id}">
              <td>${p.fecha}</td><td>${p.cliente_id || '-'}</td><td>${p.pedido_id || '-'}</td><td>${fmt(p.total_estimado)}</td><td>${p.moneda}</td>
              <td>
                <select class="presu-estado-select" data-id="${p.id}">
                  <option value="pendiente" ${p.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                  <option value="aceptado" ${p.estado === 'aceptado' ? 'selected' : ''}>Aceptado</option>
                  <option value="rechazado" ${p.estado === 'rechazado' ? 'selected' : ''}>Rechazado</option>
                  <option value="ajustado" ${p.estado === 'ajustado' ? 'selected' : ''}>Ajustado</option>
                </select>
              </td>
              <td>
                <span class="badge imprimir-presupuesto" data-id="${p.id}" style="cursor:pointer;">Imprimir</span>
                ${isAdmin() ? `<span class="badge delete-presupuesto" data-id="${p.id}" style="cursor:pointer;color:var(--err);">Eliminar</span>` : ''}
              </td>
            </tr>`
          )
          .join('')}
      </table>
    </div>
  `;

  // ---- cliente nuevo ----
  const ncBox = document.getElementById('presu-nuevo-cliente-box');
  document.getElementById('presu-toggle-nuevo-cliente').addEventListener('click', () => {
    ncBox.style.display = ncBox.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('presu-nc-guardar').addEventListener('click', async () => {
    const payload = {
      tipo_documento: document.getElementById('presu-nc-tipo').value,
      numero_documento: document.getElementById('presu-nc-numero').value.trim(),
      nombre: document.getElementById('presu-nc-nombre').value.trim(),
      direccion_fiscal: document.getElementById('presu-nc-direccion').value.trim(),
      telefono: document.getElementById('presu-nc-telefono').value.trim(),
    };
    const ncMsg = document.getElementById('presu-nc-msg');
    if (!payload.numero_documento || !payload.nombre) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = 'Completá al menos número de documento y nombre.';
      return;
    }
    if (payload.direccion_fiscal.length < 15) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = 'La dirección fiscal debe tener al menos 15 caracteres.';
      return;
    }
    const { data, error } = await supabase.from('clientes').insert(payload).select().single();
    if (error) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = error.message;
    } else {
      clientes.push({ id: data.id, nombre: data.nombre });
      const sel = document.getElementById('presu-cliente-select');
      sel.innerHTML = '<option value="">(sin especificar)</option>' + clienteOptions();
      sel.value = data.id;
      ncMsg.className = 'msg ok';
      ncMsg.textContent = `Cliente ${data.id} creado y seleccionado.`;
    }
  });

  // ---- items + resumen ----
  const itemsBox = document.getElementById('presu-items');
  const productOptions = (productos || [])
    .map((p) => `<option value="${p.codigo}" data-nombre="${p.nombre}" data-precio="${p.precio_base}" data-iva="${p.porcentaje_iva}" data-exento="${p.es_exento}">${p.codigo} — ${p.nombre}</option>`)
    .join('');

  function recalcular() {
    let subtotal = 0;
    let iva = 0;
    itemsBox.querySelectorAll('.row').forEach((row) => {
      const sel = row.querySelector('.item-producto');
      const opt = sel.options[sel.selectedIndex];
      const cantidad = Number(row.querySelector('.item-cantidad').value) || 0;
      if (!opt || !opt.value) return;
      const precio = Number(opt.dataset.precio) || 0;
      const porcentajeIva = Number(opt.dataset.iva) || 0;
      const esExento = opt.dataset.exento === 'true';
      subtotal += precio * cantidad;
      if (!esExento) iva += precio * cantidad * (porcentajeIva / 100);
    });
    const total = subtotal + iva;
    const tasa = Number(document.getElementById('presu-tasa-input').value) || 0;
    const moneda = document.getElementById('presu-moneda-select').value;

    document.getElementById('presu-resumen-subtotal').textContent = fmt(subtotal);
    document.getElementById('presu-resumen-iva').textContent = fmt(iva);
    document.getElementById('presu-resumen-total').textContent = fmt(total);

    const vesBox = document.getElementById('presu-resumen-ves-box');
    if (moneda === 'VES') {
      vesBox.style.display = 'block';
      document.getElementById('presu-resumen-total-ves').textContent = fmt(total * tasa);
    } else {
      vesBox.style.display = 'none';
    }
    return total;
  }

  function addItemRow() {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <select class="item-producto">${'<option value="">Producto...</option>' + productOptions}</select>
      <input class="item-cantidad" type="number" step="0.0001" placeholder="Cantidad" value="1" style="width:100px" />
      <span class="remove-item">Quitar</span>
    `;
    row.querySelector('.remove-item').addEventListener('click', () => {
      row.remove();
      recalcular();
    });
    row.querySelector('.item-producto').addEventListener('change', recalcular);
    row.querySelector('.item-cantidad').addEventListener('input', recalcular);
    itemsBox.appendChild(row);
  }
  addItemRow();
  document.getElementById('presu-add-item-btn').addEventListener('click', () => {
    addItemRow();
    recalcular();
  });
  document.getElementById('presu-moneda-select').addEventListener('change', recalcular);
  document.getElementById('presu-tasa-input').addEventListener('input', recalcular);
  recalcular();

  if (contexto && contexto.cliente_id) {
    document.getElementById('presu-cliente-select').value = contexto.cliente_id;
  }

  // ---- estado ----
  content.querySelectorAll('.presu-estado-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const { error } = await supabase.from('presupuestos').update({ estado: sel.value }).eq('id', sel.dataset.id);
      if (error) alert('No se pudo actualizar el estado: ' + error.message);
    });
  });

  // ---- imprimir ----
  content.querySelectorAll('.imprimir-presupuesto').forEach((el) => {
    el.addEventListener('click', () => imprimirPresupuesto(Number(el.dataset.id)));
  });

  // ---- eliminar presupuesto ----
  content.querySelectorAll('.delete-presupuesto').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = Number(el.dataset.id);
      if (!confirm('¿Eliminar este presupuesto? No se puede deshacer.')) return;
      const { error } = await supabase.from('presupuestos').delete().eq('id', id);
      if (error) {
        if (error.code === '23503') {
          alert('Este presupuesto está enlazado a un Pedido. Desvinculalo o eliminá primero el pedido.');
        } else {
          alert('No se pudo eliminar: ' + error.message);
        }
      } else {
        goToView('presupuestos');
      }
    });
  });

  // ---- guardar ----
  document.getElementById('form-presupuesto').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('presu-msg');

    const items = Array.from(itemsBox.querySelectorAll('.row'))
      .map((row) => {
        const sel = row.querySelector('.item-producto');
        const opt = sel.options[sel.selectedIndex];
        const cantidad = Number(row.querySelector('.item-cantidad').value);
        if (!opt || !opt.value || !cantidad) return null;
        return {
          producto_codigo: opt.value,
          nombre: opt.dataset.nombre,
          cantidad,
          precio_unitario: Number(opt.dataset.precio),
          porcentaje_iva: Number(opt.dataset.iva),
          es_exento: opt.dataset.exento === 'true',
        };
      })
      .filter(Boolean);

    if (items.length === 0) {
      msg.className = 'msg err';
      msg.textContent = 'Agregá al menos un producto.';
      return;
    }

    const total = recalcular();

    const { error } = await supabase.from('presupuestos').insert({
      cliente_id: fd.get('cliente_id') || null,
      items,
      total_estimado: total,
      moneda: fd.get('moneda'),
      tasa_bcv_aplicada: Number(fd.get('tasa_bcv_aplicada')),
      pedido_id: fd.get('pedido_id') || null,
    });

    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = 'Presupuesto guardado.';
      goToView('presupuestos');
    }
  });
}

async function imprimirPresupuesto(presupuestoId) {
  const { data: presu } = await supabase.from('presupuestos').select('*').eq('id', presupuestoId).single();
  if (!presu) {
    alert('No se encontró el presupuesto.');
    return;
  }
  const { data: cliente } = presu.cliente_id
    ? await supabase.from('clientes').select('*').eq('id', presu.cliente_id).single()
    : { data: null };

  const items = presu.items || [];
  const filas = items
    .map(
      (it) => `
      <tr>
        <td>${it.producto_codigo} — ${it.nombre || ''}</td>
        <td style="text-align:center;">${fmt(it.cantidad)}</td>
        <td style="text-align:right;">${fmt(it.precio_unitario)}</td>
        <td style="text-align:right;">${fmt(it.precio_unitario * it.cantidad)}</td>
      </tr>`
    )
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Presupuesto #${presu.id}</title>
      <style>
        body { font-family: -apple-system, Arial, sans-serif; color: #222; padding: 32px; }
        .header { display: flex; align-items: center; gap: 16px; border-bottom: 2px solid #e23b3b; padding-bottom: 16px; margin-bottom: 20px; }
        .header img { width: 80px; height: 80px; object-fit: contain; }
        .header h1 { font-size: 20px; margin: 0; }
        .header p { margin: 2px 0; color: #555; font-size: 13px; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
        th { background: #f4f4f4; }
        .totales { margin-top: 16px; text-align: right; font-size: 13px; }
        .totales .gran-total { font-size: 16px; font-weight: bold; margin-top: 6px; }
        .meta { margin-bottom: 16px; font-size: 13px; }
        .vigencia { color: #777; font-size: 12px; margin-top: 24px; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <div class="header">
        <img src="${LOGO_URL}" />
        <div>
          <h1>Maka Clothing</h1>
          <p>@maka.clothing.ve</p>
          <p>Presupuesto — ${presu.fecha}</p>
        </div>
      </div>

      <div class="meta">
        <strong>Cliente:</strong> ${cliente ? cliente.nombre : 'Consumidor final / sin especificar'}<br/>
        ${cliente ? `<strong>${cliente.tipo_documento}-${cliente.numero_documento}</strong><br/>${cliente.direccion_fiscal}` : ''}
      </div>

      <table>
        <tr><th>Producto</th><th style="text-align:center;">Cantidad</th><th style="text-align:right;">Precio unit. (USD)</th><th style="text-align:right;">Subtotal (USD)</th></tr>
        ${filas}
      </table>

      <div class="totales">
        <div class="gran-total">Total estimado: ${fmt(presu.total_estimado)} USD ${presu.moneda === 'VES' ? `(≈ ${fmt(presu.total_estimado * presu.tasa_bcv_aplicada)} Bs a tasa ${fmt(presu.tasa_bcv_aplicada)})` : ''}</div>
      </div>

      <p class="vigencia">Presupuesto sujeto a cambios según variación de la tasa BCV. Precios en USD de referencia.</p>

      <button onclick="window.print()" style="margin-top:12px;padding:10px 20px;">Imprimir / Guardar como PDF</button>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=700,height=900');
  win.document.write(html);
  win.document.close();
}

// ============================================================
// Pagos (panel compartido — se usa dentro de Ventas y de Pedidos)
// ============================================================

async function renderPagosPanel(container, { venta_id = null, pedido_codigo = null } = {}, totalReferencia = null, onCambio = null) {
  const filtro = venta_id ? { venta_id } : { pedido_codigo };
  let query = supabase.from('pagos').select('*').order('fecha', { ascending: false });
  query = venta_id ? query.eq('venta_id', venta_id) : query.eq('pedido_codigo', pedido_codigo);
  const { data: pagos } = await query;

  const totalPagado = (pagos || []).reduce((acc, p) => acc + pagoEnUsd(p), 0);
  const vesSinTasa = (pagos || []).some((p) => p.moneda === 'VES' && !(Number(p.tasa_cambio_bcv_aplicada) > 0));
  const avisoTasa = vesSinTasa
    ? '<div class="msg err">Hay pagos en VES sin tasa BCV: no se pueden convertir a USD y no cuentan en el total.</div>'
    : '';
  const saldoHtml =
    (totalReferencia != null
      ? `<div style="font-size:13px;margin-top:6px;">Total: <strong>${fmt(totalReferencia)} USD</strong> · Pagado: <strong>${fmt(totalPagado)} USD</strong> · Saldo: <strong style="color:${totalReferencia - totalPagado > 0.009 ? 'var(--err)' : 'var(--ok)'};">${fmt(totalReferencia - totalPagado)} USD</strong></div>`
      : `<div style="font-size:13px;margin-top:6px;">Pagado hasta ahora: <strong>${fmt(totalPagado)} USD</strong></div>`) + avisoTasa;

  container.innerHTML = `
    <div class="card" style="margin:8px 0;">
      <h3 style="margin-top:0;">Pagos</h3>
      <table>
        <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Moneda</th><th>Tasa aplicada</th><th>Referencia</th></tr>
        ${(pagos || [])
          .map(
            (p) =>
              `<tr><td>${p.fecha}</td><td>${p.tipo_pago}</td><td>${fmt(p.monto)}</td><td>${p.moneda}</td><td>${p.tasa_cambio_bcv_aplicada ? fmt(p.tasa_cambio_bcv_aplicada) : '-'}</td><td>${p.referencia || '-'}</td></tr>`
          )
          .join('') || '<tr><td colspan="6" style="color:var(--muted);">Sin pagos registrados todavía.</td></tr>'}
      </table>
      ${saldoHtml}
      <form class="inline-form" id="form-pago" style="margin-top:10px;">
        <div class="field">Tipo de pago
          <select name="tipo_pago">
            <option>Efectivo</option><option>Transferencia</option>
            <option>Pago Móvil</option><option>USDT</option>
          </select>
        </div>
        <div class="field">Monto<input name="monto" type="number" step="0.000001" required /></div>
        <div class="field">Moneda
          <select name="moneda"><option value="USD">USD</option><option value="VES">VES</option></select>
        </div>
        <div class="field">Tasa BCV aplicada<input name="tasa_cambio_bcv_aplicada" type="number" step="0.0001" /></div>
        <div class="field">Referencia<input name="referencia" placeholder="Nº de referencia (opcional)" /></div>
        <button type="submit">Agregar pago</button>
      </form>
      <div id="pago-msg" class="msg"></div>
    </div>
  `;

  container.querySelector('#form-pago').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = container.querySelector('#pago-msg');
    const payload = {
      tipo_pago: fd.get('tipo_pago'),
      monto: Number(fd.get('monto')),
      moneda: fd.get('moneda'),
      tasa_cambio_bcv_aplicada: fd.get('tasa_cambio_bcv_aplicada') ? Number(fd.get('tasa_cambio_bcv_aplicada')) : null,
      referencia: fd.get('referencia') || null,
      ...(venta_id ? { venta_id } : { pedido_codigo }),
    };
    const { error } = await supabase.from('pagos').insert(payload);
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      await renderPagosPanel(container, { venta_id, pedido_codigo }, totalReferencia, onCambio);
      if (onCambio) onCambio();
    }
  });
}

// ============================================================
// Pedidos — ciclo completo: pedido -> presupuesto -> venta
// ============================================================

async function viewPedidos() {
  let clientes = (await supabase.from('clientes').select('id,nombre')).data || [];
  const { data: pedidos } = await supabase
    .from('pedidos')
    .select('codigo,fecha,cliente_id,estado,etapa,presupuesto_id,venta_id,notas')
    .order('fecha', { ascending: false })
    .limit(30);

  const { data: pagosPedidos } = (pedidos || []).length
    ? await supabase
        .from('pagos')
        .select('pedido_codigo,monto,moneda,tasa_cambio_bcv_aplicada')
        .in('pedido_codigo', pedidos.map((p) => p.codigo))
    : { data: [] };
  const pagadoUsdPedido = (codigo) =>
    (pagosPedidos || []).filter((x) => x.pedido_codigo === codigo).reduce((acc, x) => acc + pagoEnUsd(x), 0);

  const presupuestoIds = (pedidos || []).map((p) => p.presupuesto_id).filter(Boolean);
  const ventaIds = (pedidos || []).map((p) => p.venta_id).filter(Boolean);
  const { data: presupuestosInfo } = presupuestoIds.length
    ? await supabase.from('presupuestos').select('id,total_estimado,moneda').in('id', presupuestoIds)
    : { data: [] };
  const { data: ventasInfo } = ventaIds.length
    ? await supabase.from('ventas').select('id,numero_factura,gran_total,moneda_pago').in('id', ventaIds)
    : { data: [] };

  function clienteOptions() {
    return clientes.map((c) => `<option value="${c.id}">${c.id} — ${c.nombre}</option>`).join('');
  }

  const ESTADO_LABEL = {
    pendiente: 'Pendiente de presupuesto',
    presupuestado: 'Presupuestado',
    aprobado: 'Aprobado',
    rechazado: 'Rechazado',
    ajustado: 'Ajustado',
    completado: 'Completado (vendido)',
  };
  const ESTADO_COLOR = {
    pendiente: 'var(--muted)',
    presupuestado: '#c9a227',
    aprobado: 'var(--ok)',
    rechazado: 'var(--err)',
    ajustado: '#c9a227',
    completado: 'var(--ok)',
  };

  function pagadoCellHtml(pagado, total, estado) {
    if (total == null) return pagado > 0 ? `${fmt(pagado)} USD` : '-';
    const completo = pagado >= total - 0.009 && total > 0;
    const pct = total > 0 ? Math.min(100, Math.round((pagado / total) * 100)) : 0;
    const color = completo ? 'var(--ok)' : pagado > 0 ? '#c9a227' : 'var(--muted)';
    const aviso = completo && estado !== 'completado'
      ? '<br/><span class="badge" style="color:var(--ok);">100% pagado — falta registrar la venta</span>'
      : '';
    return `<span style="color:${color};">${fmt(pagado)} / ${fmt(total)} USD (${pct}%)</span>${aviso}`;
  }

  async function refrescarPagadoPedido(codigo) {
    const p = (pedidos || []).find((x) => x.codigo === codigo);
    const presu = p && (presupuestosInfo || []).find((x) => x.id === p.presupuesto_id);
    const { data } = await supabase
      .from('pagos')
      .select('monto,moneda,tasa_cambio_bcv_aplicada')
      .eq('pedido_codigo', codigo);
    const pagado = (data || []).reduce((acc, x) => acc + pagoEnUsd(x), 0);
    const cell = content.querySelector(`td[data-pagado-cell="${codigo}"]`);
    if (cell) cell.innerHTML = pagadoCellHtml(pagado, presu ? Number(presu.total_estimado) : null, p ? p.estado : '');
  }

  content.innerHTML = `
    <h2>Pedidos</h2>
    <p style="color:var(--muted);font-size:13px;">
      Un pedido agrupa todo el ciclo: se crea, se arma un presupuesto (que puede quedar pendiente,
      aprobado, rechazado o ajustado) y cuando se aprueba se convierte en la venta final.
    </p>

    <div class="card">
      <h3>Nuevo pedido</h3>
      <form class="inline-form" id="form-pedido">
        <div class="field">Cliente
          <select name="cliente_id" id="pedido-cliente-select" required>
            <option value="">Elegí...</option>
            ${clienteOptions()}
          </select>
        </div>
        <button type="button" id="pedido-toggle-nuevo-cliente" class="badge" style="cursor:pointer;align-self:flex-end;height:34px;">+ Cliente nuevo</button>
        <div class="field">Notas<input name="notas" placeholder="Ej: franela personalizada, talla M..." style="width:260px" /></div>
        <button type="submit">Crear pedido</button>
      </form>
      <div id="pedido-nuevo-cliente-box" class="card" style="display:none;">
        <div class="inline-form" style="margin-bottom:0;">
          <div class="field">Tipo
            <select id="pedido-nc-tipo">
              <option value="V">V</option><option value="E">E</option><option value="J">J</option>
              <option value="G">G</option><option value="P">P</option><option value="C">C</option>
            </select>
          </div>
          <div class="field">Número doc.<input id="pedido-nc-numero" placeholder="12345678" /></div>
          <div class="field">Nombre<input id="pedido-nc-nombre" /></div>
          <div class="field">Dirección fiscal<input id="pedido-nc-direccion" placeholder="mín. 15 caracteres" style="width:200px" /></div>
          <div class="field">Teléfono<input id="pedido-nc-telefono" /></div>
          <button type="button" id="pedido-nc-guardar">Guardar cliente</button>
        </div>
        <div id="pedido-nc-msg" class="msg"></div>
      </div>
      <div id="pedido-msg" class="msg"></div>
    </div>

    <table>
      <tr><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Estado</th><th>Etapa</th><th>Presupuesto</th><th>Pagado</th><th>Venta</th><th>Notas</th><th></th></tr>
      ${(pedidos || [])
        .map((p) => {
          const presu = (presupuestosInfo || []).find((x) => x.id === p.presupuesto_id);
          const venta = (ventasInfo || []).find((x) => x.id === p.venta_id);
          const puedeArmarPresupuesto = ['pendiente', 'ajustado', 'rechazado'].includes(p.estado);
          const puedeRegistrarVenta = p.estado === 'aprobado';
          return `
            <tr data-codigo="${p.codigo}">
              <td>${p.codigo}</td>
              <td>${p.fecha}</td>
              <td>${p.cliente_id || '-'}</td>
              <td><span class="badge" style="color:${ESTADO_COLOR[p.estado] || 'var(--muted)'};">${ESTADO_LABEL[p.estado] || p.estado}</span></td>
              <td>
                <select class="etapa-select" data-codigo="${p.codigo}" ${p.estado === 'completado' ? 'disabled' : ''}>
                  <option value="">(sin etapa)</option>
                  ${ETAPAS_PEDIDO.map((et) => `<option value="${et}" ${p.etapa === et ? 'selected' : ''}>${et}</option>`).join('')}
                </select>
              </td>
              <td>${presu ? `${fmt(presu.total_estimado)} ${presu.moneda}` : '-'}</td>
              <td data-pagado-cell="${p.codigo}">${pagadoCellHtml(pagadoUsdPedido(p.codigo), presu ? Number(presu.total_estimado) : null, p.estado)}</td>
              <td>${venta ? `#${venta.numero_factura} (${fmt(venta.gran_total)} ${venta.moneda_pago})` : '-'}</td>
              <td style="max-width:160px;">${p.notas || '-'}</td>
              <td>
                ${puedeArmarPresupuesto ? `<span class="badge armar-presupuesto" data-codigo="${p.codigo}" data-cliente="${p.cliente_id || ''}" style="cursor:pointer;">Armar presupuesto</span>` : ''}
                ${puedeRegistrarVenta ? `<span class="badge registrar-venta-pedido" data-codigo="${p.codigo}" data-cliente="${p.cliente_id || ''}" style="cursor:pointer;color:var(--ok);">Registrar venta</span>` : ''}
                ${puedeArmarPresupuesto && !p.presupuesto_id ? `<span class="badge vincular-presupuesto" data-codigo="${p.codigo}" data-cliente="${p.cliente_id || ''}" style="cursor:pointer;">Vincular presupuesto existente</span>` : ''}
                ${p.presupuesto_id && p.estado !== 'completado' ? `<span class="badge desvincular-presupuesto" data-codigo="${p.codigo}" data-presupuesto="${p.presupuesto_id}" style="cursor:pointer;color:var(--muted);">Desvincular presupuesto</span>` : ''}
                <span class="badge toggle-pagos-pedido" data-codigo="${p.codigo}" data-total="${presu ? presu.total_estimado : ''}" style="cursor:pointer;">Pagos</span>
                ${isAdmin() ? `<span class="badge delete-pedido" data-codigo="${p.codigo}" style="cursor:pointer;color:var(--err);">Eliminar</span>` : ''}
              </td>
            </tr>
            <tr class="vincular-pedido-row" data-pedido-vincular="${p.codigo}" style="display:none;"><td colspan="10"></td></tr>
            <tr class="pagos-pedido-row" data-pedido-pagos="${p.codigo}" style="display:none;"><td colspan="10"></td></tr>`;
        })
        .join('')}
    </table>
  `;

  // ---- cliente nuevo ----
  const ncBox = document.getElementById('pedido-nuevo-cliente-box');
  document.getElementById('pedido-toggle-nuevo-cliente').addEventListener('click', () => {
    ncBox.style.display = ncBox.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('pedido-nc-guardar').addEventListener('click', async () => {
    const payload = {
      tipo_documento: document.getElementById('pedido-nc-tipo').value,
      numero_documento: document.getElementById('pedido-nc-numero').value.trim(),
      nombre: document.getElementById('pedido-nc-nombre').value.trim(),
      direccion_fiscal: document.getElementById('pedido-nc-direccion').value.trim(),
      telefono: document.getElementById('pedido-nc-telefono').value.trim(),
    };
    const ncMsg = document.getElementById('pedido-nc-msg');
    if (!payload.numero_documento || !payload.nombre) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = 'Completá al menos número de documento y nombre.';
      return;
    }
    if (payload.direccion_fiscal.length < 15) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = 'La dirección fiscal debe tener al menos 15 caracteres.';
      return;
    }
    const { data, error } = await supabase.from('clientes').insert(payload).select().single();
    if (error) {
      ncMsg.className = 'msg err';
      ncMsg.textContent = error.message;
    } else {
      clientes.push({ id: data.id, nombre: data.nombre });
      const sel = document.getElementById('pedido-cliente-select');
      sel.innerHTML = '<option value="">Elegí...</option>' + clienteOptions();
      sel.value = data.id;
      ncMsg.className = 'msg ok';
      ncMsg.textContent = `Cliente ${data.id} creado y seleccionado.`;
    }
  });

  // ---- crear pedido ----
  document.getElementById('form-pedido').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const msg = document.getElementById('pedido-msg');
    const { error } = await supabase.from('pedidos').insert({
      cliente_id: fd.get('cliente_id') || null,
      notas: fd.get('notas') || null,
    });
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = 'Pedido creado.';
      goToView('pedidos');
    }
  });

  // ---- ir a armar presupuesto ----
  content.querySelectorAll('.armar-presupuesto').forEach((el) => {
    el.addEventListener('click', () => {
      pedidoParaPresupuesto = { codigo: el.dataset.codigo, cliente_id: el.dataset.cliente || null };
      goToView('presupuestos');
    });
  });

  // ---- etapa del pedido ----
  content.querySelectorAll('.etapa-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const { error } = await supabase
        .from('pedidos')
        .update({ etapa: sel.value || null })
        .eq('codigo', sel.dataset.codigo);
      if (error) {
        alert('No se pudo cambiar la etapa: ' + error.message);
        goToView('pedidos');
      }
    });
  });

  // ---- vincular un presupuesto que ya existía (creado antes del módulo Pedidos) ----
  const ESTADO_PEDIDO_DESDE_PRESUPUESTO = {
    aceptado: 'aprobado',
    rechazado: 'rechazado',
    ajustado: 'ajustado',
  };

  content.querySelectorAll('.vincular-presupuesto').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.dataset.codigo;
      const clienteId = el.dataset.cliente || null;
      const row = content.querySelector(`tr[data-pedido-vincular="${codigo}"]`);
      if (row.style.display !== 'none') {
        row.style.display = 'none';
        return;
      }
      row.style.display = '';
      const cell = row.firstElementChild;
      cell.innerHTML = 'Cargando presupuestos...';

      const { data: libres, error } = await supabase
        .from('presupuestos')
        .select('id,fecha,cliente_id,total_estimado,moneda,estado')
        .is('pedido_id', null)
        .order('fecha', { ascending: false });
      if (error) {
        cell.innerHTML = `<span class="msg err">${error.message}</span>`;
        return;
      }
      if (!libres || !libres.length) {
        cell.innerHTML = '<span style="color:var(--muted);">No hay presupuestos sin pedido para vincular.</span>';
        return;
      }
      // primero los del mismo cliente
      libres.sort((a, b) => (b.cliente_id === clienteId) - (a.cliente_id === clienteId));

      cell.innerHTML = `
        <div class="inline-form" style="margin:6px 0;">
          <div class="field">Presupuesto a vincular al pedido ${codigo}
            <select class="vincular-select" style="min-width:320px;">
              ${libres
                .map(
                  (pr) =>
                    `<option value="${pr.id}">#${pr.id} — ${pr.fecha} — ${pr.cliente_id || 'sin cliente'} — ${fmt(pr.total_estimado)} ${pr.moneda} — ${pr.estado}${pr.cliente_id === clienteId ? ' (mismo cliente)' : ''}</option>`
                )
                .join('')}
            </select>
          </div>
          <button type="button" class="vincular-confirmar">Vincular</button>
        </div>
        <div class="msg vincular-msg"></div>`;

      cell.querySelector('.vincular-confirmar').addEventListener('click', async () => {
        const id = Number(cell.querySelector('.vincular-select').value);
        const pr = libres.find((x) => x.id === id);
        const vmsg = cell.querySelector('.vincular-msg');
        const { error: e1 } = await supabase.from('presupuestos').update({ pedido_id: codigo }).eq('id', id);
        if (e1) {
          vmsg.className = 'msg err';
          vmsg.textContent = e1.message;
          return;
        }
        const { error: e2 } = await supabase
          .from('pedidos')
          .update({ presupuesto_id: id, estado: ESTADO_PEDIDO_DESDE_PRESUPUESTO[pr.estado] || 'presupuestado' })
          .eq('codigo', codigo);
        if (e2) {
          // deshacer el primer paso para no dejar el vínculo a medias
          await supabase.from('presupuestos').update({ pedido_id: null }).eq('id', id);
          vmsg.className = 'msg err';
          vmsg.textContent = e2.message;
          return;
        }
        goToView('pedidos');
      });
    });
  });

  content.querySelectorAll('.desvincular-presupuesto').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.dataset.codigo;
      const presupuestoId = Number(el.dataset.presupuesto);
      if (!confirm(`¿Desvincular el presupuesto #${presupuestoId} del pedido ${codigo}? El presupuesto no se borra, solo deja de estar enlazado.`)) return;
      const { error: e1 } = await supabase.from('presupuestos').update({ pedido_id: null }).eq('id', presupuestoId);
      if (e1) {
        alert('No se pudo desvincular: ' + e1.message);
        return;
      }
      const { error: e2 } = await supabase
        .from('pedidos')
        .update({ presupuesto_id: null, estado: 'pendiente' })
        .eq('codigo', codigo);
      if (e2) alert('No se pudo actualizar el pedido: ' + e2.message);
      goToView('pedidos');
    });
  });

  // ---- ir a registrar venta ----
  content.querySelectorAll('.registrar-venta-pedido').forEach((el) => {
    el.addEventListener('click', () => {
      pedidoParaVenta = { codigo: el.dataset.codigo, cliente_id: el.dataset.cliente || null };
      goToView('ventas');
    });
  });

  // ---- pagos del pedido (expandir/colapsar) ----
  content.querySelectorAll('.toggle-pagos-pedido').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.dataset.codigo;
      const total = el.dataset.total ? Number(el.dataset.total) : null;
      const row = content.querySelector(`tr[data-pedido-pagos="${codigo}"]`);
      const abierto = row.style.display !== 'none';
      if (abierto) {
        row.style.display = 'none';
        row.querySelector('td').innerHTML = '';
      } else {
        row.style.display = '';
        await renderPagosPanel(row.querySelector('td'), { pedido_codigo: codigo }, total, () => refrescarPagadoPedido(codigo));
      }
    });
  });

  // ---- eliminar pedido ----
  content.querySelectorAll('.delete-pedido').forEach((el) => {
    el.addEventListener('click', async () => {
      const codigo = el.dataset.codigo;
      if (!confirm(`¿Eliminar el pedido ${codigo}? No se puede deshacer.`)) return;
      const { error } = await supabase.from('pedidos').delete().eq('codigo', codigo);
      if (error) {
        if (error.code === '23503') {
          alert('Este pedido tiene pagos, un presupuesto o una venta asociada. Eliminá primero esos registros.');
        } else {
          alert('No se pudo eliminar: ' + error.message);
        }
      } else {
        goToView('pedidos');
      }
    });
  });
}

// ============================================================
// Compras (solo admin)
// ============================================================

async function viewCompras() {
  if (!isAdmin()) {
    content.innerHTML = '<p>No tenés acceso a esta sección.</p>';
    return;
  }

  const { data: materiales } = await supabase.from('materia_prima').select('codigo,nombre').eq('activo', true);
  const { data: compras } = await supabase
    .from('compras')
    .select('id,fecha,material_codigo,cantidad,costo_total,tasa_cambio_bcv_aplicada,moneda_pago')
    .order('fecha', { ascending: false })
    .limit(15);

  content.innerHTML = `
    <h2>Compras</h2>
    <form class="inline-form" id="form-compra">
      <input type="hidden" name="_editing" value="" />
      <div class="field">Material
        <select name="material_codigo" required>
          <option value="">Elegí...</option>
          ${(materiales || []).map((m) => `<option value="${m.codigo}">${m.codigo} — ${m.nombre}</option>`).join('')}
        </select>
      </div>
      <div class="field">Cantidad<input name="cantidad" type="number" step="0.0001" required /></div>
      <div class="field">Costo total (USD)<input name="costo_total" type="number" step="0.000001" required /></div>
      <div class="field">Tasa BCV<input name="tasa_cambio_bcv_aplicada" type="number" step="0.0001" required /></div>
      <div class="field">Moneda pagada
        <select name="moneda_pago"><option value="USD">USD</option><option value="VES">VES</option></select>
      </div>
      <button type="submit" id="compra-submit-btn">Registrar compra</button>
      <button type="button" id="compra-cancel-btn" style="display:none;background:var(--panel-2);">Cancelar</button>
    </form>
    <div id="compra-msg" class="msg"></div>
    <p style="color:var(--muted);font-size:13px;">
      Cada compra suma automáticamente la cantidad al stock de ese material. Si editás o eliminás
      una compra, el stock se ajusta solo para mantener la consistencia.
    </p>
    <table>
      <tr><th>Fecha</th><th>Material</th><th>Cantidad</th><th>Costo total</th><th>Moneda</th><th></th></tr>
      ${(compras || [])
        .map(
          (c) =>
            `<tr data-id="${c.id}"><td>${c.fecha}</td><td>${c.material_codigo}</td><td>${fmt(c.cantidad)}</td><td>${fmt(c.costo_total)}</td><td>${c.moneda_pago}</td>
              <td><span class="badge edit-compra" style="cursor:pointer;">Editar</span> <span class="badge delete-compra" style="cursor:pointer;color:var(--err);">Eliminar</span></td>
            </tr>`
        )
        .join('')}
    </table>
  `;

  const form = document.getElementById('form-compra');
  const submitBtn = document.getElementById('compra-submit-btn');
  const cancelBtn = document.getElementById('compra-cancel-btn');

  cancelBtn.addEventListener('click', () => {
    form.reset();
    form.elements['_editing'].value = '';
    submitBtn.textContent = 'Registrar compra';
    cancelBtn.style.display = 'none';
  });

  content.querySelectorAll('.edit-compra').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.closest('tr').dataset.id;
      const c = (compras || []).find((x) => String(x.id) === id);
      if (!c) return;
      form.elements['material_codigo'].value = c.material_codigo;
      form.elements['cantidad'].value = c.cantidad;
      form.elements['costo_total'].value = c.costo_total;
      form.elements['tasa_cambio_bcv_aplicada'].value = c.tasa_cambio_bcv_aplicada;
      form.elements['moneda_pago'].value = c.moneda_pago;
      form.elements['_editing'].value = id;
      submitBtn.textContent = 'Guardar cambios';
      cancelBtn.style.display = 'inline-block';
      content.scrollIntoView({ behavior: 'smooth' });
    });
  });

  content.querySelectorAll('.delete-compra').forEach((el) => {
    el.addEventListener('click', async () => {
      const id = el.closest('tr').dataset.id;
      if (!confirm('¿Eliminar esta compra? Se le va a restar la cantidad correspondiente al stock de materia prima.')) return;
      const { error } = await supabase.rpc('eliminar_compra', { p_id: Number(id) });
      if (error) {
        alert('No se pudo eliminar: ' + error.message);
      } else {
        goToView('compras');
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    const editingId = payload._editing;
    const cantidad = Number(payload.cantidad);
    const costo_total = Number(payload.costo_total);
    const tasa_cambio = Number(payload.tasa_cambio_bcv_aplicada);

    const msg = document.getElementById('compra-msg');

    const { error } = editingId
      ? await supabase.rpc('actualizar_compra', {
          p_id: Number(editingId),
          p_material_codigo: payload.material_codigo,
          p_cantidad: cantidad,
          p_costo_total: costo_total,
          p_tasa_cambio: tasa_cambio,
          p_moneda_pago: payload.moneda_pago,
        })
      : await supabase.rpc('registrar_compra', {
          p_material_codigo: payload.material_codigo,
          p_cantidad: cantidad,
          p_costo_total: costo_total,
          p_tasa_cambio: tasa_cambio,
          p_moneda_pago: payload.moneda_pago,
        });

    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = editingId
        ? 'Compra actualizada (stock de materia prima ajustado).'
        : 'Compra registrada y sumada al stock de materia prima.';
      goToView('compras');
    }
  });
}

// ============================================================
// Configuración (solo admin)
// ============================================================

async function viewConfig() {
  if (!isAdmin()) {
    content.innerHTML = '<p>No tenés acceso a esta sección.</p>';
    return;
  }

  const { data: config } = await supabase.from('config_global').select('*').single();

  content.innerHTML = `
    <h2>Configuración</h2>
    <div class="card">
      <h3>Tasa BCV actual</h3>
      <form class="inline-form" id="form-config">
        <div class="field">Tasa (Bs/USD)<input name="tasa_bcv_actual" type="number" step="0.0001" value="${config ? config.tasa_bcv_actual : ''}" /></div>
        <button type="submit">Actualizar</button>
      </form>
      <div id="config-msg" class="msg"></div>
      <p style="color:var(--muted);font-size:13px;">
        Esta tasa es la que se sugiere por defecto al registrar una venta nueva — cada venta
        igual guarda su propia tasa aplicada, así que cambiar esto no afecta ventas pasadas.
      </p>
    </div>

    <div class="card">
      <h3>Borrar registros</h3>
      <p style="color:var(--muted);font-size:13px;">
        Ya no hay un botón para vaciar todo el sistema de una vez — para no arriesgar borrar
        presupuestos o ventas reales por error. Cada módulo (Materia prima, Productos, Equipos,
        Diseños, Clientes, Compras, Ventas, Presupuestos, Pedidos) tiene su propio botón
        <strong>Eliminar</strong> por fila, así que podés borrar registros de prueba uno por uno
        sin tocar lo que ya enviaste a un cliente.
      </p>
    </div>
  `;

  document.getElementById('form-config').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const tasa = Number(fd.get('tasa_bcv_actual'));
    const { error } = await supabase.from('config_global').update({ tasa_bcv_actual: tasa }).eq('id', 1);
    const msg = document.getElementById('config-msg');
    if (error) {
      msg.className = 'msg err';
      msg.textContent = error.message;
    } else {
      msg.className = 'msg ok';
      msg.textContent = 'Tasa actualizada.';
    }
  });
}
