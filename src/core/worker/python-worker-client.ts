import { EventEmitter } from 'node:events'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import type { WorkerEvent, WorkerHealth, WorkerMessage, WorkerRequest } from './protocol'
import { WORKER_PROTOCOL_VERSION } from './protocol'

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
  timer: NodeJS.Timeout
}

export type PythonWorkerClientOptions = {
  pythonPath: string
  workerPath?: string
  argsPrefix?: string[]
  cwd: string
  maxConcurrency?: number
  startupTimeoutMs?: number
  allowedRoots?: string[]
  stateDirectory?: string
  environment?: Record<string, string>
}

export class PythonWorkerClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null
  private readonly pending = new Map<string, PendingRequest>()
  private stopping = false

  constructor(private readonly options: PythonWorkerClientOptions) {
    super()
  }

  async start(): Promise<WorkerHealth> {
    if (this.process) return this.request<WorkerHealth>('system.health')

    this.stopping = false
    const args = [
      ...(this.options.argsPrefix ?? (this.options.workerPath ? [this.options.workerPath] : [])),
      '--max-concurrency',
      String(this.options.maxConcurrency ?? 2)
    ]
    for (const root of this.options.allowedRoots ?? [this.options.cwd]) {
      args.push('--allowed-root', root)
    }
    if (this.options.stateDirectory) args.push('--state-directory', this.options.stateDirectory)
    const child = spawn(this.options.pythonPath, args, {
      cwd: this.options.cwd,
      windowsHide: true,
      env: { ...process.env, ...this.options.environment },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.process = child

    const lines = createInterface({ input: child.stdout }) as unknown as {
      on(event: 'line', listener: (line: string) => void): void
    }
    lines.on('line', (line: string) => this.handleLine(line))
    child.stderr.on('data', (chunk: Buffer) => this.emit('diagnostic', chunk.toString()))
    const childEvents = child as unknown as {
      once(event: 'error', listener: (error: Error) => void): void
      once(event: 'exit', listener: (code: number | null, signal: string | null) => void): void
    }
    childEvents.once('error', (error: Error) => this.handleExit(error))
    childEvents.once('exit', (code: number | null, signal: string | null) => {
      if (!this.stopping) this.handleExit(new Error(`Python worker exited (${code ?? signal ?? 'unknown'}).`))
    })

    return this.request<WorkerHealth>('system.health', {}, this.options.startupTimeoutMs ?? 10_000)
  }

  request<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 300_000): Promise<T> {
    if (!this.process?.stdin.writable) return Promise.reject(new Error('Python worker is not running.'))

    const id = randomUUID()
    const message: WorkerRequest = { version: WORKER_PROTOCOL_VERSION, id, method, params }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        void this.cancel(id)
        reject(new Error(`Worker request timed out: ${method}`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      })
      this.process?.stdin.write(`${JSON.stringify(message)}\n`)
    })
  }

  async cancel(jobId: string): Promise<boolean> {
    if (!this.process?.stdin.writable) return false
    const id = randomUUID()
    const message: WorkerRequest = {
      version: WORKER_PROTOCOL_VERSION,
      id,
      method: 'task.cancel',
      params: { jobId }
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`)
    return true
  }

  async stop(): Promise<void> {
    if (!this.process) return
    this.stopping = true
    const child = this.process
    try {
      await this.request('system.shutdown', {}, 3_000)
      child.stdin.end()
      await new Promise<void>((resolve) => {
        const childState = child as unknown as {
          exitCode: number | null
          once(event: 'exit', listener: () => void): void
        }
        if (childState.exitCode !== null) {
          resolve()
          return
        }
        const timer = setTimeout(() => {
          child.kill()
          resolve()
        }, 3_000)
        childState.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    } catch {
      child.kill()
    } finally {
      this.process = null
      this.rejectAll(new Error('Python worker stopped.'))
    }
  }

  private handleLine(line: string): void {
    let message: WorkerMessage
    try {
      message = JSON.parse(line) as WorkerMessage
    } catch {
      this.emit('diagnostic', `Invalid worker output: ${line}`)
      return
    }

    if (message.version !== WORKER_PROTOCOL_VERSION) {
      this.handleExit(new Error(`Unsupported worker protocol version: ${message.version}`))
      return
    }

    if (message.type === 'event') {
      this.emit('event', message as WorkerEvent)
      return
    }

    const pending = this.pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id)

    if (message.type === 'error') {
      const error = new Error(message.error?.message ?? 'Worker request failed.')
      error.name = message.error?.code ?? 'WorkerError'
      pending.reject(error)
    } else {
      pending.resolve(message.result)
    }
  }

  private handleExit(error: Error): void {
    this.process = null
    this.rejectAll(error)
    this.emit('worker-error', error)
  }

  private rejectAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }
}
