import { Context, Schema } from 'koishi'

export const name = 'openai-provenance'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

export function apply(ctx: Context, config: Config) {
  // write your plugin here
}
