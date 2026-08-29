// A labelled on/off row for the popup and options page: a native checkbox styled as a switch, so it needs no library and stays keyboard-accessible.
export function SwitchRow({
  checked,
  description,
  label,
  onChange,
}: {
  checked: boolean
  description?: string
  label: string
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="flex flex-col">
        <span className="text-sm font-medium">{label}</span>
        {description && <span className="text-xs text-neutral-500">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="peer-checked:bg-imdb h-5 w-9 rounded-full bg-neutral-300 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-neutral-400 dark:bg-neutral-700" />
        <span className="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  )
}
