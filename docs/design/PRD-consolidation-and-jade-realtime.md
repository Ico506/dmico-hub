# PRD: The Great Consolidation (hub redesign + Jade as a real-time life agent)

Status: DRAFT, awaiting Damico sign-off
Owner: Damico (DMICO)
Repos: `dmico-hub` (hub), `jadefrog-scheduler` (Jade)
Supabase: `vlczjdqqpajkggzjlsqe`
Last updated: 2026-08-25

## The shift
Every previous PRD added capability. This one removes it. The hub stops being a
museum of features and becomes a control room for the handful of things Damico
actually runs his life on. Jade stops being a scheduler that posts on a timer and
becomes a life agent that speaks when something matters.

## Evidence (pulled live from Supabase, 2026-08-25, not from memory)

**Alive (touched within 3 days):** finance expenses (70 rows, the most-used thing in
the system), mood, reflections, gratitude, week calendar, routine + schedule
adherence, weekly planner proposal, curator digests (updated yesterday;
`curator_seen` has grown to 147KB), subscriptions, weight logs (26).

**Barely alive:** research papers (12), hygiene (10 routines / 9 products / 5 items),
thesis (1 chapter), gamedev (2 projects, 2 ideas), journal (kv 24 days stale).

**Built but cold (38 to 55 days):** savings pools (still literally empty), groceries +
cook, entertainment library, finance review config, `hub_actions` (empty for 54 days,
so hub-triggered bot actions are effectively unused), push subscriptions (46 days).

**Never used, not once (no kv key ever written / zero rows):** wins, vents, learn
entries, notebook, devlog, media tracker, checklist, workout tracking, MPhil tracker,
focus log, birthdays, countdowns, crypto holdings, study exams, finance goals,
gamedev logs + milestones, investments.

Two consequences worth stating plainly. The Markets curator's portfolio snapshot has
never had a holding to report, because `crypto_data` was never written. And the goal
confetti plus the "log as expense" button we built have never fired on a real goal,
because `finance_goals` has zero rows.

## Decisions (Damico, 2026-08-25)
1. **Hide, do not delete.** Nothing is removed from the repos in this pass.
2. **Archive section in the rail.** A collapsed "Archive" group at the bottom of the
   lantern rail. Hidden by default, one click to reveal, instantly reversible.
3. **Research separates from life.** Hidden into Archive now; a genuinely separate
   research site is planned later (its own PRD, its own repo).
4. **Jade runs event-worthy only.** Roughly 2 to 5 meaningful messages a day. No
   narration feed. This is also the cheap option on Railway cycles and Gemini quota,
   since alerts are templated rather than LLM-generated.

---

## Part A — Hub: what stays, what archives

### Stays visible (the control room)
| Module | Why |
|---|---|
| Home (dashboard) | The entry surface; becomes the live "state of my life" view |
| Week | Calendar is written daily |
| Control | The cockpit concept he wants; gets reworked, not removed |
| Life | Mood + reflections are among the most-used things in the system |
| Finance | 70 expenses; the single most-used module |
| Curators | Digest refreshed yesterday (Content + Markets stay; Research scout moves) |
| Exercise | 26 weight logs, steady use |
| Hygiene | Set up and populated; low-noise, keep for now |

### Moves to Archive
| Module | Evidence |
|---|---|
| Research | 12 papers, and it belongs to the research split |
| Thesis | 1 chapter, research split |
| Self-study | 0 exams ever, research split |
| Entertainment | Library cold 54 days |
| Groceries | Cold 38 to 51 days, cook button unused |
| Game Dev | 2 projects, 0 logs, 0 milestones |

### Within-module cleanup (hidden, not deleted)
- **Finance:** Savings tab and Investments tab collapse behind an "More" disclosure
  (both empty). Goals stays (it is aspirational and cheap).
- **Curators:** the Research domain moves out of the switcher into Archive alongside
  the research modules; Content and Markets remain.
- **Markets curator:** portfolio snapshot is suppressed entirely when there are no
  holdings, so it stops rendering an empty shell. News half continues.

