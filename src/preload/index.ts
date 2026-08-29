import { contextBridge, ipcRenderer } from 'electron'
import type { ImportedAsset } from '../core/assets'
import type { QuestionAnswer, SearchContext, SearchResult, UnderstandResourceResult } from '../core/content'
import type { Goal, Inspiration, KnowledgeItem, Meeting, Outcome, Project, WorkTask, WorkspaceSnapshot } from '../core/domain'

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

export type CoreJob = {
  id: string
  method: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
  params: Record<string, unknown>
  result: unknown
  error: { code: string; message: string } | null
  createdAt: string
  updatedAt: string
}

export type CoreImportResult = {
  asset: ImportedAsset
  processing: UnderstandResourceResult | null
  error: string | null
}

export type CoreSettings = {
  baseUrl: string
  semanticModel: string
  embeddingModel: string
  transcriptionModel: string
  allowCloud: boolean
  hasApiKey: boolean
}

export type AuthState = {
  configured: boolean
  authenticated: boolean
  profile: { email: string; displayName: string } | null
}

const coreApi = {
  status: (): Promise<CoreStatus> => ipcRenderer.invoke('core:status'),
  importResource: (): Promise<CoreImportResult | null> => ipcRenderer.invoke('core:import'),
  jobs: (): Promise<CoreJob[]> => ipcRenderer.invoke('core:jobs'),
  cancelJob: (jobId: string): Promise<boolean> => ipcRenderer.invoke('core:job-cancel', jobId),
  retryJob: (jobId: string): Promise<unknown> => ipcRenderer.invoke('core:job-retry', jobId),
  search: (query: string, limit?: number): Promise<SearchResult[]> => ipcRenderer.invoke('core:search', query, limit),
  openSource: (resourceId: string): Promise<boolean> => ipcRenderer.invoke('core:open-source', resourceId),
  buildContext: (query: string): Promise<SearchContext> => ipcRenderer.invoke('core:context', query),
  answer: (question: string): Promise<QuestionAnswer> => ipcRenderer.invoke('core:answer', question),
  getSettings: (): Promise<CoreSettings | null> => ipcRenderer.invoke('core:settings-get'),
  updateSettings: (settings: Partial<CoreSettings> & { apiKey?: string; clearApiKey?: boolean }): Promise<CoreSettings> =>
    ipcRenderer.invoke('core:settings-set', settings),
  onEvent: (callback: (event: unknown) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, workerEvent: unknown): void => callback(workerEvent)
    ipcRenderer.on('core:event', listener)
    return () => ipcRenderer.removeListener('core:event', listener)
  }
}

const workspaceApi = {
  list: (): Promise<WorkspaceSnapshot> => ipcRenderer.invoke('workspace:list'),
  createGoal: (input: unknown): Promise<Goal> => ipcRenderer.invoke('workspace:goal-create', input),
  createTask: (input: unknown): Promise<WorkTask> => ipcRenderer.invoke('workspace:task-create', input),
  createOutcome: (input: unknown): Promise<Outcome> => ipcRenderer.invoke('workspace:outcome-create', input),
  updateTaskStatus: (id: string, status: WorkTask['status']): Promise<WorkTask> => ipcRenderer.invoke('workspace:task-status', id, status),
  updateOutcomeStatus: (id: string, status: Outcome['status']): Promise<Outcome> => ipcRenderer.invoke('workspace:outcome-status', id, status),
  updateGoalProgress: (id: string, input: { current?: number | null; status?: Goal['status'] }): Promise<Goal> => ipcRenderer.invoke('workspace:goal-progress', id, input),
  updateMeetingStatus: (id: string, status: Meeting['status']): Promise<Meeting> => ipcRenderer.invoke('workspace:meeting-status', id, status),
  attachMeetingResource: (id: string, resourceId: string): Promise<Meeting> => ipcRenderer.invoke('workspace:meeting-attach-resource', id, resourceId),
  createInspiration: (input: unknown): Promise<Inspiration> => ipcRenderer.invoke('workspace:inspiration-create', input),
  convertInspirationToTask: (id: string, input?: unknown): Promise<WorkTask> => ipcRenderer.invoke('workspace:inspiration-convert', id, input ?? {}),
  createProject: (input: unknown): Promise<Project> => ipcRenderer.invoke('workspace:project-create', input),
  createMeeting: (input: unknown): Promise<Meeting> => ipcRenderer.invoke('workspace:meeting-create', input),
  confirmKnowledge: (input: unknown): Promise<KnowledgeItem> => ipcRenderer.invoke('workspace:knowledge-confirm', input)
}

const authApi = {
  state: (): Promise<AuthState> => ipcRenderer.invoke('auth:state'),
  login: (input: { email: string; password: string; displayName?: string }): Promise<AuthState> => ipcRenderer.invoke('auth:login', input),
  logout: (): Promise<AuthState> => ipcRenderer.invoke('auth:logout')
}

contextBridge.exposeInMainWorld('updater', updaterApi)
contextBridge.exposeInMainWorld('workmuseCore', coreApi)
contextBridge.exposeInMainWorld('workmuseWorkspace', workspaceApi)
contextBridge.exposeInMainWorld('workmuseAuth', authApi)
