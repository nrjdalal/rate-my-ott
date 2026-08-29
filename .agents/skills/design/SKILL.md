---
name: design
description: Follow and maintain the app's UI conventions. Use for any UI, styling, or component work (spacing, color, cursor, layout, typography), or when making or changing a design-system convention.
source: https://github.com/nrjdalal/zerostarter
---

# Design Conventions

When a change establishes or alters a convention, update this file in the same change so it never drifts. Propose a genuinely new design-token choice before committing; the maintainer owns the design language.

## Principles

- **Defaults first.** Use primitives bare at their defaults and add a class only where a spot genuinely needs it. Per-instance overrides are how drift starts. Example: `<Spinner />`, not `<Spinner className="size-5" />`.
- **One source per concern.** Shared styling lives in the component or its variant, never copy-pasted across call sites. Brand identity (name, description, social links) is `@packages/config/site`.

## Cursor

`cursor-pointer` is for navigation only: links, anchors, a Button rendered as `<Link>` or `<a>`, a `router.push`. It signals "this changes the route."

- Action controls (form submit, dialog/menu triggers, toggles, mutation buttons) keep the native arrow even when the action eventually navigates: classify by element, not by side effect.
- In practice you need no `cursor-pointer` class: `<a href>` shows the pointer natively, `<button>` shows the arrow natively, and `buttonVariants` sets no cursor. A readOnly button-like input (the docs search trigger, `DocsSearch` in `components/docs/sidebar.tsx`) uses `cursor-default` to avoid the text I-beam.
- Exception: some primitives set their own cursor (`DropdownMenuItem` hard-codes `cursor-default`). A navigation item inside one (a `render={<Link/>}` menu item) needs an explicit `cursor-pointer` to restore the pointer the base overrode.

## Spacing

- Stay on the Tailwind scale and snap to the nearest step; no off-ladder one-offs (`gap-7.5`, `size-4.5`, `w-45`, `mb-18`, `text-[0.6rem]`).
- `gap-2` is the workhorse for tight clusters.
- Landing (marketing) pages share one vertical scale: `py-24` sections and a `px-4 md:px-6` container gutter.

## Typography and headings

- Exactly one `<h1>` per page (the page title); sections use `<h2>` and below, never skipping a level.
- Use the existing type scale and tokens; no off-scale font sizes.
- Landing-page headings are `font-bold`. A sub-heading within a section stays lighter (a `font-semibold` `h3`) to preserve hierarchy; non-heading display text (a stat value) follows its own weight.

## Color and theming

- Semantic tokens only: `text-muted-foreground`, `bg-card`, `border-border`, `bg-sidebar`, and friends. No hardcoded hex, rgb, or hsl in classNames or inline styles. The one exception is Satori-rendered OG images, which have no theme context.
- Dark mode is `next-themes` (`attribute="class"`, `app/providers.tsx`); pair every `dark:` with a token.
- Success uses the `--success` token (green-600 light, green-500 dark, mirroring `--destructive`): `text-success`, `bg-success/10`, `border-success/20`. It is foreground-less, like `--destructive`.

## Layout and landmarks

- Each top-level page wraps its content in a single `<main>`. Route-group layouts (docs) already render their own `<main>`, so add none to the root layout or you nest landmarks.
- A surface that has footer content renders it in a real `<footer>` as a sibling of `<main>`, never a `<div>` inside it, so the page exposes a `contentinfo` landmark. A surface with nothing to put there renders no footer rather than an empty one.
- Name a `<section>` that has a visible heading with `aria-labelledby` pointing at that heading's id, not a hand-written `aria-label`: internal authoring vocabulary ("Hero", "Call to action") otherwise leaks into the accessibility tree as the region's name. A wrapper with no visible heading (a `role="region"` scroll container) still takes `aria-label`.
- A scrollable region (a code block, a wide table) needs `tabIndex={0}` and an accessible name, or its overflow is unreachable by keyboard.
- Top-level full-height surfaces (the body, landing pages) use `min-h-svh`, matching the shadcn sidebar; no `dvh`. A surface nested inside an already-full-height parent (a route `error`) fills it with `flex-1` rather than re-asserting `min-h-svh`.

## Motion

- Every looping or auto-playing animation is gated on reduced motion. For a Tailwind utility use the `motion-safe:` variant (`motion-safe:animate-pulse`). For a keyframe Tailwind does not ship, declare it next to the section that uses it and wrap the rule in `@media (prefers-reduced-motion: no-preference)`; page-specific keyframes stay out of `globals.css`.
- Anything that moves for more than five seconds also needs a pause affordance, on both hover and `focus-within`, so a keyboard user can stop it (WCAG 2.2.2).

## Components

- **Loading:** `<Spinner />`, bare, at its default `size-4`. Never hand-roll `RiLoaderLine`. It goes where the wait is, inside the surface that is waiting, never as a route `loading.tsx`: without one the router holds the current page until the next is ready, then paints it whole.
- **Empty states:** the `Empty` primitive (`EmptyHeader` / `EmptyMedia` / `EmptyTitle` / ...). Do not hand-roll empty messages.
- **Badges and pills:** prefer `<Badge>` (with a variant, plus className for a semantic color like `text-success`) over a hand-rolled rounded-full span. Identity rows (avatar + name + email) use `Item` / `ItemMedia` / `ItemContent`. A landing page may hand-roll a larger eyebrow pill, since `<Badge>` is sized for compact UI (`h-5`, `text-xs`).
- **Forms:** native `<form>` then `<FieldGroup>` then `<Field>` + `<FieldLabel>` + `<Input>` + conditional `<FieldError>`, validated with zod. Let `FieldGroup` own the vertical rhythm (no second `space-y-*`). Do not hand-roll labels or error markup.
- **Toasts:** raised with `toast.add({ title, type })` from `@/components/ui/toast`, the manager the component itself exports, and rendered by the `Toaster` mounted in `providers.tsx`. `type` is `error`, `success`, `warning`, `info` or `loading`. No wrapper and no toast library: the component is used the way it ships, so a sync never has to re-apply anything for it. The surface stays neutral and the kind shows in the icon, red for an error.
- **Dialogs:** bare `<DialogContent>` is centered at `sm:max-w-sm`.
- **Icons:** `@remixicon/react` only. `size-4` inside buttons by default.
- **shadcn (`components/ui/*`):** customize only via `.github/scripts/shadcn-customize.ts` (the sync wipes and re-scaffolds `ui/`). Extend the primitive in place; do not fork a copy.

## File and export naming

- Components are grouped by domain folder (`common/`, `shell/`, `docs/`, `ui/`), with kebab-case file names. A single-component file's basename matches its export; a multi-export slot file is named `<area>/sidebar.tsx` and its exports follow the sidebar-slot rule below. `docs/` holds one of each (`docs/sidebar.tsx` + `docs/copy-as-markdown.tsx`). A cross-domain family follows the shadcn single-module pattern as one top-level file whose exports share the family prefix.
- Sidebar slot exports follow one rule: domain-prefix the generic-role names (`Nav`, `Header`, `Footer`, `Search`) so they read unambiguously and never collide across areas. So `DocsNav`, `DocsFooter`, `DocsSearch`. Leave a distinctive content name bare (`CopyAsMarkdown`): a domain prefix on a self-explaining name is redundant.
- `shell/` holds the shared app-shell chrome (`SidebarFloatingTrigger` today). "Shell" denotes structural layout scaffolding, not one specific component.

## Open decisions

None open. Resolved decisions fold into the sections above; add new ones here (move up once chosen).
