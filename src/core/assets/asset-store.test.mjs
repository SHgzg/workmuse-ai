import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { AssetStore } from './asset-store.ts'

test('imports and resolves only checksum-addressed original files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'workmuse-assets-'))
  try {
    const source = join(directory, 'meeting.txt')
    await writeFile(source, '原始会议材料')
    const store = new AssetStore(join(directory, 'core'))
    const asset = await store.importFile(source)
    assert.match(asset.id, /^sha256:[a-f0-9]{64}$/)
    assert.equal(await store.resolveFile(asset.id), asset.path)
    await assert.rejects(store.resolveFile('../../meeting.txt'), /Invalid resource id/)
    await assert.rejects(store.resolveFile(`sha256:${'f'.repeat(64)}`))
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
