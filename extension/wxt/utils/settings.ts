import { storage } from "wxt/utils/storage"

import { env } from "@/utils/env"

export type Settings = {
  apiUrl: string
  badges: boolean
  // Dim the artwork of a title rated under this, or nothing dimmed when null: an opt-in way to let the score do the browsing.
  dimBelow: number | null
  enabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: env.WXT_PUBLIC_API_URL,
  badges: true,
  dimBelow: null,
  enabled: true,
}

// Synced across the user's browsers. The API URL is the one field a developer changes (the portless dev URL, or a self-hosted API); the rest are switches and one threshold for the page.
export const settings = storage.defineItem<Settings>("sync:settings", {
  fallback: DEFAULT_SETTINGS,
  version: 1,
})

// Stored settings over the defaults: a value saved by an older build lacks the keys added since, and a missing key must read as its default, never as undefined.
export const withDefaults = (stored: Partial<Settings> | null | undefined): Settings => ({
  ...DEFAULT_SETTINGS,
  ...stored,
})

export const readSettings = async (): Promise<Settings> => withDefaults(await settings.getValue())
