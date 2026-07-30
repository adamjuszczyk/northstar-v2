export type Lang = 'en' | 'pl'
export const LANGS: Lang[] = ['en', 'pl']

/** Intl.PluralRules categories. English only ever selects 'one' | 'other';
 *  Polish can select any of the four depending on the count. */
export interface PluralForms {
  one?:  string
  few?:  string
  many?: string
  other: string
}

export type TranslationEntry = string | PluralForms
