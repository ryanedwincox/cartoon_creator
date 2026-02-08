<!-- ChatPanel: Streaming chat interface for agent conversation within a project. -->
<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue'
import { useChat } from '../composables/useChat'
import { useElapsedTimer } from '../composables/useElapsedTimer'

const props = defineProps<{
  projectId: string
}>()

const { messages, loading, streaming, currentResponse, agentPhase, loadHistory, sendMessage, interrupt, clearHistory } = useChat(props.projectId)
const { formatted: elapsedFormatted, start: startTimer, stop: stopTimer, reset: resetTimer } = useElapsedTimer()

const messageInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const DATA_BASE = '/data'

onMounted(async () => {
  try {
    await loadHistory()
  } catch (e) {
    console.error('Failed to load chat history', e)
  }
})

const scrollToBottom = () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

watch([messages, currentResponse, agentPhase], scrollToBottom)

// Drive the timer from agentPhase transitions
watch(agentPhase, (phase) => {
  if (phase === 'sending') {
    resetTimer()
    startTimer()
  } else if (phase === 'done' || phase === 'error' || phase === 'interrupted') {
    stopTimer()
  } else if (phase === 'idle') {
    resetTimer()
  }
})

const handleSend = async () => {
  const text = messageInput.value.trim()
  if (!text || streaming.value) return

  messageInput.value = ''
  await sendMessage(text)
}

const handleKeyDown = async (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    await handleSend()
  }
}
</script>

<template>
  <div class="chat-panel">
    <!-- Chat header actions -->
    <div class="chat-actions">
      <button class="btn btn-secondary btn-sm" @click="clearHistory">
        Clear
      </button>
      <button
        v-if="agentPhase === 'waiting' || agentPhase === 'streaming'"
        class="btn btn-secondary btn-sm"
        @click="interrupt"
      >
        Stop
      </button>
    </div>

    <!-- Messages -->
    <div class="messages" ref="messagesContainer">
      <div v-if="loading" class="loading">Loading conversation...</div>

      <div
        v-for="(msg, idx) in messages"
        :key="idx"
        :class="['message', msg.role]"
      >
        <div class="message-role">{{ msg.role === 'user' ? 'You' : 'Agent' }}</div>
        <div class="message-content">{{ msg.content }}</div>

        <!-- Inline images -->
        <div v-if="msg.images?.length" class="message-images">
          <img
            v-for="img in msg.images"
            :key="img"
            :src="`${DATA_BASE}/${projectId}/${img}`"
            :alt="img"
            class="message-image"
          />
        </div>
      </div>

      <!-- Agent activity indicator -->
      <template v-if="agentPhase !== 'idle'">

        <!-- Sending/Waiting state: thinking dots + timer -->
        <div v-if="agentPhase === 'sending' || agentPhase === 'waiting'" class="thinking-indicator">
          <div class="thinking-dots">
            <span></span><span></span><span></span>
          </div>
          <span class="thinking-text">
            {{ agentPhase === 'sending' ? 'Sending...' : 'Agent is thinking...' }}
          </span>
          <span class="elapsed-timer">{{ elapsedFormatted }}</span>
        </div>

        <!-- Streaming state: response text + cursor + timer -->
        <div v-if="agentPhase === 'streaming'" class="message assistant">
          <div class="message-role">Agent</div>
          <div class="message-content">{{ currentResponse }}<span class="typing-indicator">▋</span></div>
          <div class="stream-meta">
            <span class="elapsed-timer">{{ elapsedFormatted }}</span>
          </div>
        </div>

        <!-- Done state: completion flash -->
        <div v-if="agentPhase === 'done'" class="completion-flash">
          <span class="completion-icon">✓</span>
          <span>Completed in {{ elapsedFormatted }}</span>
        </div>

        <!-- Interrupted state -->
        <div v-if="agentPhase === 'interrupted'" class="completion-flash interrupted">
          <span>Interrupted at {{ elapsedFormatted }}</span>
        </div>

        <!-- Error state -->
        <div v-if="agentPhase === 'error'" class="completion-flash error">
          <span>Error after {{ elapsedFormatted }}</span>
        </div>

      </template>
    </div>

    <!-- Input -->
    <div class="chat-input-container">
      <textarea
        id="chat-input"
        v-model="messageInput"
        class="chat-input"
        placeholder="Type a message..."
        rows="1"
        @keydown="handleKeyDown"
        :disabled="streaming"
      />
      <button
        id="send-btn"
        class="btn btn-primary send-btn"
        @click="handleSend"
        :disabled="!messageInput.trim() || streaming"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
}

.messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.loading {
  text-align: center;
  color: var(--text-muted);
  padding: 2rem;
}

.message {
  max-width: 85%;
  padding: 0.75rem 1rem;
  border-radius: 1rem;
}

.message.user {
  align-self: flex-end;
  background: var(--primary);
  color: white;
}

.message.assistant {
  align-self: flex-start;
  background: var(--card-bg);
  border: 1px solid var(--border);
}

.message-role {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  opacity: 0.7;
  margin-bottom: 0.25rem;
}

.message-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.message-images {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.message-image {
  max-width: 200px;
  max-height: 200px;
  border-radius: 0.5rem;
  cursor: pointer;
}

.typing-indicator {
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.chat-input-container {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  border-top: 1px solid var(--border);
  background: var(--card-bg);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 1.5rem;
  resize: none;
  font-size: 1rem;
  font-family: inherit;
}

.chat-input:focus {
  outline: none;
  border-color: var(--primary);
}

.send-btn {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  padding: 0;
}

.send-btn svg {
  width: 1.25rem;
  height: 1.25rem;
}

.send-btn:disabled {
  opacity: 0.5;
}

/* --- Agent activity feedback styles --- */

.thinking-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 1rem;
  align-self: flex-start;
  max-width: 85%;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.thinking-dots {
  display: flex;
  gap: 3px;
}

.thinking-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  animation: dot-bounce 1.4s ease-in-out infinite;
}

.thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
.thinking-dots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.thinking-text {
  flex: 1;
}

.elapsed-timer {
  font-family: 'SF Mono', 'Fira Code', ui-monospace, monospace;
  font-size: 0.75rem;
  color: var(--text-muted);
  min-width: 2.5rem;
  text-align: right;
}

.stream-meta {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.25rem;
}

.completion-flash {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 1rem;
  align-self: flex-start;
  font-size: 0.85rem;
  color: var(--tag-completed);
  background: var(--card-bg);
  border: 1px solid var(--tag-completed);
  animation: fade-in 0.3s ease-out;
}

.completion-flash.interrupted {
  color: var(--tag-in-progress);
  border-color: var(--tag-in-progress);
}

.completion-flash.error {
  color: var(--error);
  border-color: var(--error);
}

.completion-icon {
  font-weight: bold;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

</style>
