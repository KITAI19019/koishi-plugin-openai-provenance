import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

test('exports package.json for the Koishi package scanner', () => {
  const filename = require.resolve('koishi-plugin-openai-provenance/package.json')
  const manifest = JSON.parse(readFileSync(filename, 'utf8'))

  assert.equal(manifest.name, 'koishi-plugin-openai-provenance')
  assert.equal(manifest.version, '1.0.1')
})
