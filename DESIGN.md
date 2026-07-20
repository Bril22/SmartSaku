# Design System — SmartSaku

## Human-friendly overview
SmartSaku is a personal money manager and debt payoff app. The design is warm and calm: cream background, sage green for savings and progress, peach for debt and actions. It is built mobile-first, because the owner checks it daily from a phone. This file is the single source of truth for all visual decisions.

---

## Product Context
- **What this is:** Personal money manager + debt payoff tracker (accounts, income/expenses, debt schedules, projections, AI insights).
- **Who it's for:** Individual users in Indonesia (IDR currency). First user: fttmbril22@gmail.com.
- **Space:** Personal finance apps (Money Lover, Monefy, Sribuu locally; YNAB, Copilot globally).
- **Project type:** Mobile-first web app (Next.js), installable feel, bottom tab navigation.

## Research takeaways (Jul 2026)
- Copilot Money wins on polish: big readable numbers, one clear metric per screen.
- Debt Payoff Planner keeps the **debt-free date visible on every screen** — strong motivator; we adopt this.
- Monefy wins Indonesian users with a minimal, fast, no-setup expense entry; our quick-add must be under 5 seconds.
- Category norm is cold blue/dark fintech. Our warm organic palette is a deliberate differentiator.

## Aesthetic Direction
- **Direction:** Organic/Natural — earth tones, rounded forms, warm surfaces.
- **Decoration level:** intentional (soft shadows, generous radius; no gradients except the one hero card).
- **Mood:** Calm and encouraging. Debt is stressful; the app should feel like a garden growing, not a bill collector. The word for success is "Lunas!" (paid off).
- **Memorable thing:** "The warm money app that shows my debt-free date everywhere."

## Typography
- **Display/Hero + big money numbers:** Fraunces (Google Fonts) — warm characterful serif, fits the organic palette.
- **Body/UI:** Plus Jakarta Sans — clean, friendly, designed for Jakarta (nice story for an Indonesian app).
- **Data/amounts:** Plus Jakarta Sans or Fraunces with `font-variant-numeric: tabular-nums` — always.
- **Loading:** Google Fonts via `next/font` (self-hosted at build).
- **Scale:** 12 / 13.5 / 15 (body) / 18 / 24 / 30 / 38px (hero money).

## Color
- **Approach:** balanced — green scale = growth/savings/success (DEFAULT since 2026-07-20), peach = debt/action, cream = surface.

**Default green scale (primary):**

| Token | Hex | Usage |
|---|---|---|
| sun | #F0E491 | highlight chips, hero accents (sparingly) |
| lime | #BBC863 | chart fills, progress bars, decorative |
| leaf | #658C58 | sage token — progress, savings fills, hero gradient end |
| forest | #31694E | sagedeep token — primary buttons, links, success text, hero gradient start |

**Neutrals & support:**

| Token | Hex | Usage |
|---|---|---|
| cream | #FFEED6 | app background |
| cream-2 | #FFF7EA | raised background, phone frame |
| card | #FFFFFF | cards/surfaces |
| line | #EBDCC3 | borders, dividers |
| earth | #827148 | secondary text, ghost buttons, icons |
| ink | #443A28 | body text (AA on cream) |
| ink-soft | #6F6350 | muted text |
| peach | #E8A07C | debt fills, highlights |
| peach-deep | #C96F4A | accent CTA (FAB), debt emphasis |
| semantic good | #31694E | success ("Lunas!") |
| good-bg | #E9EFD8 | success tint backgrounds |
| semantic warn | #C79A3D | warnings (derived amber, harmonized) |
| semantic bad | #C0563E | errors/overdue |

- **Contrast rule:** never put #BBC863, #F0E491, or #E8A07C text on cream — use #31694E / #C96F4A for text.
- **Dark mode:** not in v1. Later: warm dark brown surfaces (#2A241A), desaturate fills 15%.

## Spacing
- **Base unit:** 4px. **Density:** comfortable.
- Scale: xs 4, sm 8, md 16, lg 24, xl 32, 2xl 48.

## Layout (mobile-first)
- **Mobile (default):** single column, bottom tab bar (Home, Money, Debts, Future) + center FAB for quick-add. Sticky hero card. Thumb-reachable actions.
- **≥768px:** left sidebar replaces tab bar, content max-width 1100px, two-column dashboards.
- **Border radius:** sm 8, md 14, lg 20, full 999. Cards use md/lg.
- **Shadow:** `0 2px 10px rgba(130,113,72,.10)` only.

## Components
- Primary button: sage-deep pill, cream text. Accent button: peach-deep pill (quick-add, pay actions).
- Debt rows: progress bar + remaining + finish date; paid-off debts celebrate with "Lunas!" in sage-deep.
- Hero card: the ONLY gradient (sage-deep → #87935D), shows total savings + debt-free date.
- Alerts: tinted backgrounds (#EDF0DF good, #F7ECD4 warn, #F6E2DB bad), never pure red/green.

## Motion
- **Approach:** minimal-functional. 150–250ms ease-out transitions; one celebratory moment allowed when a debt hits Lunas (confetti-lite).

## SAFE choices vs RISKS
- SAFE: bottom tab bar + FAB (category standard), card-based dashboard, progress bars for debts.
- RISK 1: warm serif (Fraunces) for money numbers — nobody in fintech does this; it is the brand.
- RISK 2: cream/earth palette in a category of cold dark UIs — distinctive, calming.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-07-20 | Initial design system | /design-consultation; palette provided by owner; research on YNAB/Copilot/Monefy/Debt Payoff Planner |
| 2026-07-20 | Green scale #F0E491/#BBC863/#658C58/#31694E is the default primary palette | Owner request; deeper greens also improve text contrast |
| 2026-07-20 | Desktop = full width with sidebar; two-column Home/Money, 2–3 col Debts grid | Owner feedback: desktop looked like a stretched phone |
