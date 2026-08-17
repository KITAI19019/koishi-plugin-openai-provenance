import assert from 'node:assert/strict'
import test from 'node:test'
import {
  detectImageFormat,
  normalizeProvenanceResponse,
  renderTemplate,
} from '../src/provenance'

test('detectImageFormat identifies supported image signatures', () => {
  assert.deepEqual(
    detectImageFormat(new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])),
    { mimeType: 'image/png', extension: 'png' },
  )
  assert.deepEqual(
    detectImageFormat(new Uint8Array([0xff, 0xd8, 0xff, 0x00])),
    { mimeType: 'image/jpeg', extension: 'jpg' },
  )
  assert.deepEqual(
    detectImageFormat(new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0,
      0x57, 0x45, 0x42, 0x50,
    ])),
    { mimeType: 'image/webp', extension: 'webp' },
  )
  assert.equal(
    detectImageFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38])),
    null,
  )
})

test('normalizeProvenanceResponse reports detected C2PA evidence', () => {
  const result = normalizeProvenanceResponse({
    object: 'content_provenance_check',
    created_at: 0,
    results: [{
      type: 'c2pa',
      outcome: 'detected',
      validation_state: 'trusted',
      issuer: 'OpenAI OpCo, LLC',
      model: 'gpt-image',
      generated_at: '2026-07-27T18:34:12Z',
    }, {
      type: 'synthid',
      outcome: 'not_detected',
      model: null,
      generated_at: null,
    }],
  })

  assert.equal(result.status, 'detected')
  assert.equal(result.signalType, 'C2PA')
  assert.equal(result.validationState, '可信')
  assert.match(result.details, /OpenAI OpCo, LLC/)
  assert.match(result.details, /2026-07-27 18:34:12 UTC/)
})

test('normalizeProvenanceResponse distinguishes invalid metadata', () => {
  const result = normalizeProvenanceResponse({
    object: 'content_provenance_check',
    created_at: 0,
    results: [{
      type: 'c2pa',
      outcome: 'not_detected',
      validation_state: 'invalid',
      issuer: null,
      model: null,
      generated_at: null,
    }, {
      type: 'synthid',
      outcome: 'not_detected',
      model: null,
      generated_at: null,
    }],
  })

  assert.equal(result.status, 'invalid_metadata')
  assert.equal(result.validationState, '无效')
})

test('normalizeProvenanceResponse keeps all-negative results inconclusive', () => {
  const result = normalizeProvenanceResponse({
    object: 'content_provenance_check',
    created_at: 0,
    results: [{
      type: 'c2pa',
      outcome: 'not_detected',
      validation_state: 'not_present',
      issuer: null,
      model: null,
      generated_at: null,
    }, {
      type: 'synthid',
      outcome: 'not_detected',
      model: null,
      generated_at: null,
    }],
  })

  assert.equal(result.status, 'not_detected')
})

test('renderTemplate replaces supported placeholders', () => {
  assert.equal(
    renderTemplate('结果：{status}\n\n\n{details}', {
      status: 'detected',
      details: '信号类型：C2PA',
    }),
    '结果：detected\n\n信号类型：C2PA',
  )
})
