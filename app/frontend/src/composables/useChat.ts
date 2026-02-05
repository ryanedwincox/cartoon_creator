import { ref } from 'vue'

const API_BASE = '/api'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  images: string[]
}

export function useChat(projectId: string) {
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const streaming = ref(false)
  const currentResponse = ref('')

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
    // Add user message immediately
    messages.value.push({
      role: 'user',
      content: message,
      images: [],
    })

    streaming.value = true
    currentResponse.value = ''

    try {
      const res = await fetch(`${API_BASE}/chat/${projectId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      })

      if (!res.ok) throw new Error('Failed to send message')

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
                if (data.type === 'text') {
                  currentResponse.value += data.content
                } else if (data.type === 'done') {
                  messages.value.push({
                    role: 'assistant',
                    content: data.content,
                    images: data.images || [],
                  })
                  currentResponse.value = ''
                } else if (data.type === 'error') {
                  messages.value.push({
                    role: 'assistant',
                    content: `Error: ${data.content}`,
                    images: [],
                  })
                }
              } catch {}
            }
          }
        }
      }
    } finally {
      streaming.value = false
    }
  }

  const interrupt = async () => {
    await fetch(`${API_BASE}/chat/${projectId}/interrupt`, {
      method: 'POST',
    })
    streaming.value = false
  }

  const clearHistory = async () => {
    await fetch(`${API_BASE}/chat/${projectId}/history`, {
      method: 'DELETE',
    })
    messages.value = []
    currentResponse.value = ''
  }

  return {
    messages,
    loading,
    streaming,
    currentResponse,
    loadHistory,
    sendMessage,
    interrupt,
    clearHistory,
  }
}
