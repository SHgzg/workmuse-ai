import { safeStorage } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

export type PublicCoreSettings = {
  baseUrl: string
  semanticModel: string
  embeddingModel: string
  transcriptionModel: string
  allowCloud: boolean
  hasApiKey: boolean
}

type StoredCoreSettings = Omit<PublicCoreSettings, 'hasApiKey'> & {
  encryptedApiKey?: string
}

const DEFAULTS: StoredCoreSettings = {
  baseUrl: '',
  semanticModel: '',
  embeddingModel: '',
  transcriptionModel: '',
  allowCloud: false
}

export class CoreConfigStore {
  private readonly path: string
  private settings: StoredCoreSettings = { ...DEFAULTS }

  constructor(dataDirectory: string) {
    this.path = join(dataDirectory, 'settings.json')
  }

  async initialize(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<StoredCoreSettings>
      this.settings = { ...DEFAULTS, ...parsed }
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code !== 'ENOENT') throw error
    }
  }

  publicSettings(): PublicCoreSettings {
    return {
      baseUrl: this.settings.baseUrl,
      semanticModel: this.settings.semanticModel,
      embeddingModel: this.settings.embeddingModel,
      transcriptionModel: this.settings.transcriptionModel,
      allowCloud: this.settings.allowCloud,
      hasApiKey: Boolean(this.settings.encryptedApiKey)
    }
  }

  async update(input: unknown): Promise<PublicCoreSettings> {
    const value = validateSettings(input)
    let encryptedApiKey = this.settings.encryptedApiKey
    if (value.clearApiKey) encryptedApiKey = undefined
    if (value.apiKey) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('System credential encryption is unavailable; the API key was not saved.')
      }
      encryptedApiKey = safeStorage.encryptString(value.apiKey).toString('base64')
    }
    this.settings = {
      baseUrl: value.baseUrl,
      semanticModel: value.semanticModel,
      embeddingModel: value.embeddingModel,
      transcriptionModel: value.transcriptionModel,
      allowCloud: value.allowCloud,
      encryptedApiKey
    }
    await this.persist()
    return this.publicSettings()
  }

  workerEnvironment(): Record<string, string> {
    const environment: Record<string, string> = {
      WORKMUSE_AI_BASE_URL: this.settings.baseUrl,
      WORKMUSE_AI_MODEL: this.settings.semanticModel,
      WORKMUSE_EMBEDDING_MODEL: this.settings.embeddingModel,
      WORKMUSE_TRANSCRIPTION_MODEL: this.settings.transcriptionModel
    }
    if (this.settings.encryptedApiKey) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('System credential encryption is unavailable; the stored API key cannot be read.')
      }
      environment.WORKMUSE_AI_API_KEY = safeStorage.decryptString(
        Buffer.from(this.settings.encryptedApiKey, 'base64')
      )
    }
    return environment
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(this.settings, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.path)
  }
}

function validateSettings(input: unknown): {
  baseUrl: string
  semanticModel: string
  embeddingModel: string
  transcriptionModel: string
  allowCloud: boolean
  apiKey?: string
  clearApiKey: boolean
} {
  if (!input || typeof input !== 'object') throw new Error('Invalid Core settings.')
  const record = input as Record<string, unknown>
  const baseUrl = text(record.baseUrl, 2_048).replace(/\/$/, '')
  if (baseUrl) {
    const url = new URL(baseUrl)
    const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
      throw new Error('Model endpoints must use HTTPS; HTTP is allowed only for localhost.')
    }
    if (url.username || url.password) throw new Error('Credentials must not be embedded in the endpoint URL.')
  }
  return {
    baseUrl,
    semanticModel: text(record.semanticModel, 200),
    embeddingModel: text(record.embeddingModel, 200),
    transcriptionModel: text(record.transcriptionModel, 200),
    allowCloud: record.allowCloud === true,
    apiKey: text(record.apiKey, 16_384) || undefined,
    clearApiKey: record.clearApiKey === true
  }
}

function text(value: unknown, maxLength: number): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string' || value.length > maxLength) throw new Error('Invalid Core setting value.')
  return value.trim()
}
