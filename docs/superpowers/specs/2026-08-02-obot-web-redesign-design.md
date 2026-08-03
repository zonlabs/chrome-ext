# Obot Web Redesign Design

## Purpose

Redesign `obot/web` from a developer-facing auth demo into a professional customer workspace for Obot. The app should feel useful even while the product has few live features, and it should be easy to extend later with agents, connected tools, activity, usage, billing, and account settings.

## Audience

Primary users are customers who want an AI assistant workspace connected to their browser, tools, and account. Secondary users are developers evaluating Obot, but the interface should avoid implementation details unless they are clearly useful to a signed-in user.

## Chosen Approach

Use a hybrid product structure:

- `/` becomes a polished public product intro with clear customer-facing copy and a primary sign-in/dashboard action.
- `/login` becomes a focused, professional sign-in screen.
- `/dashboard` becomes the main shadcn-inspired workspace shell with placeholders for future product areas.

This keeps the unauthenticated experience concise while letting the authenticated dashboard grow without redesigning the whole app later.

## Alternatives Considered

- Landing-only refresh: fast, but it would not solve the current dashboard emptiness.
- Dashboard-only product surface: strong app-first feel, but awkward for unauthenticated visitors.
- Hybrid intro plus dashboard: best fit because it supports both customer onboarding and future application growth.

## Visual Direction

Palette:

- `Ink` `#0A0A0B`: primary app background and high-contrast text.
- `Porcelain` `#FAFAF8`: light surfaces and text on dark controls.
- `Graphite` `#18181B`: cards, nav, and framed dashboard panels.
- `Signal Red` `#E11D2E`: primary actions, alerts, and brand emphasis.
- `Steel` `#94A3B8`: secondary text and calm data accents.
- `Mist` `#F1F5F9`: soft dividers and muted background surfaces.

Typography:

- Keep the existing Geist and Space Grotesk setup.
- Use Space Grotesk for page titles, dashboard section headings, and product marks.
- Use Geist Sans for interface copy.
- Use Geist Mono sparingly for status labels and compact metadata, not exposed technical internals.

Signature element:

- A restrained "signal rail" motif: thin red status bars, timeline accents, and active navigation indicators. It gives the product a recognizable Obot visual language without relying on loud gradients or generic decorative blobs.

## Page Designs

### Public Home

The home page should communicate Obot as an AI workspace for users, not as a Next.js auth integration. It should include:

- A first-viewport product hero with the Obot name, a concise value statement, and sign-in/dashboard CTA.
- A compact product preview showing future dashboard areas: agents, connected tools, browser context, and recent activity.
- Three customer-facing capability blocks: chat with browser context, connect useful tools, keep work organized.
- No session JSON, server implementation notes, route names, or backend architecture copy.

### Login

The login page should feel calm and trustworthy:

- Left side: short brand promise and three user-facing benefits.
- Right side: compact sign-in panel using the existing Google sign-in flow.
- Error state stays visible and specific.
- Loading state stays in the button and does not shift layout.

### Dashboard

The dashboard should become an extendable workspace shell:

- Top header: greeting, short workspace summary, and account badge.
- Left navigation rail on desktop with current sections: Overview, Agents, Tools, Activity, Settings. Non-live sections can be visually present as disabled or "soon" states.
- Main overview grid with:
  - KPI strip for agents, connected tools, tasks handled, and workspace status using realistic placeholder counts where live data does not exist.
  - "Command center" panel with a customer-facing explanation of what Obot will do.
  - "Agents" panel with empty state and future creation CTA.
  - "Connected tools" panel listing browser, Gmail/Calendar-style examples as placeholders without implying they are active.
  - "Recent activity" timeline with empty or sample onboarding states.
  - Account panel with safe identity details only: name, email, plan, member since, session status. Hide raw IDs, raw tokens, IP address, and user agent from the primary UI.

## Components

Reuse existing shadcn components already present:

- `Button`
- `Card`
- `Badge`
- `Avatar`
- `Separator`
- `Tooltip` where icons need explanation

Add small local presentational helpers only when they reduce repetition, such as metric cards, feature rows, activity items, and workspace panels. Avoid introducing a new charting dependency for this pass because there is not real metric data yet.

## Data Flow

- Continue using `getSession()` in server components for `/` and `/dashboard`.
- Preserve the existing redirect from `/dashboard` to `/login` when no session exists.
- Preserve the current `signIn.social({ provider: "google" })` behavior on `/login`.
- Derive visible account content from the existing session object, but do not render raw session JSON or sensitive technical values.
- Use clearly labeled placeholder content for future dashboard modules.

## Error Handling

- Login errors remain user-visible in the sign-in panel.
- Missing session continues to redirect to `/login`.
- Missing optional user fields should fall back gracefully to email, initials, or "Workspace".
- Future feature placeholders should say "Coming soon" or "Not connected" rather than failing or displaying fake active state.

## Accessibility And Responsiveness

- Keep semantic landmarks: header, nav, main, sections.
- Preserve keyboard focus styles through shadcn/Tailwind ring tokens.
- Ensure desktop navigation collapses into compact top navigation or stacked sections on mobile.
- Avoid text overflow in cards, buttons, and badges by using truncation only for account identifiers and wrapping for explanatory copy.
- Respect reduced motion for any pulsing signal indicator.

## Testing And Verification

Run:

- `npm run lint`
- `npm run build`

Also manually inspect:

- `/`
- `/login`
- `/dashboard`

Verify desktop and mobile layouts, sign-in button state, unauthenticated redirect behavior, and that no raw session JSON, token, IP address, or user agent appears in the redesigned UI.

## Out Of Scope

- Adding real agents CRUD.
- Adding real tool connection flows.
- Adding billing or usage APIs.
- Changing worker auth behavior.
- Changing database schema.
