const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// En algunas instalaciones de Linux (fuera de npm start) el sandbox de
// Chromium necesita permisos de root que un .deb normal no configura.
// Lo desactivamos acá adentro para que la app instalada abra igual,
// sin depender de cómo se la invoque.
app.commandLine.appendSwitch('no-sandbox');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    title: 'Maka Clothing — Gestión',
    webPreferences: {
      // Prototipo: nodeIntegration habilitado para usar require() directo
      // en el renderer. Si más adelante querés endurecer esto, se mueve
      // todo a preload.js con contextBridge — avisame y lo hacemos.
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
}

// ---------------------------------------------------------------------
// Actualizaciones automáticas (electron-updater + GitHub Releases)
//
// Solo funciona en la app empaquetada (app.isPackaged) — en desarrollo
// (npm start) no hay nada publicado todavía, así que no hacemos nada.
//
// Funciona de maneras distintas según el sistema operativo:
//  - Windows (.exe / NSIS): soporta descarga + instalación silenciosa.
//  - Linux AppImage: también soporta descarga + reemplazo automático.
//  - Linux .deb: NO soporta auto-actualización (limitación de
//    electron-updater). Si instalaste el .deb, el chequeo de abajo solo
//    te va a avisar que hay una versión nueva, pero tenés que bajar e
//    instalar el .deb nuevo a mano (ver README).
// ---------------------------------------------------------------------
function configurarAutoUpdate() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('Actualización disponible:', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('La app ya está en la última versión.');
  });

  autoUpdater.on('error', (err) => {
    console.error('Error buscando actualizaciones:', err == null ? 'desconocido' : err.message);
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (!mainWindow) return;
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualización lista',
        message: `Hay una nueva versión de Maka Clothing (${info.version}) lista para instalar.`,
        detail: 'Se va a instalar la próxima vez que cierres el programa, o podés reiniciar ahora mismo.',
        buttons: ['Reiniciar ahora', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  // Chequeo al abrir la app, y uno nuevo cada 4 horas mientras queda abierta.
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

app.whenReady().then(() => {
  createWindow();
  configurarAutoUpdate();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
