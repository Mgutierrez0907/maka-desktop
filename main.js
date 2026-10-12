const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// En algunas instalaciones de Linux el sandbox de Chromium necesita permisos de root.
// Lo desactivamos acá adentro para que la app instalada abra igual sin depender de cómo se invoque.
app.commandLine.appendSwitch('no-sandbox');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0f1115',
    icon: path.join(__dirname, '..', 'assets', 'logo.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// Lógica de actualizaciones automáticas (electron-updater + GitHub Releases)
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

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  createWindow();
  configurarAutoUpdate();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});