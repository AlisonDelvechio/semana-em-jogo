import { ref } from 'vue'
import { localKey } from './dates'

// `new Date()` is not reactive: computeds and templates that only read it would keep
// yesterday's date while the app stays open past midnight. Every place that needs the
// current date reads it through `currentDate()`, which subscribes to `todayKey`, so a
// day change recomputes summaries, highlights and "until today" progress.
export const todayKey = ref(localKey(new Date()))

export function currentDate(): Date {
  void todayKey.value
  return new Date()
}

// Returns true when the calendar day changed since the last sync.
export function syncToday(now: Date = new Date()): boolean {
  const key = localKey(now)
  if (key === todayKey.value) return false
  todayKey.value = key
  return true
}

let midnightTimer: ReturnType<typeof setTimeout> | undefined
let watchers = 0
function scheduleMidnight() {
  const now = new Date()
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  midnightTimer = setTimeout(() => {
    syncToday()
    scheduleMidnight()
  }, next.getTime() - now.getTime())
}

// Keeps `todayKey` current while at least one caller is active. Timers can be
// suspended while the device sleeps, so callers also sync when the page becomes visible.
export function startTodayClock(): () => void {
  if (watchers++ === 0) {
    syncToday()
    scheduleMidnight()
  }
  return () => {
    if (--watchers === 0) clearTimeout(midnightTimer)
  }
}
