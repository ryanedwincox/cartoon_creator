// useSwipeNavigation: Composable for horizontal swipe gesture detection. NOT concerned with: pinch-zoom, pan, scroll.
import { ref } from 'vue'

const SWIPE_THRESHOLD = 60
const VERTICAL_CANCEL_THRESHOLD = 20

interface SwipeOptions {
  enabledWhen?: () => boolean
}

export function useSwipeNavigation(
  onNavigate: (direction: -1 | 1) => void,
  options: SwipeOptions = {},
) {
  const { enabledWhen = () => true } = options

  const swipeStartX = ref(0)
  const swipeStartY = ref(0)
  const swipeDeltaX = ref(0)
  const isSwiping = ref(false)

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0]
    if (e.touches.length !== 1 || !touch || !enabledWhen()) return
    isSwiping.value = true
    swipeStartX.value = touch.clientX
    swipeStartY.value = touch.clientY
    swipeDeltaX.value = 0
  }

  const handleTouchMove = (e: TouchEvent) => {
    const touch = e.touches[0]
    if (!isSwiping.value || e.touches.length !== 1 || !touch) return
    const dx = touch.clientX - swipeStartX.value
    const dy = touch.clientY - swipeStartY.value
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > VERTICAL_CANCEL_THRESHOLD) {
      isSwiping.value = false
      return
    }
    swipeDeltaX.value = dx
  }

  const handleTouchEnd = () => {
    if (isSwiping.value && Math.abs(swipeDeltaX.value) >= SWIPE_THRESHOLD) {
      onNavigate(swipeDeltaX.value > 0 ? -1 : 1)
    }
    isSwiping.value = false
  }

  return { handleTouchStart, handleTouchMove, handleTouchEnd }
}
