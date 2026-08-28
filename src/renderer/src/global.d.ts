import type { UpdateState } from '../../preload'

declare global {
  interface Window {
    updater: {
      getVersion(): Promise<string>
      check(): Promise<{ ok: boolean; message?: string }>
      install(): Promise<void>
      onState(callback: (state: UpdateState) => void): () => void
    }
  }
}

export {}
