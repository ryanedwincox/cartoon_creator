// useChat: Chat messaging composable with SSE streaming and agent phase tracking.
import { ref, computed, onUnmounted } from 'vue'

const API_BASE = '/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  images: string[]
}

export type AgentPhase = 'idle' | 'sending' | 'waiting' | 'streaming' | 'done' | 'error' | 'interrupted'

export function useChat(projectId: string) {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const currentResponse = ref('')
  const agentPhase = ref<AgentPhase>('idle')

  // Backward-compatible read-only computed — guards input/stop button
  const streaming = computed(() =>
    agentPhase.value === 'sending'
    || agentPhase.value === 'waiting'
    || agentPhase.value === 'streaming'
  )

  // Track idle-reset timeout so re-entry to sendMessage() can cancel it
  let idleTimeoutId: ReturnType<typeof setTimeout> | null = null

  function clearIdleTimeout() {
    if (idleTimeoutId !== null) {
      clearTimeout(idleTimeoutId)
      idleTimeoutId = null
    }
  }

  // RAII: cancel pending idle-reset on component teardown
  onUnmounted(() => clearIdleTimeout())

  function scheduleIdleReset() {
    clearIdleTimeout()
    idleTimeoutId = setTimeout(() => {
      if (agentPhase.value === 'done' || agentPhase.value === 'error' || agentPhase.value === 'interrupted') {
        agentPhase.value = 'idle'
      }
      idleTimeoutId = null
    }, 2000)
  }

  const loadHistory = async () => {
    loading.value = true
    try {
      const res = await fetch(`${API_BASE}/chat/${projectId}/history`)
      if (res.ok) {
        messages.value = await res.json()
      }
    } finally {
      loading.value = false
    }
  }

  const sendMessage = async (message: string) => {
    clearIdleTimeout()

    messages.value.push({
      role: 'user',
      content: message,
      images: [],
    })

    currentResponse.value = ''
    agentPhase.value = 'sending'

    let networkError: unknown = null

    try {
      const res = await fetch(`${API_BASE}/chat/${projectId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (!res.ok) throw new Error('Failed to send message')

      agentPhase.value = 'waiting'

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const lines = text.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                // Interrupted is terminal — ignore all subsequent SSE events.
                // Cast: interrupt() mutates agentPhase concurrently; TS narrowing doesn't see it.
                if ((agentPhase.value as string) === 'interrupted') continue

                if (data.type === 'started') {
                  agentPhase.value = 'waiting'
                } else if (data.type === 'text') {
                  if (agentPhase.value !== 'streaming') {
                    agentPhase.value = 'streaming'
                  }
                  currentResponse.value += data.content
                } else if (data.type === 'done') {
                  agentPhase.value = 'done'
                  messages.value.push({
                    role: 'assistant',
                    content: data.content,
                    images: data.images || [],
                  })
                  currentResponse.value = ''
                } else if (data.type === 'error') {
                  agentPhase.value = 'error'
                  messages.value.push({
                    role: 'assistant',
                    content: `Error: ${data.content}`,
                    images: [],
                  })
                }
              } catch {
                // Malformed SSE line — skip silently (acceptable: partial JSON from chunked transport)
              }
            }
          }
        }
      }
    } catch (err) {
      networkError = err
      console.error('sendMessage failed:', err)
      // Cast: interrupt() mutates agentPhase concurrently; TS narrowing doesn't see it
      if ((agentPhase.value as string) !== 'interrupted') {
        agentPhase.value = 'error'
      }
    } finally {
      // If still in a working phase, connection dropped unexpectedly
      if (agentPhase.value === 'streaming' || agentPhase.value === 'waiting' || agentPhase.value === 'sending') {
        agentPhase.value = 'error'
        const detail = networkError instanceof Error ? `: ${networkError.message}` : ''
        messages.value.push({
          role: 'assistant',
          content: `Connection lost — agent response may be incomplete${detail}.`,
          images: [],
        })
      }

      scheduleIdleReset()
    }
  }

  const interrupt = async () => {
    agentPhase.value = 'interrupted'
    try {
      await fetch(`${API_BASE}/chat/${projectId}/interrupt`, {
        method: 'POST',
      })
    } catch (err) {
      console.error('Failed to send interrupt:', err)
    }
    scheduleIdleReset()
  }

  const clearHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/chat/${projectId}/history`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(`DELETE failed: ${res.status}`)
    } catch (err) {
      console.error('clearHistory failed:', err)
      return // Leave state unchanged on failure
    }
    messages.value = []
    currentResponse.value = ''
    clearIdleTimeout()
    agentPhase.value = 'idle'
  }

  return {
    messages,
    loading,
    streaming,
    currentResponse,
    agentPhase,
    loadHistory,
    sendMessage,
    interrupt,
    clearHistory,
  }
}
