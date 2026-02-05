// useServerHealth: Polls /api/health every second, tracks consecutive failures, exposes disconnected state. NOT concerned with: UI rendering, reconnection logic.
import { ref, computed, readonly, onMounted, onUnmounted } from 'vue'

const API_BASE = '/api'
const POLL_INTERVAL_MS = 1000
const FAILURE_THRESHOLD = 3

/** Global singleton: single polling loop shared app-wide — avoids duplicate timers and ensures consistent disconnect state across all consumers. */
const consecutiveFailures = ref(0)
const disconnected = computed(() => consecutiveFailures.value >= FAILURE_THRESHOLD)

let pollingTimer: number | null = null
let activeConsumers = 0

async function checkHealth(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(2000) })
    if (res.ok) {
      consecutiveFailures.value = 0
    } else {
      consecutiveFailures.value++
    }
  } catch {
    consecutiveFailures.value++
  }
}

async function pollLoop(): Promise<void> {
  await checkHealth()
  if (activeConsumers > 0) {
    pollingTimer = window.setTimeout(pollLoop, POLL_INTERVAL_MS)
  }
}

function startPolling(): void {
  if (pollingTimer !== null) return
  pollLoop()
}

function stopPolling(): void {
  if (pollingTimer !== null) {
    clearTimeout(pollingTimer)
    pollingTimer = null
  }
}

export function useServerHealth() {
  onMounted(() => {
    activeConsumers++
    startPolling()
  })

  onUnmounted(() => {
    activeConsumers--
    if (activeConsumers <= 0) {
      stopPolling()
      activeConsumers = 0
    }
  })

  return { disconnected, consecutiveFailures: readonly(consecutiveFailures) }
}
