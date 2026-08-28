import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export type ImportedAsset = {
  id: string
  checksum: string
  originalName: string
  path: string
  artifactDirectory: string
  size: number
}

export class AssetStore {
  constructor(private readonly dataDirectory: string) {}

  async importFile(sourcePath: string): Promise<ImportedAsset> {
    const sourceStat = await stat(sourcePath)
    if (!sourceStat.isFile()) throw new Error('Selected resource is not a file.')

    const checksum = await hashFile(sourcePath)
    const assetDirectory = join(this.dataDirectory, 'assets', checksum)
    const artifactDirectory = join(this.dataDirectory, 'artifacts', checksum)
    const extension = safeExtension(extname(sourcePath))
    const destination = join(assetDirectory, `original${extension}`)

    await mkdir(assetDirectory, { recursive: true })
    await mkdir(artifactDirectory, { recursive: true })
    try {
      await stat(destination)
    } catch {
      await copyFile(sourcePath, destination)
    }

    return {
      id: `sha256:${checksum}`,
      checksum,
      originalName: basename(sourcePath),
      path: destination,
      artifactDirectory,
      size: sourceStat.size
    }
  }
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.once('error', reject)
    stream.once('end', () => resolve(hash.digest('hex')))
  })
}

function safeExtension(extension: string): string {
  return /^\.[a-zA-Z0-9]{1,10}$/.test(extension) ? extension.toLowerCase() : ''
}
