import { is } from '@electron-toolkit/utils';

import { BrowserWindow, Menu, Tray, app, nativeImage, shell } from 'electron';
import { join } from 'path';

import { createTrayIconDataURL } from './tray-icon.ts';
import { shouldAllowNewInstance, shouldHideOnClose } from './window.ts';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const updateTrayMenu = (): void => {
  if (!tray) return;

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        mainWindow?.destroy(); // bypass 'close' event to ensure quit always works
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
};

const createWindow = (): void => {
  const icon = nativeImage.createFromDataURL(createTrayIconDataURL());

  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    title: 'George Foreman',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (event) => {
    const action = shouldHideOnClose(isQuitting);
    if (action === 'hide') {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

const createTray = (): void => {
  const icon = nativeImage.createFromDataURL(createTrayIconDataURL());
  tray = new Tray(icon);
  tray.setToolTip('George Foreman');
  updateTrayMenu();
};

// Keep the app alive when all windows are closed (tray-resident app)
app.on('window-all-closed', () => {
  // Do not quit — the app lives in the tray
});

// Cmd+Q and other system quit triggers should exit the app
app.on('before-quit', () => {
  isQuitting = true;
});

// Enforce single instance — quit immediately if another instance is running
const hasLock = app.requestSingleInstanceLock();
if (shouldAllowNewInstance(hasLock) === 'quit') {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();

    // Set dock icon (macOS)
    if (app.dock) {
      app.dock.setIcon(nativeImage.createFromDataURL(createTrayIconDataURL()));
    }

    tray?.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow?.show();
      }
    });
  });
}
