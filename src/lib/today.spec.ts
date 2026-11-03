import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'
import { localKey } from './dates'
import { currentDate, startTodayClock, syncToday, todayKey } from './today'

describe('today clock', () => {
  afterEach(() => {
    vi.useRealTimers()
    syncToday()
  })

  it('recomputes values that read the current date when the day changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 3, 23, 59))
    syncToday()
    const label = computed(() => localKey(currentDate()))
    expect(label.value).toBe('2026-11-03')

    vi.setSystemTime(new Date(2026, 10, 4, 0, 1))
    // Without a sync the cached value would stay on the previous day.
    expect(syncToday()).toBe(true)
    expect(label.value).toBe('2026-11-04')
    expect(syncToday()).toBe(false)
  })

  it('advances the day at midnight while the clock is running', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 3, 23, 59, 30))
    const stop = startTodayClock()
    expect(todayKey.value).toBe('2026-11-03')
    vi.advanceTimersByTime(60_000)
    expect(todayKey.value).toBe('2026-11-04')
    stop()
  })
})
