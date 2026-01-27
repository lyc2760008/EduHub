# Skill: EduHub Design System (Warm-Friendly, Bilingual, Admin-first)

## Purpose

This skill defines the official UI/UX design system for MMC Education SaaS (EduHub).
Use it whenever generating or modifying UI for both:

- MVP Admin Console (fast, operational, data-heavy)
- Phase 2 Parent Portal (polished, trust-building, more whitespace)

This skill ensures consistency across modules, prevents UI drift, and enforces bilingual (en + zh-CN) rules.

---

## Hard Rules (Non-negotiable)

1. **No hard-coded user-facing strings**
   - All labels, headings, empty states, button text must come from i18n keys.
   - Avoid string concatenation that breaks Chinese grammar. Use full keys.

2. **Bilingual UX must be first-class**
   - Language toggle must remain visible and consistent (topbar for admin, header for portal).
   - Text expansion handling must be designed (line-clamp rules, chip overflow rules).

3. **Use shadcn/ui + Tailwind tokens**
   - Prefer shadcn primitives (Button, Input, Select, Badge, Card, Sheet, Dialog, Toast).
   - Theme via CSS variables (shadcn style), not bespoke per-component colors.

4. **Consistency > novelty for Admin MVP**
   - Admin must be simple, minimal friction, and consistent across pages.
   - Avoid overly decorative visuals in admin.

5. **Portal is more spacious**
   - Portal uses larger padding, calmer hierarchy, and more whitespace than admin.

---

## Visual Direction (Locked)

- **Vibe:** warm-friendly, approachable, trustworthy (not childish)
- **Primary color:** warm amber/apricot family
- **Admin density:** balanced
- **Portal:** more whitespace, “consumer-grade” calm

---

## Theme Tokens (shadcn CSS variables)

Implement and use standard shadcn variables:

- --background / --foreground
- --card / --card-foreground
- --popover / --popover-foreground
- --primary / --primary-foreground
- --secondary / --secondary-foreground
- --muted / --muted-foreground
- --accent / --accent-foreground
- --destructive / --destructive-foreground
- --border / --input / --ring
- --radius

### Token intent (guidance)

- Background: warm off-white
- Primary: warm amber/apricot with accessible contrast for text
- Muted surfaces: warm-tinted neutral
- Ring/focus: clear warm ring, visible on inputs/buttons
- Destructive/warn/success: readable and accessible; don’t make them “cute”

---

## Typography (Bilingual-safe)

### Font approach

- Use a modern Latin font via `next/font` (Inter acceptable) + robust CJK fallback.
- Include common CJK fallbacks: Noto Sans SC, PingFang SC, Microsoft YaHei, system fallbacks.
- Use comfortable line height for mixed EN/zh-CN to avoid cramped CJK.

### Type scale (preferred defaults)

- H1: text-xl font-semibold
- Section title: text-base font-semibold
- Body: text-sm
- Muted/help: text-xs text-muted-foreground

---

## Layout Rules

### Admin

- Sidebar + topbar layout.
- Page padding: p-4 (mobile) / p-6 (desktop)
- Sections: space-y-4
- Tables: balanced density (no ultra-compact rows).

### Portal

- Container: more whitespace than admin.
- Page padding: p-5 (mobile) / p-8 (desktop)
- Cards: slightly larger padding, calmer hierarchy.

---

## Component Patterns (Must-follow)

### Admin “Table + Drawer” standard

- Primary surface: table (search + filters + pagination)
- Create/Edit: right-side Sheet drawer
- Row actions: kebab menu
- States: loading skeleton, empty (first-time vs filtered), inline error alerts

### Truncation rules (critical)

- Text cells: line-clamp-1 + tooltip on hover/focus
- Chips list: show max 2 chips + “+N”
- Badges (type/status): never wrap

### Forms

- Single column in drawers (fast scan)
- Inline field-level errors
- Required indicators consistent
- Save behavior consistent across modules

### Confirmation + toasts

- Destructive actions require confirm dialog
- Success uses short toast
- Blocking errors use inline alert

---

## Bilingual Naming Conventions (Default terms)

Use these default translations unless PO overrides:

- Group = 小组
- Class = 班级
- Roster = 名单
- Tutors = 老师

---

## i18n Key Strategy (Design-friendly)

- nav.\* for navigation
- page.\* for page titles
- actions.\* for common CTAs
- common.\* for shared states/messages
- module namespaces: groups._, students._, sessions.\*, etc.
- Avoid building sentences by concatenating fragments.

---

## How to Apply This Skill

Whenever building/modifying UI:

1. Use existing layouts/components first.
2. Ensure theme tokens drive colors and surfaces.
3. Apply typography scale and spacing rules.
4. Add i18n keys for all new UI strings (en + zh-CN).
5. Validate truncation/chips rules on both languages.
6. Add minimal stable selectors (data-testid) only where tests need stability.

---

## What NOT to do

- Don’t introduce arbitrary new colors outside tokens.
- Don’t hardcode fonts per-page.
- Don’t create one-off spacing systems per module.
- Don’t invent new table/drawer patterns unless explicitly requested.

END
