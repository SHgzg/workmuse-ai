import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'

type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'disabled'
  message: string
  version?: string
  percent?: number
}

let mainWindow: BrowserWindow | null = null

function updater(): AppUpdater {
  return electronUpdater.autoUpdater
}

function sendUpdateState(state: UpdateState): void {
  mainWindow?.webContents.send('update:state', state)
}

function configureAutoUpdater(): void {
  if (!app.isPackaged) {
    sendUpdateState({ status: 'disabled', message: '开发模式不连接 GitHub Releases；请安装打包产物后测试更新。' })
    return
  }

  const autoUpdater = updater()
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    sendUpdateState({ status: 'checking', message: '正在检查更新…' })
  })
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    sendUpdateState({ status: 'available', message: `发现新版本 ${info.version}，即将下载。`, version: info.version })
  })
  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    sendUpdateState({ status: 'not-available', message: `当前已是最新版本 ${info.version}。`, version: info.version })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    sendUpdateState({
      status: 'downloading',
      message: `正在下载 ${progress.percent.toFixed(1)}%`,
      percent: progress.percent
    })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    sendUpdateState({ status: 'downloaded', message: `版本 ${info.version} 已就绪，可以重启安装。`, version: info.version })
  })
  autoUpdater.on('error', (error: Error) => {
    sendUpdateState({ status: 'error', message: `更新失败：${error.message}` })
  })

  void autoUpdater.checkForUpdates().catch((error: Error) => {
    sendUpdateState({ status: 'error', message: `检查更新失败：${error.message}` })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 520,
    minWidth: 620,
    minHeight: 440,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, message: '开发模式不检查远程更新。' }
    }
    await updater().checkForUpdates()
    return { ok: true }
  })
  ipcMain.handle('update:install', () => {
    if (app.isPackaged) updater().quitAndInstall(false, true)
  })

  createWindow()
  configureAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
