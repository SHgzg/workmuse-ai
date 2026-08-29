import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { LocalAuthStore } from './local-auth.ts'

test('creates, verifies and restores a local account without persisting a session', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workmuse-auth-'))
  try {
    const auth = new LocalAuthStore(directory)
    await auth.initialize()
    assert.deepEqual(auth.state(), { configured: false, authenticated: false, profile: null })
    const loggedIn = await auth.login({ email: 'User@Example.com', password: 'correct horse battery staple' })
    assert.equal(loggedIn.authenticated, true)
    assert.equal(loggedIn.profile.email, 'user@example.com')
    auth.logout()
    assert.throws(() => auth.requireAuthenticated(), /AUTH_REQUIRED/)
    await assert.rejects(auth.login({ email: 'user@example.com', password: 'incorrect password' }), /不正确/)

    const reopened = new LocalAuthStore(directory)
    await reopened.initialize()
    assert.equal(reopened.state().configured, true)
    assert.equal(reopened.state().authenticated, false)
    await reopened.login({ email: 'user@example.com', password: 'correct horse battery staple' })
    assert.equal(reopened.state().authenticated, true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