### The Archive mechanism
`app.js` gains an `archived: true` flag on module definitions. `renderRail()` renders
non-archived lanterns normally, then a collapsed `<details>`-style "Archive" group at
the rail's foot containing the rest. State of the disclosure persists in
`localStorage`. No module code is touched, no files deleted, no routes removed, so
un-archiving is a one-word change per module.

---

## Part B — Hub: making it feel alive

The hub currently renders the same whether something needs attention or not. Three
changes, all reading data that already exists:

1. **Home becomes a live state view.** Replace the static cards with a "what's true
   right now" summary: today's remaining calendar blocks, budget left this month,
   whether today's mood and reflection are logged, unseen digests, and anything Jade
   has flagged. Every one of these is already in kv or a live table.
2. **Attention markers on the rail.** A lantern glows when its module has something
   waiting (unseen digest, unlogged reflection after 8pm, budget overrun). Reuses the
   existing `hub_last_seen` mechanism from the nudge work.
3. **The banner becomes the Jade channel.** The existing "what needs you" banner is
   repointed at the same event stream Jade uses, so the hub and Discord always agree
   on what matters.

---

## Part C — Jade as an event-worthy life agent

### The event engine (new: `jade_events.py`)
A single loop (every ~5 minutes) evaluates a rules table against live data and emits
an alert when a rule newly fires. Each rule has a cooldown and a once-per-day cap, and
fired events are recorded in kv `jade_events_fired` so nothing repeats. Alerts are
**templated strings, no LLM call**, which keeps quota and Railway cost near zero. Jade's
voice is applied only to a single daily line, reusing the existing Gemma narration.

### Launch rule set (deliberately small)
- Budget: this month's spending crosses 80% and 100% of the monthly limit.
- Needs bucket: spending exceeds the Needs target while subscriptions are still unpaid.
- Routine: an anchor missed two days running.
- Reflection: not logged by 21:00.
- Mood: not logged by 21:00 (single ping, no nagging).
- Subscription: renews tomorrow.
- Curator: a digest landed that Jade rates as strong.
- Weight: no weigh-in for 7 days.
- Quiet hours: nothing between 23:00 and 07:00; anything that fires is held to morning.

### Delivery
One dedicated channel (`JADE_CHANNEL_ID`), each alert deep-linking into the relevant
hub tab via the existing `#do=tab:<id>` mechanism. The 7pm digest push stays as the
daily catch-all. Same events feed the hub banner.

### Jade cleanup (bot side)
Loops and commands serving never-used features are **disabled behind a flag**, not
deleted: workout, checklist, notebook, learn, wins, vents, media, birthdays,
countdowns, resurfacing, MPhil, crypto, entertainment (game/play/watch/library/
funweek), groceries/cook, deals/assets/itch, gdctalk. This cuts wasted Railway cycles
and Gemini calls. `!help` is rewritten to list only what is live.

---

## Build order
1. ~~Hub Archive mechanism + module triage.~~ **DONE 2026-08-25.** 7 live lanterns,
   collapsed "Archive (7)" drawer, drawer state persisted, nothing deleted.
3. ~~`jade_events.py` engine + launch rules + channel wiring.~~ **DONE 2026-08-25.**
   8 rules, edge-triggered, per-rule cooldowns, MAX_PER_DAY=5, quiet hours 23:00-07:00,
   alerts mirrored to kv `jade_alerts` for the hub banner, `!jadetest` dry run.
   Needs `JADE_CHANNEL_ID` in Railway. Zero LLM cost (templated strings).
   **Rule dropped from the launch set:** the "Needs bucket exceeded" rule. The budget
   rule percentages are chosen client-side in the hub and are not reliably readable
   server-side, so implementing it would have meant guessing his split. Revisit by
   persisting the active rule to kv first.
   **Guard added (not in the original spec):** `anchor_missed` only considers anchors
   ticked at least once in the last 14 days. His `routine_adherence` history is
   currently all-false because he stopped doing check-ins, so an unguarded rule would
   have fired daily and turned into wallpaper within a week.
