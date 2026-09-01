import { createContext, useContext, useState, type ReactNode } from 'react'

export type Locale = 'zh-TW' | 'en'

interface LocaleContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
}

const DEFAULT_LOCALE: Locale = 'zh-TW'

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale
  children: ReactNode
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale)

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    return { locale: DEFAULT_LOCALE, setLocale: () => {} }
  }
  return ctx
}