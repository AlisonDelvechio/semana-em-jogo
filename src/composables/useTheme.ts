import { onMounted, onUnmounted, ref } from 'vue'

const STORAGE_KEY = 'semana-em-jogo-theme'

// Light/dark theme: follows the system until the user picks one, then remembers it.
// index.html applies the saved theme before the app loads to avoid a flash.
export function useTheme() {
  const darkMode = ref(document.documentElement.dataset.theme === 'dark')
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)')
  const applyTheme = (dark: boolean) => {
    darkMode.value = dark
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#151d19' : '#f8f7f3')
  }
  const syncSystemTheme = () => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return
    } catch {
      // Mesmo sem armazenamento, a preferência do sistema continua funcionando.
    }
    applyTheme(systemTheme.matches)
  }
  const toggleTheme = () => {
    applyTheme(!darkMode.value)
    try {
      localStorage.setItem(STORAGE_KEY, darkMode.value ? 'dark' : 'light')
    } catch {
      // O tema ainda muda durante esta visita.
    }
  }
  onMounted(() => systemTheme.addEventListener('change', syncSystemTheme))
  onUnmounted(() => systemTheme.removeEventListener('change', syncSystemTheme))
  return { darkMode, toggleTheme }
}
