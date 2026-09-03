# dmico-hub — project instructions

Read this first. It is loaded automatically in every Claude Code session in this repo.

## What this is

DMICO Hub is Damico's private life OS: a static HTML/CSS/JS single-page app on GitHub
Pages, auth-gated by Supabase, installable as a PWA (primary device: **Android phone**).
It pairs with a Discord bot, `jadefrog-scheduler` ("Jade"), in a separate repo on Railway.

**The hub is the cockpit, Discord is the voice.**

## Architecture you must know

- **No build step, no framework, no bundler.** Plain ES5/ES6 in `<script>` tags loaded in
  order from `index.html`. Do not introduce React, TypeScript, npm, or a build pipeline.
- **One module per file**, each exposing `window.render<Name>(container, sb)`. `app.js` is
  the shell: auth, the lantern rail, `openModule()` routing, and the shared helpers.
- **Data lives in Supabase.** Most personal data is JSONB blobs in the `kv_store` table,
  read and written with `window.dmicoKvGet(key)` / `window.dmicoKvSet(key, value)`.
  Some domains use real tables (`finance_expenses`, `finance_settings`, `research_papers`...).
- **Anything needing bot credentials** (Google Calendar, running a curator) is queued with
  `window.dmicoEnqueue(action)` into kv `hub_actions`. The bot drains it every ~30s.
- `now.js` holds the ONE shared state computation (`dmicoComputeState`) feeding the Home
  state block, the rail attention dots, and the banner. Keep it single-source.

## Conventions (non-negotiable)

- **Deliver complete files.** Damico drops them in and pushes via GitHub Desktop.
- **Never use em dashes** in code comments, UI copy, or replies. Use commas or parentheses.
- **Never delete, archive.** `archived: true` in the `MODULES` array in `app.js` hides a
  module; `_help_archive()` in the bot keeps old code. Reversibility is the house rule.
- **No secrets in this repo.** `config.js` holds only the Supabase *publishable* key and
  the *public* VAPID key. Both are safe to ship. Never add a service_role key.
- Use relative paths (`./`), never absolute (`/`), because Pages serves under `/dmico-hub/`.
- **Bump the `?v=` token in `index.html` on every deploy.** Every local script and the
  stylesheet carry one shared version query. Without it the browser happily serves
  month-old JavaScript, which is exactly how the `fixed` bucket shipped on 1 Sep 2026
  and was still invisible on the 3rd. `sw.js` fetches same-origin JS, CSS and HTML with
  `cache: "no-store"` as a safety net, but the token is the first line of defence and
  the only one that works before the service worker takes control.
- Reuse existing patterns and CSS variables before inventing new ones.

## Design system

Tokens live in `styles.css` `:root` and are documented in
`docs/design/dmico-brand-design-context.md`. Warm and papery, never dark. Cornsilk paper,
deep-brown ink, olive accent for actions, alloy-orange as the single signal colour.
**Saturation is a budget:** if everything glows, nothing does.

Current work: `docs/design/DESIGN-BRIEF-hub-redesign.md`. Read it before any UI change.
The motion rule: **motion belongs where the user is orienting and choosing, stillness
belongs where they are concentrating.** Home may animate; inside a module, nothing moves.
Everything respects `prefers-reduced-motion`.

## State of play

7 visible modules (Home, Week, Control, Life, Curators, Finance, Exercise) plus a collapsed
Archive drawer of 7 more. This followed a usage audit that found roughly half the system had
never been used. See `docs/design/PRD-consolidation-and-jade-realtime.md`.

Full system context, including the bot: `docs/DMICO-HUB-MASTER-CONTEXT.md`.

## Verifying

There is no test suite. Verify by:
1. `node --check <file>` for syntax.
2. Reasoning through the data shapes (query Supabase if available rather than guessing).
3. Opening the page and checking the console.

Do not claim something works because it compiles. Say what you verified and what you did not.
