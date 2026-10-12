const { fmtUsd, fmtFecha } = require('./_util.js');

async function render(root, { supabase }) {
  root.innerHTML = `
    <h2 class="view-title">Resumen</h2>
    <p class="view-subtitle">Lo que más se mueve en Maka Clothing, sin abrir todo el inventario</p>
    <div class="kpi-row" id="kpi-row"></div>
    <div class="card">
      <h3 style="margin-top:0">Productos con menos stock</h3>
      <table id="tabla-stock-bajo"><thead><tr><th>Código</th><th>Producto</th><th>Stock</th></tr></thead><tbody></tbody></table>
    </div>
    <div class="card">
      <h3 style="margin-top:0">Últimas ventas</h3>
      <table id="tabla-ventas-rec"><thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Total</th></tr></thead><tbody></tbody></table>
    </div>
  `;

  const kpiRow = root.querySelector('#kpi-row');
  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);

  const [{ data: productos }, { data: ventasMes }, { data: ventasRecientes }] = await Promise.all([
    supabase.from('productos').select('codigo, nombre, stock').order('stock', { ascending: true }).limit(8),
    supabase.from('ventas').select('gran_total, moneda_pago').gte('fecha', inicioMes),
    supabase.from('ventas').select('fecha, numero_factura, gran_total, moneda_pago, clientes(nombre)').order('fecha', { ascending: false }).limit(8),
  ]);

  const totalMesUsd = (ventasMes || []).reduce((acc, v) => acc + Number(v.gran_total || 0), 0);
  const cantidadVentasMes = (ventasMes || []).length;
  const stockTotal = (productos || []).reduce((acc, p) => acc + Number(p.stock || 0), 0);

  kpiRow.innerHTML = `
    <div class="kpi"><div class="label">Ventas del mes</div><div class="value">${fmtUsd(totalMesUsd)}</div></div>
    <div class="kpi"><div class="label"># Ventas del mes</div><div class="value">${cantidadVentasMes}</div></div>
    <div class="kpi"><div class="label">Unidades en stock (top productos)</div><div class="value">${stockTotal}</div></div>
  `;

  const tbodyStock = root.querySelector('#tabla-stock-bajo tbody');
  tbodyStock.innerHTML = (productos || []).length
    ? productos.map(p => `
        <tr>
          <td>${p.codigo}</td>
          <td>${p.nombre}</td>
          <td><span class="badge ${Number(p.stock) <= 2 ? 'danger' : Number(p.stock) <= 5 ? 'warn' : 'ok'}">${p.stock}</span></td>
        </tr>`).join('')
    : `<tr><td colspan="3" class="empty-state">Sin productos cargados todavía</td></tr>`;

  const tbodyVentas = root.querySelector('#tabla-ventas-rec tbody');
  tbodyVentas.innerHTML = (ventasRecientes || []).length
    ? ventasRecientes.map(v => `
        <tr>
          <td>${fmtFecha(v.fecha)}</td>
          <td>#${v.numero_factura}</td>
          <td>${v.clientes ? v.clientes.nombre : '—'}</td>
          <td>${fmtUsd(v.gran_total)}</td>
        </tr>`).join('')
    : `<tr><td colspan="4" class="empty-state">Todavía no hay ventas registradas</td></tr>`;
}

module.exports = { render };
