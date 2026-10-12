const { createClient } = require('@supabase/supabase-js');
const Store = require('electron-store');

// --- Configuración del proyecto Supabase de Maka Clothing ---
const SUPABASE_URL = 'https://weogaglkqshgwdhpkagn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_cqp7jMes8kqIuquE3YFk2A_i58ivrsO';

const store = new Store({ name: 'maka-session' });

// Persistimos la sesión de Supabase en disco (electron-store) para no pedir
// login cada vez que se abre la app.
const customStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key),
};

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: customStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

module.exports = { supabase };
