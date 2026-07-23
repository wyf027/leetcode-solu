---
name: ui-ux-pro-max
description: Comprehensive design guide for web and mobile applications. Contains 67 styles, 96 color palettes, 57 font pairings, 99 UX guidelines, and 25 chart types across 13 technology stacks. Searchable database with priority-based recommendations. Use when building UI, choosing styles/colors/fonts, reviewing UX, adding charts, or starting new projects.
---

# ui-ux-pro-max

Comprehensive design guide for web and mobile applications. Contains 67 styles, 96 color palettes, 57 font pairings, 99 UX guidelines, and 25 chart types across 13 technology stacks. Searchable database with priority-based recommendations.

# Prerequisites

Check if Python is installed:

```bash
python3 --version || python --version
```

If Python is not installed, install it based on user's OS:

**macOS:**
```bash
brew install python3
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install python3
```

**Windows:**
```powershell
winget install Python.Python.3.12
```

---

## How to Use This Skill

Use this skill when the user requests any of the following:

| Scenario | Trigger Examples | Start From |
|----------|-----------------|------------|
| **New project / page** | "做一个 landing page"、"Build a dashboard" | Step 1 → Step 2 (design system) |
| **New component** | "Create a pricing card"、"Add a modal" | Step 3 (domain search: style, ux) |
| **Choose style / color / font** | "What style fits a fintech app?"、"推荐配色" | Step 2 (design system) |
| **Review existing UI** | "Review this page for UX issues"、"检查无障碍" | Quick Reference checklist above |
| **Fix a UI bug** | "Button hover is broken"、"Layout shifts on load" | Quick Reference → relevant section |
| **Improve / optimize** | "Make this faster"、"Improve mobile experience" | Step 3 (domain search: ux, react) |
| **Implement dark mode** | "Add dark mode support" | Step 3 (domain: style "dark mode") |
| **Add charts / data viz** | "Add an analytics dashboard chart" | Step 3 (domain: chart) |
| **Stack best practices** | "React performance tips"、"SwiftUI navigation" | Step 4 (stack search) |

Follow this workflow:

### Step 1: Analyze User Requirements

