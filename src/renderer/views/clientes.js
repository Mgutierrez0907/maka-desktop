const { el } = require('./_util.js');

async function render(root, { supabase, showToast, reload }) {
  root.innerHTML = `
    <h2 class="view-title">Clientes</h2>
    <p class="view-subtitle">El código se asigna automáticamente (C0001, C0002...)</p>

    <div class="card">
      <h3 style="margin-top:0">Nuevo cliente</h3>
      <form id="form-cliente">
        <div class="form-grid">
          <label>Tipo de documento
            <select name="tipo_documento" required>
              <option value="V">V - Venezolano</option>
              <option value="E">E - Extranjero</option>
              <option value="J">J - Jurídico</option>
              <option value="G">G - Gubernamental</option>
              <option value="P">P - Pasaporte</option>
              <option value="C">C - Comuna / Consejo Comunal</option>
            </select>
          </label>
          <label>Número de documento
            <input type="text" name="numero_documento" required />
          </label>
          <label class="full">Nombre / Razón social
            <input type="text" name="nombre" required />
          </label>
          <label class="full">Dirección fiscal (mínimo 15 caracteres)
            <input type="text" name="direccion_fiscal" required minlength="15" />
          </label>
          <label>Teléfono
            <input type="text" name="telefono" />
          </label>
          <label>Correo
            <input type="email" name="email" />
          </label>
        </div>
        <button type="submit" class="primary-btn">Guardar cliente</button>
      </form>
    </div>

    <div class="card">
      <div class="toolbar">
        <h3 style="margin:0">Clientes registrados</h3>
        <input type="text" id="buscar" placeholder="Buscar por nombre o código..." />
      </div>
      <table>
        <thead><tr><th>Código</th><th>Documento</th><th>Nombre</th><th>Teléfono</th></tr></thead>
        <tbody id="tbody-clientes"></tbody>
      </table>
    </div>
  `;

  let clientes = [];

  async function cargar() {
    const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false });
    if (error) { showToast('Error cargando clientes: ' + error.message, true); return; }
    clientes = data || [];
    pintar(clientes);
  }

  function pintar(lista) {
    const tbody = root.querySelector('#tbody-clientes');
    tbody.innerHTML = lista.length
      ? lista.map(c => `
          <tr>
            <td>${c.id}</td>
            <td>${c.tipo_documento}-${c.numero_documento}</td>
            <td>${c.nombre}</td>
            <td>${c.telefono || '—'}</td>
          </tr>`).join('')
      : `<tr><td colspan="4" class="empty-state">Sin clientes todavía</td></tr>`;
  }

  root.querySelector('#buscar').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    pintar(clientes.filter(c => c.nombre.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)));
  });

  root.querySelector('#form-cliente').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = Object.fromEntries(fd.entries());
    const { error } = await supabase.from('clientes').insert(payload);
    if (error) { showToast('No se pudo guardar: ' + error.message, true); return; }
    showToast('Cliente guardado');
    e.target.reset();
    cargar();
  });

  await cargar();
}

module.exports = { render };
