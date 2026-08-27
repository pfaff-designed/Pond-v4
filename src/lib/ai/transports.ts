/**
 * Chat transport factory — abstracted so Jest can mock this module
 * without having to transform the `ai` ESM package.
 */
import { DefaultChatTransport } from 'ai'

/** Transport for the main AI terminal — connects to /api/chat */
export function createMainTransport() {
  return new DefaultChatTransport({ api: '/api/chat' })
}
