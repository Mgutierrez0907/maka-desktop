const { supabase } = require('./supabaseClient');

// ---- Vistas disponibles, filtradas por rol ----
const VIEWS = [
  { id: 'resumen', label: 'Resumen', icon: '📊', roles: ['admin', 'ventas'], mod: './views/resumen.js' },
  { id: 'ventas', label: 'Ventas', icon: '🧾', roles: ['admin', 'ventas'], mod: './views/ventas.js' },
  { id: 'presupuestos', label: 'Presupuestos', icon: '📋', roles: ['admin', 'ventas'], mod: './views/presupuestos.js' },
  { id: 'clientes', label: 'Clientes', icon: '👤', roles: ['admin', 'ventas'], mod: './views/clientes.js' },
  { id: 'productos', label: 'Producto terminado', icon: '👕', roles: ['admin', 'ventas'], mod: './views/productos.js' },
  { id: 'materia-prima', label: 'Materia prima', icon: '🧵', roles: ['admin', 'ventas'], mod: './views/materiaPrima.js' },
  { id: 'compras', label: 'Compras', icon: '🛒', roles: ['admin'], mod: './views/compras.js' },
  { id: 'config', label: 'Configuración', icon: '⚙️', roles: ['admin'], mod: './views/config.js' },
];

let currentProfile = null; // { id, nombre, rol }
let currentViewId = null;

const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const loginBtn = document.getElementById('login-btn');
const navMenu = document.getElementById('nav-menu');
const userChip = document.getElementById('user-chip');
const viewRoot = document.getElementById('view-root');

function showToast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ---------------- Login ----------------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Entrando...';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  loginBtn.disabled = false;
  loginBtn.textContent = 'Entrar';

  if (error) {
    loginError.textContent = 'No se pudo entrar: ' + error.message;
    return;
  }
  await bootApp();
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  currentProfile = null;
  appScreen.classList.add('hidden');
  loginScreen.classList.remove('hidden');
});

// ---------------- Boot ----------------
async function bootApp() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    loginScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
    return;
  }

  const { data: perfil, error } = await supabase
    .from('perfiles')
    .select('id, nombre, rol, activo')
    .eq('id', user.id)
    .single();

  if (error || !perfil) {
    loginError.textContent = 'Tu usuario no tiene un perfil asignado en Maka Clothing. Avisale a Malcom.';
    await supabase.auth.signOut();
    return;
  }
  if (!perfil.activo) {
    loginError.textContent = 'Tu usuario está desactivado.';
    await supabase.auth.signOut();
    return;
  }

  currentProfile = perfil;
  loginScreen.classList.add('hidden');
  appScreen.classList.remove('hidden');

  userChip.innerHTML = `<b>${perfil.nombre}</b>${perfil.rol === 'admin' ? 'Administrador' : 'Ventas'}`;

  buildNav();
  navigateTo(VIEWS.find(v => v.roles.includes(perfil.rol)).id);
}

function buildNav() {
  navMenu.innerHTML = '';
  VIEWS.filter(v => v.roles.includes(currentProfile.rol)).forEach(v => {
    const item = document.createElement('div');
    item.className = 'nav-item';
    item.dataset.view = v.id;
    item.innerHTML = `<span>${v.icon}</span><span>${v.label}</span>`;
    item.addEventListener('click', () => navigateTo(v.id));
    navMenu.appendChild(item);
  });
}

async function navigateTo(viewId) {
  const view = VIEWS.find(v => v.id === viewId);
  if (!view || !view.roles.includes(currentProfile.rol)) return;

  currentViewId = viewId;
  [...navMenu.children].forEach(el => {
    el.classList.toggle('active', el.dataset.view === viewId);
  });

  viewRoot.innerHTML = '<p class="empty-state">Cargando...</p>';
  try {
    const mod = require(view.mod);
    await mod.render(viewRoot, {
      supabase,
      profile: currentProfile,
      showToast,
      reload: () => navigateTo(viewId),
    });
  } catch (err) {
    console.error(err);
    viewRoot.innerHTML = `<p class="empty-state">Error cargando la vista: ${err.message}</p>`;
  }
}

// ---------------- Arranque ----------------
(async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await bootApp();
  }
})();
