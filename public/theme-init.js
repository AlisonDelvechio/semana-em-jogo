// Applies the saved (or system) theme before the app loads, avoiding a light flash in
// dark mode. Kept as a file instead of an inline script so the Content-Security-Policy
// in netlify.toml can allow only scripts from this site.
try {
  const savedTheme = localStorage.getItem('semana-em-jogo-theme')
  const dark =
    savedTheme === 'dark' ||
    (savedTheme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) {
    document.documentElement.dataset.theme = 'dark'
    document.querySelector('meta[name="theme-color"]').content = '#151d19'
  }
} catch {
  // O navegador pode bloquear armazenamento; o tema claro continua disponível.
}
