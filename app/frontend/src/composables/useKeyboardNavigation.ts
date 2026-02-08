// useKeyboardNavigation: Left/right arrow key navigation for viewer overlays. NOT concerned with: tool shortcuts, text input, zoom gestures.
import { onMounted, onUnmounted } from 'vue'

interface KeyboardNavOptions {
  enabledWhen?: () => boolean
}

export function useKeyboardNavigation(
  onNavigate: (direction: -1 | 1) => void,
  options: KeyboardNavOptions = {},
): void {
  const { enabledWhen = () => true } = options

  const isEditableTarget = (el: HTMLElement): boolean => {
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target as HTMLElement)) return
    if (!enabledWhen()) return

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      onNavigate(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      onNavigate(1)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })
}
