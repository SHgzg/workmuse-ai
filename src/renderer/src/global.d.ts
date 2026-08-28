import type { CoreSettings, CoreStatus, UpdateState } from '../../preload'

declare global {
  interface Window {
    updater: {
      getVersion(): Promise<string>
      check(): Promise<{ ok: boolean; message?: string }>
      install(): Promise<{ ok: boolean; message?: string }>
      onState(callback: (state: UpdateState) => void): () => void
    }
    workmuseCore: {
      status(): Promise<CoreStatus>
      importResource(): Promise<unknown>
      jobs(): Promise<unknown>
      cancelJob(jobId: string): Promise<boolean>
      retryJob(jobId: string): Promise<unknown>
      search(query: string, limit?: number): Promise<unknown>
      buildContext(query: string): Promise<unknown>
      answer(question: string): Promise<unknown>
      getSettings(): Promise<CoreSettings | null>
      updateSettings(settings: Partial<CoreSettings> & { apiKey?: string; clearApiKey?: boolean }): Promise<CoreSettings>
      onEvent(callback: (event: unknown) => void): () => void
    }
  }
}

export {}
