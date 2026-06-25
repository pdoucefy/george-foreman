import { is } from '@electron-toolkit/utils';

import { BrowserWindow, Menu, app, nativeImage, shell } from 'electron';
import { join } from 'path';

import { shouldAllowNewInstance, shouldHideOnClose } from './window.ts';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const getIconPath = (): string =>
  is.dev
    ? join(__dirname, '../../resources/icon-1024.png')
    : join(process.resourcesPath, 'icon-1024.png');

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    title: 'George Foreman',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (app.dock) app.dock.show();
  });

  mainWindow.on('close', (event) => {
    const action = shouldHideOnClose(isQuitting);
    if (action === 'hide') {
      event.preventDefault();
      mainWindow?.hide();
      if (app.dock) app.dock.hide();
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

// Keep the app alive when all windows are closed (Dock-resident app)
app.on('window-all-closed', () => {
  // Do not quit — the app lives in the Dock
});

// Cmd+Q and other system quit triggers should exit the app
app.on('before-quit', () => {
  isQuitting = true;
});

// Enforce single instance — focus existing window if another instance is launched
const hasLock = app.requestSingleInstanceLock();
if (shouldAllowNewInstance(hasLock) === 'quit') {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow?.show();
    mainWindow?.focus();
    if (app.dock) app.dock.show();
  });

  app.whenReady().then(() => {
    if (app.dock) {
      const icon = nativeImage.createFromPath(getIconPath());
      if (!icon.isEmpty()) app.dock.setIcon(icon);

      app.dock.setMenu(
        Menu.buildFromTemplate([
          {
            label: 'Settings',
            click: () => {
              mainWindow?.show();
              mainWindow?.focus();
              if (app.dock) app.dock.show();
              mainWindow?.webContents.send('navigate:settings');
            },
          },
        ]),
      );
    }

    createWindow();
  });
}