Extract key information from user request:
- **Product type**: Entertainment (social, video, music, gaming), Tool (scanner, editor, converter), Productivity (task manager, notes, calendar), or hybrid
- **Target audience**: C-end consumer users; consider age group, usage context (commute, leisure, work)
- **Style keywords**: playful, vibrant, minimal, dark mode, content-first, immersive, etc.
- **Stack**: React Native (this project's only tech stack)

### Step 2: Generate Design System (REQUIRED)

**Always start with `--design-system`** to get comprehensive recommendations with reasoning:

```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "<product_type> <industry> <keywords>" --design-system [-p "Project Name"]
```

This command:
1. Searches domains in parallel (product, style, color, landing, typography)
2. Applies reasoning rules from `ui-reasoning.csv` to select best matches
3. Returns complete design system: pattern, style, colors, typography, effects
4. Includes anti-patterns to avoid

**Example:**
```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness service" --design-system -p "Serenity Spa"
```

### Step 2b: Persist Design System (Master + Overrides Pattern)

To save the design system for **hierarchical retrieval across sessions**, add `--persist`:

```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name"
```

This creates:
- `design-system/MASTER.md` — Global Source of Truth with all design rules
- `design-system/pages/` — Folder for page-specific overrides

**With page-specific override:**
```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system --persist -p "Project Name" --page "dashboard"
```

This also creates:
- `design-system/pages/dashboard.md` — Page-specific deviations from Master

**How hierarchical retrieval works:**
1. When building a specific page (e.g., "Checkout"), first check `design-system/pages/checkout.md`
2. If the page file exists, its rules **override** the Master file
3. If not, use `design-system/MASTER.md` exclusively

### Step 3: Supplement with Detailed Searches (as needed)

After getting the design system, use domain searches to get additional details:

```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --domain <domain> [-n <max_results>]
```

**When to use detailed searches:**

| Need | Domain | Example |
|------|--------|---------|
| Product type patterns | `product` | `--domain product "entertainment social"` |
| More style options | `style` | `--domain style "glassmorphism dark"` |
| Color palettes | `color` | `--domain color "entertainment vibrant"` |
| Font pairings | `typography` | `--domain typography "playful modern"` |
| Chart recommendations | `chart` | `--domain chart "real-time dashboard"` |
| UX best practices | `ux` | `--domain ux "animation accessibility"` |
| Landing structure | `landing` | `--domain landing "hero social-proof"` |
| React Native perf | `react` | `--domain react "rerender memo list"` |
| App interface a11y | `web` | `--domain web "accessibilityLabel touch safe-areas"` |
| AI prompt / CSS keywords | `prompt` | `--domain prompt "minimalism"` |

### Step 4: Stack Guidelines (React Native)

Get React Native implementation-specific best practices:

```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "<keyword>" --stack react-native
```

---

## Search Reference

### Available Domains

| Domain | Use For | Example Keywords |
|--------|---------|------------------|
| `product` | Product type recommendations | SaaS, e-commerce, portfolio, healthcare, beauty, service |
| `style` | UI styles, colors, effects | glassmorphism, minimalism, dark mode, brutalism |
| `typography` | Font pairings, Google Fonts | elegant, playful, professional, modern |
| `color` | Color palettes by product type | saas, ecommerce, healthcare, beauty, fintech, service |
| `landing` | Page structure, CTA strategies | hero, hero-centric, testimonial, pricing, social-proof |
| `chart` | Chart types, library recommendations | trend, comparison, timeline, funnel, pie |
| `ux` | Best practices, anti-patterns | animation, accessibility, z-index, loading |
| `react` | React/Next.js performance | waterfall, bundle, suspense, memo, rerender, cache |
| `web` | App interface guidelines (iOS/Android/React Native) | accessibilityLabel, touch targets, safe areas, Dynamic Type |
| `prompt` | AI prompts, CSS keywords | (style name) |

### Available Stacks

| Stack | Focus |
|-------|-------|
| `react-native` | Components, Navigation, Lists |

---

## Example Workflow

**User request:** "Make an AI search homepage."

### Step 1: Analyze Requirements
- Product type: Tool (AI search engine)
- Target audience: C-end users looking for fast, intelligent search
- Style keywords: modern, minimal, content-first, dark mode
- Stack: React Native

### Step 2: Generate Design System (REQUIRED)

```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "AI search tool modern minimal" --design-system -p "AI Search"
```

### Step 3: Supplement with Detailed Searches (as needed)

```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "minimalism dark mode" --domain style
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "search loading animation" --domain ux
```

### Step 4: Stack Guidelines

```bash
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "list performance navigation" --stack react-native
```

**Then:** Synthesize design system + detailed searches and implement the design.

---

## Output Formats

The `--design-system` flag supports two output formats:

```bash
# ASCII box (default) - best for terminal display
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system

# Markdown - best for documentation
python3 .cursor/skills/ui-ux-pro-max/scripts/search.py "fintech crypto" --design-system -f markdown
```

---

## Tips for Better Results

### Query Strategy

- Use **multi-dimensional keywords** — combine product + industry + tone + density: `"entertainment social vibrant content-dense"` not just `"app"`
- Try different keywords for the same need: `"playful neon"` → `"vibrant dark"` → `"content-first minimal"`
- Use `--design-system` first for full recommendations, then `--domain` to deep-dive any dimension
- Always add `--stack react-native` for implementation-specific guidance

### Common Sticking Points

| Problem | What to Do |
|---------|------------|
| Can't decide on style/color | Re-run `--design-system` with different keywords |
| Dark mode contrast issues | `--domain ux "color-dark-mode color-accessible-pairs"` |
| Animations feel unnatural | `--domain ux "spring-physics easing exit-faster-than-enter"` |
| Form UX is poor | `--domain ux "inline-validation error-clarity focus-management"` |
| Navigation feels confusing | `--domain ux "nav-hierarchy bottom-nav-limit back-behavior"` |
| Layout breaks on small screens | `--domain ux "mobile-first breakpoint-consistency"` |
| Performance / jank | `--domain react "virtualize-lists main-thread-budget debounce-throttle"` |

---

## Common Rules for Professional UI

### Icons & Visual Elements

- Default icon library: **Phosphor (`@phosphor-icons/react`)**. `icons.csv` lists common recommendations, not the full set.
- When no match in recommendations: prefer any semantically appropriate Phosphor icon; fallback to **Heroicons (`@heroicons/react`)**.

| Rule | Standard | Avoid |
|------|----------|--------|
| **No Emoji as Structural Icons** | Use vector-based icons (Phosphor, Heroicons) | Using emojis for navigation or system controls |
| **Vector-Only Assets** | Use SVG or platform vector icons | Raster PNG icons that blur or pixelate |
| **Consistent Icon Sizing** | Define icon sizes as design tokens (sm, md=24pt, lg) | Mixing arbitrary sizes randomly |
| **Touch Target Minimum** | Minimum 44x44pt interactive area | Small icons without expanded tap area |

### Interaction

| Rule | Do | Don't |
|------|----|----- |
| **Tap feedback** | Clear pressed feedback within 80-150ms | No visual response on tap |
| **Animation timing** | Micro-interactions 150-300ms with native easing | Instant or slow (>500ms) animations |
| **Disabled state clarity** | Disabled semantics, reduced emphasis, no tap action | Controls that look tappable but do nothing |
| **Touch target minimum** | >=44x44pt (iOS) or >=48x48dp (Android) | Tiny tap targets |

### Light/Dark Mode Contrast

| Rule | Do | Don't |
|------|----|----- |
| **Text contrast (light)** | Body text contrast >=4.5:1 | Low-contrast gray body text |
| **Text contrast (dark)** | Primary >=4.5:1, secondary >=3:1 on dark surfaces | Text that blends into background |
| **Token-driven theming** | Semantic color tokens mapped per theme | Hardcoded per-screen hex values |

### Layout & Spacing

| Rule | Do | Don't |
|------|----|----- |
| **Safe-area compliance** | Respect top/bottom safe areas | UI under notch or gesture area |
| **8dp spacing rhythm** | Consistent 4/8dp spacing system | Random spacing increments |
| **Readable text measure** | Limit line length on large devices | Edge-to-edge paragraphs on tablets |

---

## Pre-Delivery Checklist

### Visual Quality
- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from a consistent icon family and style
- [ ] Semantic theme tokens used consistently

### Interaction
- [ ] All tappable elements provide pressed feedback
- [ ] Touch targets meet minimum size
- [ ] Disabled states are visually clear and non-interactive

### Light/Dark Mode
- [ ] Primary text contrast >=4.5:1 in both modes
- [ ] Dividers/borders visible in both modes
- [ ] Both themes tested before delivery

### Layout
- [ ] Safe areas respected
- [ ] Scroll content not hidden behind fixed bars
- [ ] Verified on small phone, large phone, and tablet

### Accessibility
- [ ] All meaningful images/icons have accessibility labels
- [ ] Form fields have labels, hints, and clear error messages
- [ ] Reduced motion and dynamic text size supported
