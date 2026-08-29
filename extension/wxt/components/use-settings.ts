import { useEffect, useState } from "react"

import {
  DEFAULT_SETTINGS,
  readSettings,
  settings,
  withDefaults,
  type Settings,
} from "@/utils/settings"

// The stored settings as React state, kept in step with storage so two open surfaces (popup, options) never disagree.
export function useSettings(): [Settings | null, (patch: Partial<Settings>) => Promise<void>] {
  const [current, setCurrent] = useState<Settings | null>(null)
  useEffect(() => {
    readSettings().then(setCurrent)
    return settings.watch((next) => setCurrent(withDefaults(next)))
  }, [])
  const update = async (patch: Partial<Settings>) => {
    const next = { ...(current ?? DEFAULT_SETTINGS), ...patch }
    setCurrent(next)
    await settings.setValue(next)
  }
  return [current, update]
}
