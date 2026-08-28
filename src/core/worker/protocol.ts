export const WORKER_PROTOCOL_VERSION = 1 as const

export type WorkerRequest = {
  version: typeof WORKER_PROTOCOL_VERSION
  id: string
  method: string
  params: Record<string, unknown>
}

export type WorkerResponse = {
  version: typeof WORKER_PROTOCOL_VERSION
  id: string
  type: 'result' | 'error'
  result?: unknown
  error?: { code: string; message: string; details?: unknown }
}

export type WorkerEvent = {
  version: typeof WORKER_PROTOCOL_VERSION
  id: string
  type: 'event'
  event: string
  data: unknown
}

export type WorkerMessage = WorkerResponse | WorkerEvent

export type WorkerHealth = {
  status: 'ok'
  protocolVersion: number
  workerVersion: string
  pythonVersion: string
  platform: string
  activeJobs: number
  maxConcurrency: number
}

export type ToolCapability = {
  id: string
  available: boolean
  executable?: string
  version?: string
  error?: string
}

export type RunToolParams = {
  toolId: string
  args?: string[]
  cwd?: string
  timeoutSeconds?: number
}

export type RunToolResult = {
  toolId: string
  exitCode: number
  stdout: string
  stderr: string
  durationMs: number
}
