import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'

export type PythonRuntimeOptions = {
  appPath: string
  resourcesPath?: string
  overridePath?: string
}

export type WorkerRuntime = {
  executable: string
  argsPrefix: string[]
  kind: 'sidecar' | 'python'
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export async function resolvePythonRuntime(options: PythonRuntimeOptions): Promise<string> {
  const executable = process.platform === 'win32' ? 'python.exe' : 'python3'
  const candidates = [
    options.overridePath,
    process.env.WORKMUSE_PYTHON,
    options.resourcesPath ? join(options.resourcesPath, 'runtime', 'python', executable) : undefined,
    join(options.appPath, '.runtime', 'python', executable)
  ].filter((candidate): candidate is string => Boolean(candidate))

  for (const candidate of candidates) {
    if (await isExecutable(candidate)) return candidate
  }

  throw new Error(
    'Python runtime is unavailable. Install the WorkMuse managed runtime or set WORKMUSE_PYTHON to an executable path.'
  )
}

export async function resolveWorkerRuntime(
  options: PythonRuntimeOptions & { workerPath: string }
): Promise<WorkerRuntime> {
  const sidecarName = process.platform === 'win32' ? 'workmuse-worker.exe' : 'workmuse-worker'
  const sidecarCandidates = [
    options.resourcesPath ? join(options.resourcesPath, 'runtime', sidecarName) : undefined,
    join(options.appPath, 'build', 'runtime', sidecarName)
  ].filter((candidate): candidate is string => Boolean(candidate))
  for (const candidate of sidecarCandidates) {
    if (await isExecutable(candidate)) return { executable: candidate, argsPrefix: [], kind: 'sidecar' }
  }
  const python = await resolvePythonRuntime(options)
  return { executable: python, argsPrefix: [options.workerPath], kind: 'python' }
}
