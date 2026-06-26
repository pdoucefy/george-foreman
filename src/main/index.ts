import { is } from '@electron-toolkit/utils';

import { BrowserWindow, Menu, MenuItem, app, nativeImage, shell } from 'electron';
import { join } from 'path';

import { checkOpenCodeBinary } from './binary-check.ts';
import { registerIpcHandlers } from './ipc-handlers.ts';
import { storeGet, storeSet } from './store.ts';
import { shouldAllowNewInstance, shouldHideOnClose } from './window.ts';
import { scanWorkspace } from './workspace.ts';

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

const getIconPath = (): string =>
  is.dev
    ? join(__dirname, '../../resources/icon-1024.png')
    : join(process.resourcesPath, 'icon-1024.png');

const runStartupChecks = async (win: BrowserWindow): Promise<void> => {
  const result = await checkOpenCodeBinary();
  win.webContents.send('binary:status', { found: result.found });

  const { workspaceFolder } = storeGet('config');
  if (workspaceFolder !== '') {
    const repos = await scanWorkspace(workspaceFolder);
    win.webContents.send('workspace:updated', repos);
  }
};

const createWindow = (): void => {
  const savedBounds = storeGet('config').windowBounds;

  mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 900,
    height: savedBounds?.height ?? 650,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 700,
    minHeight: 500,
    show: false,
    title: 'George Foreman',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  // Persist window bounds on move/resize (debounced)
  let boundsTimer: ReturnType<typeof setTimeout> | null = null;
  const saveBounds = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      if (!mainWindow) return;
      const { x, y, width, height } = mainWindow.getBounds();
      const config = storeGet('config');
      storeSet('config', { ...config, windowBounds: { x, y, width, height } });
    }, 500);
  };
  mainWindow.on('resize', saveBounds);
  mainWindow.on('move', saveBounds);

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

    // Register Cmd+, shortcut via application menu
    const appMenu = Menu.getApplicationMenu() ?? new Menu();
    appMenu.append(
      new MenuItem({
        label: 'Preferences…',
        accelerator: 'CmdOrCtrl+,',
        click: () => mainWindow?.webContents.send('navigate:settings'),
      }),
    );
    Menu.setApplicationMenu(appMenu);

    createWindow();

    if (mainWindow) {
      registerIpcHandlers(mainWindow);
      // Run startup checks after the renderer is ready to receive IPC pushes
      mainWindow.webContents.once('did-finish-load', () => {
        if (mainWindow) {
          runStartupChecks(mainWindow).catch(console.error);
        }
      });
    }
  });
}
