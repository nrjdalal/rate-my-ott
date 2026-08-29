import { storage } from "wxt/utils/storage"

import { env } from "@/utils/env"

export type Settings = {
  apiUrl: string
  badges: boolean
  enabled: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: env.WXT_PUBLIC_API_URL,
  badges: true,
  enabled: true,
}

// Synced across the user's browsers. The API URL is the one field a developer changes (the portless dev URL, or a self-hosted API); the rest are on/off switches for the page.
export const settings = storage.defineItem<Settings>("sync:settings", {
  fallback: DEFAULT_SETTINGS,
  version: 1,
})
