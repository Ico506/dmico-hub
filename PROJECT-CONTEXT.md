# DMICO Life OS — Project Handoff

Drop this in the root of the `dmico-hub` repo (for example as `PROJECT-CONTEXT.md`) so Cowork reads it as folder context, and paste the "Working conventions" and "Architecture" sections into Cowork's folder-instructions field. It also works as a paste-in primer for a fresh chat.

---

## Who this is for

Damico (brand **DMICO**). Malaysian game designer and MPhil researcher at APU (nostalgia-driven AR for a retro gaming museum). GitHub username `ico506`. Aesthetic leans Muji and Ghibli, intentional living.

**JadeFrog Studio** is the game-studio identity. Keep it distinct from the DMICO personal brand.

## Working conventions (honor these in every reply)

- End replies with the top-hat emoji. Never use the frog emoji as a sign-off.
- No em dashes anywhere. They read as AI-written. Use commas, periods, or parentheses.
- Be humorous and straightforward.
- Give honest opinions. Never blindly agree. Push back when something is a bad idea.
- Verify model and API availability before committing to any architecture decision.
- Teaching sessions, when asked: one-topic lecture, then revision, then about 20 questions scaled easy to hard.

---

## Architecture (the big picture)

Three surfaces, one shared backend.

1. **Discord bot** (separate repo, Python + discord.py, on Railway). The record / analyze / reflect surface. Stays as-is. Future work is deepening reflection and life features.
2. **Life OS hub** (this repo, `dmico-hub`). A private, auth-gated web app of modules for browse-y, visual work. GitHub Pages + Supabase.
3. **3D museum** (future, separate public repo, three.js). Portfolio-facing, no private data.

**Supabase is the shared nervous system.** Both the bot and the hub read and write Supabase, on separate tables. The hub's tables are decoupled from the bot's key-value core. This is what enables "web records, Discord nudges" down the line.

Module build order: Research (done), Self-study (in progress), Hygiene (next), then 3D museum, Game Dev, Finance (deferred).

---

## Project coordinates

- **Repo:** `ico506/dmico-hub`, public (GitHub Pages free tier needs public; safe because no secrets live in the frontend).
- **Live site:** https://ico506.github.io/dmico-hub/
- **Supabase project ref:** `vlczjdqqpajkggzjlsqe`
- **Supabase URL:** https://vlczjdqqpajkggzjlsqe.supabase.co (bare host, never append /rest/v1)
- **Login email prefix:** damianyong506
- **Key location:** the Supabase publishable key lives in `config.js` as `window.DMICO_CONFIG`. Paste it once there. Other files never hold the key, so updates never overwrite it.

---

## Verified facts (re-verify if stale)

- **OpenAlex** now requires a free API key (since 13 Feb 2026). Self-serve instant at openalex.org/settings/api. 100k credits/day. Stored as Supabase secret `OPENALEX_API_KEY`.
- **Crossref** is keyless, CORS open, reliable. Used for Research search.
- **Supabase keys:** use the publishable key (`sb_publishable_...`) in the frontend. It is RLS-gated and safe to ship. The service_role / secret key never goes in the frontend. Legacy anon key is deprecating end of 2026.
- **Edge functions** deploy from the Supabase Dashboard editor (no CLI or Docker needed). Deno / TypeScript. Set "Verify JWT" OFF for public-data proxies. Invoke from the app via `sb.functions.invoke`, which attaches the apikey and JWT automatically.
- **Gemini API** powers the bot's Gemma model. For any hub AI feature, reuse the same key as a Supabase secret (`GEMINI_API_KEY`, plus optional `GEMINI_MODEL`). Verify the current endpoint and a live model string before building.

---

## Hub file map

