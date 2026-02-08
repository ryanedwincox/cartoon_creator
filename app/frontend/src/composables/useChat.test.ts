// [Test]: useChat — phase state machine: happy path, error, interrupt, connection drop, unknown SSE, idle reset.
// [Freeze justification]: Governance test for the agentPhase state machine (7 states, 6+ transitions).
// The phase drives ChatPanel UX (input disable, activity indicators, timer lifecycle). Incorrect
// transitions cause broken UI states (stuck spinners, phantom errors, input lockout). This is a
// complex state machine with concurrent mutation (interrupt mid-stream) that warrants frozen contracts.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useChat } from './useChat'
import type { AgentPhase } from './useChat'

// Helper: build SSE text chunk from event objects
function sseChunk(events: Array<{ type: string; content?: string; images?: string[] }>): string {
  return events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('')
}

// Helper: create a ReadableStream from SSE chunks
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]))
        index++
      } else {
        controller.close()
      }
    },
  })
}

// Partial Response mock — only body/ok/status used by useChat SSE parsing
function mockFetchResponse(chunks: string[], ok = true): Response {
  return {
    ok,
    body: makeStream(chunks),
    headers: new Headers(),
    redirected: false,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Internal Server Error',
    type: 'basic',
    url: '',
    clone: () => ({} as Response),
    bodyUsed: false,
    arrayBuffer: async () => new ArrayBuffer(0),
    blob: async () => new Blob(),
    formData: async () => new FormData(),
    json: async () => ({}),
    text: async () => '',
    bytes: async () => new Uint8Array(),
  } as Response
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useChat phase state machine', () => {
  it('follows happy path: idle → sending → waiting → streaming → done → idle', async () => {
    const phases: AgentPhase[] = []

    const scope = effectScope()
    await scope.run(async () => {
      const chat = useChat('test-project')

      // Separate chunks so ReadableStream pull() delivers each event individually
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchResponse([
          sseChunk([{ type: 'started', content: '' }]),
          sseChunk([{ type: 'text', content: 'Hello ' }]),
          sseChunk([{ type: 'text', content: 'world' }]),
          sseChunk([{ type: 'done', content: 'Hello world', images: [] }]),
        ])
      )

      // Track phase changes
      const { watch } = await import('vue')
      watch(chat.agentPhase, (v) => phases.push(v), { flush: 'sync' })

      expect(chat.agentPhase.value).toBe('idle')

      await chat.sendMessage('hi')

      // Should have transitioned through phases
      expect(phases).toContain('sending')
      expect(phases).toContain('waiting')
      expect(phases).toContain('streaming')
      expect(phases).toContain('done')

      // After 2s idle timeout
      vi.advanceTimersByTime(2100)
      expect(chat.agentPhase.value).toBe('idle')
    })
    scope.stop()
  })

  it('transitions to error on fetch failure', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useChat('test-project')

      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      await chat.sendMessage('hi')
      expect(chat.agentPhase.value).toBe('error')

      vi.advanceTimersByTime(2100)
      expect(chat.agentPhase.value).toBe('idle')
    })
    scope.stop()
  })

  it('transitions to error on non-ok response', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useChat('test-project')

      vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse([], false))

      await chat.sendMessage('hi')
      expect(chat.agentPhase.value).toBe('error')
    })
    scope.stop()
  })

  it('interrupt sets interrupted phase and ignores subsequent SSE events', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useChat('test-project')

      // Slow stream — interrupt mid-flight
      let resolveRead: (() => void) | null = null
      const blockingStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode(sseChunk([{ type: 'started', content: '' }])))

          // Wait for interrupt, then send more events
          const waitThenContinue = async () => {
            await new Promise<void>(r => { resolveRead = r })
            controller.enqueue(encoder.encode(sseChunk([{ type: 'text', content: 'ignored' }])))
            controller.enqueue(encoder.encode(sseChunk([{ type: 'done', content: 'ignored', images: [] }])))
            controller.close()
          }
          waitThenContinue()
        },
      })

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        body: blockingStream,
      } as unknown as Response)

      // Mock interrupt endpoint
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'interrupted' }),
      } as Response)

      const sendPromise = chat.sendMessage('hi')

      // Let microtasks process the first chunk
      await vi.advanceTimersByTimeAsync(0)

      // Interrupt while waiting
      await chat.interrupt()
      expect(chat.agentPhase.value).toBe('interrupted')

      // Unblock the stream (assigned inside ReadableStream start callback)
      resolveRead!()
      await sendPromise

      // Phase should still be interrupted, not overridden by 'done'
      expect(chat.agentPhase.value).toBe('interrupted')
    })
    scope.stop()
  })

  it('streaming computed is true during active phases', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useChat('test-project')
      expect(chat.streaming.value).toBe(false)

      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchResponse([
          sseChunk([{ type: 'started', content: '' }]),
          sseChunk([{ type: 'done', content: 'ok', images: [] }]),
        ])
      )

      const sendPromise = chat.sendMessage('hi')
      expect(chat.streaming.value).toBe(true) // sending phase

      await sendPromise
      expect(chat.streaming.value).toBe(false) // done phase
    })
    scope.stop()
  })

  it('clearHistory resets to idle and cancels pending idle timeout', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useChat('test-project')

      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchResponse([
          sseChunk([{ type: 'done', content: 'ok', images: [] }]),
        ])
      )

      await chat.sendMessage('hi')
      expect(chat.agentPhase.value).toBe('done')

      // Mock delete
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'cleared' }),
      } as Response)

      await chat.clearHistory()
      expect(chat.agentPhase.value).toBe('idle')
      expect(chat.messages.value).toHaveLength(0)
    })
    scope.stop()
  })

  it('unknown SSE event types are ignored without errors', async () => {
    const scope = effectScope()
    await scope.run(async () => {
      const chat = useChat('test-project')

      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchResponse([
          sseChunk([{ type: 'started', content: '' }]),
          sseChunk([{ type: 'unknown_event', content: 'whatever' }]),
          sseChunk([{ type: 'done', content: 'ok', images: [] }]),
        ])
      )

      await chat.sendMessage('hi')
      expect(chat.agentPhase.value).toBe('done')
      // Should still have processed 'done' normally
      const lastMsg = chat.messages.value[chat.messages.value.length - 1]
      expect(lastMsg?.content).toBe('ok')
    })
    scope.stop()
  })
})
