import { useCallback } from 'react'
import type { Locale } from 'date-fns'
import { enUS, pl as plDateLocale } from 'date-fns/locale'
import { useSettings } from '../hooks/useSettings'
import { en } from './en'
import { pl } from './pl'
import type { Lang, TranslationEntry } from './types'

export type { Lang } from './types'
export { LANGS } from './types'

export type Key = keyof typeof en

const DICTS: Record<Lang, Record<Key, TranslationEntry>> = { en, pl }

export interface TParams {
  count?: number
  [key: string]: string | number | undefined
}

function resolve(lang: Lang, key: Key, params?: TParams): string {
  const entry = DICTS[lang][key]
  let str: string
  if (typeof entry === 'string') {
    str = entry
  } else {
    const count = params?.count ?? 0
    const category = new Intl.PluralRules(lang).select(count) as keyof typeof entry
    str = entry[category] ?? entry.other
  }
  if (params) {
    for (const k in params) {
      const v = params[k]
      if (v !== undefined) str = str.split(`{${k}}`).join(String(v))
    }
  }
  return str
}

/** Bound to the app's current language (via useSettings) — re-renders on toggle. */
export function useT() {
  const { settings } = useSettings()
  const lang = settings.lang
  return useCallback((key: Key, params?: TParams) => resolve(lang, key, params), [lang])
}

/** For non-component code (e.g. window.confirm() inside a hook) that can't call useT(). */
export function t(lang: Lang, key: Key, params?: TParams): string {
  return resolve(lang, key, params)
}

const DATE_FNS_LOCALES: Record<Lang, Locale> = { en: enUS, pl: plDateLocale }

/** date-fns Locale matching the current language — pass as { locale } to every
 *  format() call whose token string names a weekday or month (EEEE/EEE/MMMM/MMM
 *  and similar); purely numeric tokens (d, yyyy-MM-dd) don't need it. */
export function useDateFnsLocale(): Locale {
  const { settings } = useSettings()
  return DATE_FNS_LOCALES[settings.lang]
}
