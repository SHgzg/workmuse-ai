import { contextBridge, ipcRenderer } from 'electron'

export type UpdateState = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'disabled'
  message: string
  version?: string
  percent?: number
}

const updaterApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  check: (): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('update:check'),
  install: (): Promise<void> => ipcRenderer.invoke('update:install'),
  onState: (callback: (state: UpdateState) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: UpdateState): void => callback(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  }
}

contextBridge.exposeInMainWorld('updater', updaterApi)
