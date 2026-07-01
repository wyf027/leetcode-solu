---
name: figma-design-to-tokens
description: Maps Figma or design-spec values to project design tokens (Tailwind/designTokens) for pixel-accurate implementation. Use when implementing from Figma links, screenshots, or design specs to get correct colors, font sizes, weights, radii, and spacing.
---

# Figma 设计还原 → 项目 Token 映射

When implementing UI from Figma or design specs, map design values to the **current project's** design tokens first, then write `className` or `style`. This keeps px precision, colors, typography, and border radius consistent and maintainable.

## When to Use This Skill

- User provides a Figma link, design screenshot, or design spec and asks to implement or adjust a page/component.
- User asks to "按设计稿实现" / "还原设计" / "match the design" and you need to avoid magic values.

## Step-by-Step Workflow

### 1. Locate project design tokens

In the **current workspace**, find:

- **Tailwind theme**: usually `tailwind.config.ts` or `tailwind.config.js` → `theme.extend` (colors, fontSize, borderRadius, spacing, fontFamily).
- **Design tokens (if any)**: e.g. `constants/designTokens.ts`, `theme/tokens.ts`, or paths mentioned in project docs (e.g. "UI 设计规范" or "design system").
- **Design doc (optional)**: e.g. `.cursor/plans/UI设计规范-全局变量.md` or a README that lists className ↔ usage.

Read these files before writing any layout or typography classes.

### 2. Map design values to tokens

For each design value (from Figma or spec), decide:

| Design dimension | Where to look in project | Output |
|------------------|--------------------------|--------|
| **Color** (hex/rgb) | `theme.extend.colors` or `designTokens.colors` | Use semantic class: `text-*`, `bg-*`, `border-*` or token name. Do not paste raw hex in JSX. |
| **Font size / line-height / weight** | `theme.extend.fontSize`, `designTokens.typography` | Use `text-*` (e.g. `text-sm`, `text-body`, `text-h1`) or existing semantic names. Avoid `text-[14px]` if a token exists. |
| **Font family** | `theme.extend.fontFamily` | Use e.g. `font-sans`, `font-primary` as defined in project. |
| **Border radius** | `theme.extend.borderRadius` | Use `rounded-*` (e.g. `rounded-card`, `rounded-button`). |
| **Spacing (padding/margin/gap)** | `theme.extend.spacing` | Use `p-*`, `m-*`, `gap-*` with token names (e.g. `p-znc-md`, `gap-4`) instead of arbitrary `p-[17px]` when a token fits. |

If the project has no token for a design value, use a one-off value (e.g. `text-[13px]`, `rounded-[6px]`) and add a short comment: `// 设计稿原值` (or "design spec value"), and suggest adding a token later if repeated.

### 3. Write code

- Prefer **Tailwind className** using the mapped tokens.
- If a value is only in designTokens (e.g. numeric for `style` or a chart lib), import from the project's token file and use it; do not hardcode the number in the component.

### 4. Quick reference: typical Figma → token mapping (generic)

Projects vary; use the **current project's** config as source of truth. Below is a common pattern to adapt:

| Figma / design | Often maps to (Tailwind-style) | Note |
|----------------|--------------------------------|------|
| Title / heading dark | `text-prominent` or `text-gray-900` | Check project colors. |
| Body text | `text-regular` or `text-base` / `text-sm` | Check theme fontSize + colors. |
| Secondary / hint | `text-auxiliary` or `text-hint` | Check project. |
| Primary / link / CTA | `text-primary-aux` or `text-primary` | Check project. |
| 12px / 14px / 16px / 18px | `text-xs` / `text-sm` / `text-base` / `text-lg` or semantic `text-caption` / `text-body` / `text-subtitle` | Prefer project semantic names. |
| 8px / 16px / 24px spacing | `p-2` / `p-4` / `p-6` or `znc-sm` / `znc-md` / `znc-lg` | Use project spacing scale. |
| 8px / 16px / 24px radius | `rounded-button` / `rounded-card` / `rounded-large` or `rounded-lg` / `rounded-xl` | Use project borderRadius. |

Always prefer the **exact token names and scale** from the open project over this table.

## Summary

1. **Read** the project’s `tailwind.config` and design token files first.
2. **Map** every design color, font size, radius, and spacing to a project token or document the exception.
3. **Write** className (and style when needed) using those tokens; avoid magic numbers and raw hex in UI code.
