import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark'
const KEY = 'viyeutica.theme'

function initialTheme(): ThemeMode {
  const saved = window.localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(initialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(KEY, theme)
  }, [theme])

  return {
    theme,
    toggleTheme: () => setTheme(current => current === 'light' ? 'dark' : 'light'),
  }
}
