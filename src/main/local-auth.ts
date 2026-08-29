import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

type StoredAccount = {
  schemaVersion: 1
  email: string
  displayName: string
  salt: string
  passwordHash: string
  createdAt: string
}

export type AuthState = {
  configured: boolean
  authenticated: boolean
  profile: { email: string; displayName: string } | null
}

const deriveKey = promisify(scrypt) as (password: string, salt: Buffer, keyLength: number) => Promise<Buffer>

export class LocalAuthStore {
  private account: StoredAccount | null = null
  private authenticated = false
  private readonly path: string

  constructor(settingsDirectory: string) {
    this.path = join(settingsDirectory, 'local-account.v1.json')
  }

  async initialize(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    try {
      const parsed = JSON.parse(await readFile(this.path, 'utf8')) as Partial<StoredAccount>
      if (parsed.schemaVersion !== 1 || typeof parsed.email !== 'string' || typeof parsed.displayName !== 'string' ||
          typeof parsed.salt !== 'string' || typeof parsed.passwordHash !== 'string') throw new Error('Local account data is damaged.')
      this.account = parsed as StoredAccount
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  state(): AuthState {
    return {
      configured: this.account !== null,
      authenticated: this.authenticated,
      profile: this.authenticated && this.account ? { email: this.account.email, displayName: this.account.displayName } : null
    }
  }

  async login(input: unknown): Promise<AuthState> {
    if (!input || typeof input !== 'object') throw new Error('Login input is invalid.')
    const value = input as Record<string, unknown>
    const email = normalizeEmail(value.email)
    const password = passwordValue(value.password)
    if (!this.account) {
      const displayName = typeof value.displayName === 'string' && value.displayName.trim() ? value.displayName.trim().slice(0, 80) : email.split('@')[0]
      const salt = randomBytes(16)
      const passwordHash = await deriveKey(password, salt, 32)
      const account: StoredAccount = {
        schemaVersion: 1, email, displayName, salt: salt.toString('base64'), passwordHash: passwordHash.toString('base64'),
        createdAt: new Date().toISOString()
      }
      await this.persist(account)
      this.account = account
    } else {
      if (email !== this.account.email) throw new Error('邮箱或密码不正确。')
      const candidate = await deriveKey(password, Buffer.from(this.account.salt, 'base64'), 32)
      const expected = Buffer.from(this.account.passwordHash, 'base64')
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) throw new Error('邮箱或密码不正确。')
    }
    this.authenticated = true
    return this.state()
  }

  logout(): AuthState {
    this.authenticated = false
    return this.state()
  }

  requireAuthenticated(): void {
    if (!this.authenticated) throw new Error('AUTH_REQUIRED: 请先登录本地工作区。')
  }

  private async persist(account: StoredAccount): Promise<void> {
    const temporary = `${this.path}.tmp`
    await writeFile(temporary, JSON.stringify(account, null, 2), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.path)
  }
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string' || !/^\S+@\S+\.\S+$/.test(value.trim())) throw new Error('请输入有效的邮箱地址。')
  return value.trim().toLowerCase().slice(0, 254)
}

function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 256) throw new Error('密码长度需要为 8–256 个字符。')
  return value
}