- `index.html` — login view plus app view with the lantern module rail. Loads supabase-js, then `config.js`, `research.js`, `self-study.js`, `app.js` in that order.
- `config.js` — holds `window.DMICO_CONFIG` (Supabase URL pre-filled, publishable key pasted once).
- `app.js` — reads the config, handles email/password auth and session restore, renders the lantern rail, and routes `openModule` to each module's render function. `MODULES` array marks which lanterns are lit.
- `styles.css` — warm earthy palette (olive accent, cornsilk surface, alloy-orange lantern glow, brown ink). Zen Maru Gothic for display, Zen Kaku Gothic New for body. Modules are paper lanterns: lit means ready, unlit means coming.
- `research.js` — Research module. Discover (Crossref search, save with tags), Library (filter, tag chips, delete, edit tags, copy BibTeX, export .bib), Add by hand, and Find related (calls the edge function).
- `self-study.js` — Self-study module. Plan tab (add exams, live countdown, delete) and Focus tab (work/break timer with presets and custom).
- `supabase/functions/related-papers/index.ts` — Deno edge function proxying OpenAlex. Returns related works for a DOI, falls back to a title search when there are no precomputed neighbours or the DOI is unknown, and labels which kind via a `via` field.
- `supabase/research_papers.sql`, `supabase/study_exams.sql` — table schemas with RLS.

---

## What is built and working

- **Research module:** fully working. Crossref search, library with tags and BibTeX, .bib export, and Find related via the edge function.
- **related-papers edge function:** deployed and working, including the title-search fallback so it never dead-ends.
- **Self-study chunk one:** shipped. Exam tracker with live countdown chips (orange inside a week, grey once passed) and a focus timer with presets (25/5, 50/10, 90/20) plus a custom box, beep on phase flip, and a session counter. The timer keeps running across tab switches.

---

## Pending and next

1. **Self-study chunk two (immediate next):** the balanced study-plan generator. Build a new Gemma edge function (for example `study-plan`) that calls the Gemini API with `GEMINI_API_KEY` (and optional `GEMINI_MODEL`, reuse the bot's). Verify the current Gemini endpoint and a live model string first. Wire a "Generate plan" button onto each exam card that writes a spaced-repetition-aware schedule into the `plan` jsonb column and displays it.
2. **Hygiene module:** pure Supabase CRUD, no AI. "Last cleaned" timers and product inventory / run-out tracking. This is where the web-records-while-Discord-nudges loop gets built.
3. **3D museum:** separate public repo, three.js, GLB not FBX, Supabase Storage.
4. **Game Dev dashboard:** news plus Steam/itch, needs a backend or proxy.
5. **Finance:** deferred.
6. **Bot bridge:** the bot reads hub tables (via service_role) so exam crunch can factor into the weekly proposal. Optionally push the study plan to Google Calendar later.
7. **Wire the weekly reflection into the bot's schedule proposal** (currently only daily reflections feed it).

---

## Deploy mechanics

- **Tables:** paste the `.sql` into the Supabase SQL Editor and run.
- **Frontend:** drop or replace files in the local `dmico-hub` clone, commit, push via GitHub Desktop, wait about a minute for Pages, hard-refresh (Ctrl/Cmd+Shift+R). In Cowork this becomes: Cowork edits the files in place, you review, then push.
- **Edge functions:** paste into the Supabase Dashboard editor, Deploy, set "Verify JWT" OFF for public-data proxies, set any secrets.

### Known gotchas

- Blank or placeholder errors usually mean the wrong file copy was edited or the push didn't land.
- A `/rest/v1/auth/v1/token` 404 means `/rest/v1` got appended to the Supabase URL. Use the bare host.
- A 401 "invalid credentials" on an external curl to an edge function is expected (no apikey header). The hub's `invoke` attaches it automatically.

---

## Bot status (separate repo, brief)

Python + discord.py, Supabase backend (`db.py` key-value), Gemma via the Gemini API, on Railway. Recent shipped work: a singleton lock, an adherence service (9PM daily check-in via number-emoji reactions, Sunday 6PM recap), and the schedule proposal service that reads daily reflections.

One important fix on record: a fatal segfault was traced to httplib2 (Google Calendar) not being thread-safe. The calendar service now caches credentials with a lock-guarded refresh but builds a fresh service per call (fresh socket), forcing `static_discovery=True` with a try/except fallback. Verified resolved.
