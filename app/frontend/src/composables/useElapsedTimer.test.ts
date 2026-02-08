// [Test]: useElapsedTimer — lifecycle (start/stop/reset), formatted output, idempotent start, cleanup.
// [Freeze justification]: Governance test for a timer state machine with multiple transitions
// (start/stop/reset/idempotent-start). formatElapsed is a stable leaf-node utility consumed by
// ChatPanel's elapsed display. Freezing the transition contract and output format prevents
// silent regressions in timer lifecycle that would surface as broken UX (stuck timers, wrong display).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useElapsedTimer, formatElapsed } from './useElapsedTimer'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('useElapsedTimer', () => {
  it('starts at 0ms elapsed', () => {
    const scope = effectScope()
    scope.run(() => {
      const { elapsedMs } = useElapsedTimer()
      expect(elapsedMs.value).toBe(0)
    })
    scope.stop()
  })

  it('tracks elapsed time after start()', () => {
    const scope = effectScope()
    scope.run(() => {
      const { elapsedMs, start } = useElapsedTimer()
      start()
      vi.advanceTimersByTime(3000)
      expect(elapsedMs.value).toBeGreaterThanOrEqual(2900)
      expect(elapsedMs.value).toBeLessThanOrEqual(3100)
    })
    scope.stop()
  })

  it('stop() freezes elapsed value', () => {
    const scope = effectScope()
    scope.run(() => {
      const { elapsedMs, start, stop } = useElapsedTimer()
      start()
      vi.advanceTimersByTime(2000)
      stop()
      const frozen = elapsedMs.value
      vi.advanceTimersByTime(5000)
      expect(elapsedMs.value).toBe(frozen)
    })
    scope.stop()
  })

  it('reset() clears elapsed and stops timer', () => {
    const scope = effectScope()
    scope.run(() => {
      const { elapsedMs, start, reset } = useElapsedTimer()
      start()
      vi.advanceTimersByTime(2000)
      reset()
      expect(elapsedMs.value).toBe(0)
      vi.advanceTimersByTime(3000)
      expect(elapsedMs.value).toBe(0)
    })
    scope.stop()
  })

  it('start() is idempotent — no double intervals', () => {
    const scope = effectScope()
    scope.run(() => {
      const { elapsedMs, start } = useElapsedTimer()
      start()
      vi.advanceTimersByTime(2000)
      start() // second call should be no-op
      vi.advanceTimersByTime(1000)
      // Should be ~3s total, not reset to ~1s
      expect(elapsedMs.value).toBeGreaterThanOrEqual(2900)
    })
    scope.stop()
  })

  it('formatted computed returns M:SS', () => {
    const scope = effectScope()
    scope.run(() => {
      const { formatted, start } = useElapsedTimer()
      start()
      expect(formatted.value).toBe('0s')
      vi.advanceTimersByTime(5000)
      expect(formatted.value).toBe('5s')
      vi.advanceTimersByTime(60000)
      expect(formatted.value).toBe('1:05')
    })
    scope.stop()
  })
})

describe('formatElapsed', () => {
  it('formats seconds under 60', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(5)).toBe('5s')
    expect(formatElapsed(59)).toBe('59s')
  })

  it('formats minutes:seconds', () => {
    expect(formatElapsed(60)).toBe('1:00')
    expect(formatElapsed(61)).toBe('1:01')
    expect(formatElapsed(125)).toBe('2:05')
    expect(formatElapsed(600)).toBe('10:00')
  })
})
