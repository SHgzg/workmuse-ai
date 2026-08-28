import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import electronUpdater, { type AppUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { AssetStore, PythonWorkerClient, ResourceCore, resolveWorkerRuntime } from '../core'
import { DataProtectionService } from './data-protection'
import { CoreConfigStore, type PublicCoreSettings } from './core-config'

type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'protecting' | 'downloaded' | 'error' | 'disabled'
  message: string
  version?: string
  percent?: number
}

let mainWindow: BrowserWindow | null = null
let workerClient: PythonWorkerClient | null = null
let resourceCore: ResourceCore | null = null
let assetStore: AssetStore | null = null
let coreStartupError: string | null = null
let dataProtection: DataProtectionService | null = null
let downloadedVersion: string | null = null
let coreConfig: CoreConfigStore | null = null

async function initializeCore(): Promise<void> {
  const dataDirectory = join(app.getPath('userData'), 'core')
  assetStore = new AssetStore(dataDirectory)
  if (workerClient) {
    await workerClient.stop()
    workerClient = null
    resourceCore = null
  }
  try {
    const workerPath = app.isPackaged
      ? join(process.resourcesPath, 'python-worker', 'worker.py')
      : join(app.getAppPath(), 'python-worker', 'worker.py')
    const runtime = await resolveWorkerRuntime({
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      workerPath
    })
    workerClient = new PythonWorkerClient({
      pythonPath: runtime.executable,
      argsPrefix: runtime.argsPrefix,
      cwd: app.isPackaged ? process.resourcesPath : app.getAppPath(),
      allowedRoots: [dataDirectory],
      stateDirectory: join(dataDirectory, 'state'),
      environment: coreConfig?.workerEnvironment(),
      maxConcurrency: 2
    })
    await workerClient.start()
    workerClient.on('event', (event) => mainWindow?.webContents.send('core:event', event))
    resourceCore = new ResourceCore(workerClient)
    coreStartupError = null
  } catch (error) {
    coreStartupError = error instanceof Error ? error.message : String(error)
    resourceCore = null
  }
}

function registerCoreIpc(): void {
  ipcMain.handle('core:status', async () => {
    const [tools, runtime] = resourceCore
      ? await Promise.all([resourceCore.listCapabilities(), resourceCore.inspectRuntime()])
      : [[], null]
    return {
      available: Boolean(resourceCore),
      error: coreStartupError,
      capabilities: { tools, runtime }
    }
  })
  ipcMain.handle('core:import', async () => {
    if (!mainWindow || !assetStore) throw new Error('Core is not initialized.')
    const selection = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: '选择需要理解的资料'
    })
    if (selection.canceled || !selection.filePaths[0]) return null
    const asset = await assetStore.importFile(selection.filePaths[0])
    if (!resourceCore) {
      return { asset, processing: null, error: coreStartupError }
    }
    const processing = await resourceCore.understand({
      path: asset.path,
      outputDirectory: asset.artifactDirectory,
      allowCloud: coreConfig?.publicSettings().allowCloud ?? false
    })
    return { asset, processing, error: null }
  })
  ipcMain.handle('core:jobs', async () => {
    if (!workerClient) return []
    return workerClient.request('jobs.list', { limit: 100 }, 10_000)
  })
  ipcMain.handle('core:job-cancel', async (_event, jobId: unknown) => {
    if (!workerClient || typeof jobId !== 'string') return false
    return workerClient.cancel(jobId)
  })
  ipcMain.handle('core:job-retry', async (_event, jobId: unknown) => {
    if (!workerClient || typeof jobId !== 'string') throw new Error('Invalid job id.')
    return workerClient.request('jobs.retry', { jobId }, 10_000)
  })
  ipcMain.handle('core:search', async (_event, query: unknown, limit: unknown) => {
    if (!resourceCore || typeof query !== 'string') return []
    return resourceCore.search(
      query,
      typeof limit === 'number' ? limit : 20,
      undefined,
      coreConfig?.publicSettings().allowCloud ?? false
    )
  })
  ipcMain.handle('core:context', async (_event, query: unknown) => {
    if (!resourceCore || typeof query !== 'string') throw new Error('Core is unavailable.')
    return resourceCore.buildContext(query, 12_000, undefined, coreConfig?.publicSettings().allowCloud ?? false)
  })
  ipcMain.handle('core:answer', async (_event, question: unknown) => {
    if (!resourceCore || typeof question !== 'string') throw new Error('Core is unavailable.')
    return resourceCore.answer(question, { allowCloud: coreConfig?.publicSettings().allowCloud ?? false })
  })
  ipcMain.handle('core:settings-get', () => coreConfig?.publicSettings() ?? null)
  ipcMain.handle('core:settings-set', async (_event, settings: unknown): Promise<PublicCoreSettings> => {
    if (!coreConfig) throw new Error('Core settings are unavailable.')
    const updated = await coreConfig.update(settings)
    await initializeCore()
    return updated
  })
}

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
  // Installation is always explicit so a verified data snapshot can be created first.
  autoUpdater.autoInstallOnAppQuit = false

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
    downloadedVersion = info.version
    sendUpdateState({ status: 'downloaded', message: `版本 ${info.version} 已就绪；安装前将备份本地数据。`, version: info.version })
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
    width: 1280,
    height: 800,
    minWidth: 980,
    minHeight: 620,
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

app.whenReady().then(async () => {
  dataProtection = new DataProtectionService(app.getPath('userData'))
  await dataProtection.initialize()
  coreConfig = new CoreConfigStore(join(app.getPath('userData'), 'core'))
  await coreConfig.initialize()
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, message: '开发模式不检查远程更新。' }
    }
    await updater().checkForUpdates()
    return { ok: true }
  })
  ipcMain.handle('update:install', async () => {
    if (!app.isPackaged || !downloadedVersion || !dataProtection) {
      return { ok: false, message: '当前没有可安装的更新。' }
    }

    sendUpdateState({ status: 'protecting', message: '正在备份并校验数据库、文件库和设置…', version: downloadedVersion })
    try {
      await workerClient?.stop()
      workerClient = null
      resourceCore = null
      const backup = await dataProtection.createUpdateBackup(app.getVersion(), downloadedVersion)
      sendUpdateState({ status: 'downloaded', message: `本地数据已安全备份（${backup.files} 个文件），正在安装…`, version: downloadedVersion })
      updater().quitAndInstall(false, true)
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await initializeCore()
      sendUpdateState({ status: 'error', message: `为保护本地数据，已取消安装：${message}` })
      return { ok: false, message }
    }
  })
  registerCoreIpc()
  await initializeCore()

  createWindow()
  configureAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => {
  void workerClient?.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
