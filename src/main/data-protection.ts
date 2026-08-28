import { cp, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type ProtectedDataPaths = {
  root: string
  core: string
  database: string
  library: string
  settings: string
  backups: string
}

type TreeStats = { files: number; bytes: number }

export type UpdateBackup = {
  path: string
  files: number
  bytes: number
}

export class DataProtectionService {
  readonly paths: ProtectedDataPaths

  constructor(userDataPath: string) {
    this.paths = {
      root: userDataPath,
      core: join(userDataPath, 'core'),
      database: join(userDataPath, 'database'),
      library: join(userDataPath, 'library'),
      settings: join(userDataPath, 'settings'),
      backups: join(userDataPath, 'update-backups')
    }
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(this.paths.core, { recursive: true }),
      mkdir(this.paths.database, { recursive: true }),
      mkdir(this.paths.library, { recursive: true }),
      mkdir(this.paths.settings, { recursive: true }),
      mkdir(this.paths.backups, { recursive: true })
    ])
  }

  async createUpdateBackup(fromVersion: string, toVersion: string): Promise<UpdateBackup> {
    await this.initialize()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const name = `${stamp}-v${fromVersion}-to-v${toVersion}`
    const temporaryPath = join(this.paths.backups, `${name}.partial`)
    const finalPath = join(this.paths.backups, name)
    const protectedRoots = ['core', 'database', 'library', 'settings'] as const

    await rm(temporaryPath, { recursive: true, force: true })
    await mkdir(temporaryPath, { recursive: true })

    try {
      let files = 0
      let bytes = 0
      const verification: Record<string, TreeStats> = {}

      for (const key of protectedRoots) {
        const source = this.paths[key]
        const destination = join(temporaryPath, key)
        await cp(source, destination, { recursive: true, force: false, errorOnExist: true })
        const sourceStats = await inspectTree(source)
        const destinationStats = await inspectTree(destination)
        if (sourceStats.files !== destinationStats.files || sourceStats.bytes !== destinationStats.bytes) {
          throw new Error(`${key} 数据校验失败：源数据与备份大小不一致。`)
        }
        verification[key] = destinationStats
        files += destinationStats.files
        bytes += destinationStats.bytes
      }

      await writeFile(join(temporaryPath, 'manifest.json'), JSON.stringify({
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        fromVersion,
        toVersion,
        protectedRoot: this.paths.root,
        verification
      }, null, 2), { encoding: 'utf8', flag: 'wx' })

      await rename(temporaryPath, finalPath)
      await this.pruneBackups(3)
      return { path: finalPath, files, bytes }
    } catch (error) {
      await rm(temporaryPath, { recursive: true, force: true })
      throw error
    }
  }

  private async pruneBackups(keep: number): Promise<void> {
    const entries = await readdir(this.paths.backups, { withFileTypes: true })
    const completed = entries.filter((entry) => entry.isDirectory() && !entry.name.endsWith('.partial'))
      .sort((left, right) => right.name.localeCompare(left.name))
    await Promise.all(completed.slice(keep).map((entry) => rm(join(this.paths.backups, entry.name), {
      recursive: true,
      force: true
    })))
  }
}

async function inspectTree(root: string): Promise<TreeStats> {
  const result: TreeStats = { files: 0, bytes: 0 }
  const entries = await readdir(root, { withFileTypes: true })
  for (const entry of entries) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      const child = await inspectTree(path)
      result.files += child.files
      result.bytes += child.bytes
    } else if (entry.isFile()) {
      const file = await stat(path)
      result.files += 1
      result.bytes += file.size
    }
  }
  return result
}
