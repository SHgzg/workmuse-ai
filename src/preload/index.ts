import { contextBridge, ipcRenderer } from 'electron'

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'protecting' | 'downloaded' | 'error' | 'disabled'
  message: string
  version?: string
  percent?: number
}

const updaterApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  check: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('update:check'),
  install: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('update:install'),
  onState: (callback: (state: UpdateState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  }
}

export type CoreStatus = {
  available: boolean
  error: string | null
  capabilities: unknown
}

export type CoreSettings = {
  baseUrl: string
  semanticModel: string
  embeddingModel: string
  transcriptionModel: string
  allowCloud: boolean
  hasApiKey: boolean
}

const coreApi = {
  status: (): Promise<CoreStatus> => ipcRenderer.invoke('core:status'),
  importResource: (): Promise<unknown> => ipcRenderer.invoke('core:import'),
  jobs: (): Promise<unknown> => ipcRenderer.invoke('core:jobs'),
  cancelJob: (jobId: string): Promise<boolean> => ipcRenderer.invoke('core:job-cancel', jobId),
  retryJob: (jobId: string): Promise<unknown> => ipcRenderer.invoke('core:job-retry', jobId),
  search: (query: string, limit?: number): Promise<unknown> => ipcRenderer.invoke('core:search', query, limit),
  buildContext: (query: string): Promise<unknown> => ipcRenderer.invoke('core:context', query),
  answer: (question: string): Promise<unknown> => ipcRenderer.invoke('core:answer', question),
  getSettings: (): Promise<CoreSettings | null> => ipcRenderer.invoke('core:settings-get'),
  updateSettings: (settings: Partial<CoreSettings> & { apiKey?: string; clearApiKey?: boolean }): Promise<CoreSettings> =>
    ipcRenderer.invoke('core:settings-set', settings),
  onEvent: (callback: (event: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, workerEvent: unknown): void => callback(workerEvent)
    ipcRenderer.on('core:event', listener)
    return () => ipcRenderer.removeListener('core:event', listener)
  }
}

contextBridge.exposeInMainWorld('updater', updaterApi)
contextBridge.exposeInMainWorld('workmuseCore', coreApi)
