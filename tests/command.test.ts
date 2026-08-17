import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from 'koishi'
import { apply, Config } from '../src'

test('command keeps quoted content out of the optional image index', () => {
  let definition: string | undefined
  let captureQuote: boolean | undefined

  const command = {
    option() {
      return this
    },
    action() {
      return this
    },
  }

  const ctx = {
    logger: () => ({ warn() {} }),
    command: (value: string, _description: string, config: { captureQuote?: boolean }) => {
      definition = value
      captureQuote = config.captureQuote
      return command
    },
  } as unknown as Context

  apply(ctx, {
    commandName: '验图',
  } as Config)

  assert.equal(definition, '验图 [index:posint]')
  assert.equal(captureQuote, false)
})