2. ~~Markets empty-state fix + Finance tab collapse.~~ **DONE 2026-08-25.**
   Markets reframes itself as "Market context" with an honest invitation when nothing
   is held, in both Discord and the hub card, instead of posting an empty portfolio
   shell with a zero total. `has_holdings` is derived from the RAW holdings/watchlist,
   not the priced results, so a CoinGecko outage cannot make it claim he owns nothing.
   Finance tab bar drops from 7 tabs to 5, with Savings and Investments behind a
   "More" disclosure (state remembered, pinned to the end with flex order so the
   draggable-tabs observer cannot shuffle it into the middle).
4. ~~Home live-state view + rail attention markers.~~ **DONE 2026-08-25.**
   New `now.js` holds ONE shared state computation (`dmicoComputeState`) used by the
   Home block, the rail markers, and available to the banner, so the surfaces cannot
   disagree. Inputs: kv `jade_alerts` (Jade's own verdicts lead, and her thresholds are
   not recomputed), mood + reflection for today, live budget from `finance_settings` +
   `finance_expenses`, unseen digests, and the next calendar block from `week_calendar`.
   Three tones only (lit / warm / calm), 60s cache, deduplicated so Jade and the hub
   never say the same thing twice on one screen.
   Home gains a hero state block above everything else; the rail dots go amber (warm)
   or breathe orange (needs you) via `lantern-attn-*` classes, deliberately NOT reusing
   `lit`, which already means "module is built".
   Motion follows the agreed policy: staggered entrance on Home rows and a slow breathe
   on urgent lanterns, both under 300ms and both disabled under `prefers-reduced-motion`.
   Time-of-day nuance: an unlogged mood or reflection is `warm` during the day and only
   becomes `lit` after 21:00, because before evening it is not actually late yet.
5. ~~Jade dead-loop flagging + `!help` rewrite.~~ **DONE 2026-08-25. Consolidation complete.**
   A `FEATURES` dict with a `_feature()` env reader gates scheduled loops. OFF by
   default: `hygiene_nudge` (module archived), `journal_prompt` (kv cold, reflection
   covers it), `phone_check` (never acted on). ON: `wellness` (mood lives in that
   bundle and mood is logged almost daily). Any flag is overridable from Railway with
   `FEATURE_<NAME>=1`, no redeploy, and boot logs which loops are off.

   **Scope call made during the build:** only LOOPS are gated, not commands. An idle
   command costs nothing, while a loop burns cycles and quota on a schedule forever.
   Gating commands would have added risk (a rarely-used command silently breaking)
   for no saving, so the dead commands stay working and are simply no longer
   advertised in `!help`.

   `!help` drops from four pages of mostly-dead features to two pages of what is
   actually alive, and closes by noting the archived commands still work. The old
   four-page dump is preserved verbatim as `_help_archive()`, deliberately unwired,
   matching this PRD's hide-don't-delete principle rather than violating it in its
   own final step.

## Verification
- Isolated-copy compiles and unit tests for the rules engine (each rule's fire and
  cooldown conditions with sample kv), never trusting the stale bash mount.
- `node --check` on hub JS; confirm archived modules still render when un-archived.
- A `!jadetest` command to dry-run the rules engine and print what would have fired
  without sending anything.

## Explicitly out of scope
- Deleting any code, table, or kv key.
- The separate research site (own PRD, later).
- Voice/Jarvis speech. This PRD is the text-agent foundation that a voice layer would
  later sit on top of.

## Open questions — RESOLVED (Damico, 2026-08-25). SIGNED OFF, build proceeding.
1. **Hygiene: archive.** His reasoning: useful for building the habit, but once the
   habit is built it stops earning its place. (This is the correct instinct and it
   generalises: a habit tool's success condition is its own obsolescence.)
2. **Game Dev: archive**, alongside JadeFrog, which becomes its own separate portfolio
   site later so he can control that presentation properly.
3. **Thresholds: unchanged** for now, tune after living with them.

This moves Hygiene out of "stays visible" (now 7 visible modules) and confirms Game Dev
in Archive. Archive count is now 7: Research, Thesis, Self-study, Entertainment,
Groceries, Game Dev, Hygiene.
