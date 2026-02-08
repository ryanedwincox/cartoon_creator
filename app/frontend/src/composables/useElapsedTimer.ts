// useElapsedTimer: setInterval-based elapsed timer with Date.now() delta for wall-clock accuracy.
// Updates reactive ref once per second. Survives background tab pauses (shows correct elapsed on return).
import { ref, computed, onUnmounted } from 'vue'

export function useElapsedTimer() {
  const elapsedMs = ref(0)
  let startTime = 0
  let intervalId: ReturnType<typeof setInterval> | null = null

  const formatted = computed(() => formatElapsed(Math.floor(elapsedMs.value / 1000)))

  function start() {
    if (intervalId !== null) return // idempotent
    startTime = Date.now()
    elapsedMs.value = 0
    intervalId = setInterval(() => {
      elapsedMs.value = Date.now() - startTime
    }, 1000)
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
  }

  function reset() {
    stop()
    elapsedMs.value = 0
  }

  onUnmounted(reset)

  return { elapsedMs, formatted, start, stop, reset }
}

export function formatElapsed(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`
}
