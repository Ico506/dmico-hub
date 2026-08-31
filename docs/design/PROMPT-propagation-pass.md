# Implementation prompt: propagation pass (the last of the redesign)

Paste below the line into **Claude Code, opened in the `dmico-hub` folder**. No mockups
needed. This is application of a settled language, not new design.

---

Read `CLAUDE.md`, then `docs/design/DESIGN-BRIEF-hub-redesign.md`, then skim `finance.js`
to see the finished pattern before you touch anything else.

Home and Finance are done and approved. They settled the visual language for the whole
hub. Your job is to apply that same language to the five remaining visible modules so the
hub stops looking like two different apps. **This is restyling, not redesign, and
absolutely not refactoring.**

## The five modules

| File | Module |
|---|---|
| `week.js` | Week |
| `life.js` | Life |
| `command.js` | Control |
| `curators.js` | Curators |
| `exercise.js` | Exercise |

Plus one leftover: the **Subscriptions** and **Review** tabs inside `finance.js` were out
of scope during the Finance pass and still use their old inline styles.

## The vocabulary to apply (already real in `finance.js`, do not reinvent)

- `.r-eyebrow` — the parenthetical uppercase section label, `(THIS MONTH)` style.
- `.r-micro` — the tiny uppercase label sitting above a value.
- `.r-hero-*` — one ink hero number per screen, unit small beside it. **Colour only when
  the state is genuinely wrong**, never decoratively.
- `.r-well` — hairline-divided stat cells. Never a grid of equal-weight cards.
- `.r-row` / `.r-row-list` — hairline-separated list rows: micro-label, content,
  right-aligned number and date, quiet delete revealed on hover (desktop only).
- `.r-empty2` — the empty-state skeleton: hairline circle icon, one sentence saying what
  the thing is for, one olive action, one faint reassurance. No accent colour, no alarm.
- Forms live inline above their list, never in a modal. One large field. Chips for any
  fixed set of options. Date defaults to today.
- Spacing comes from typographic rhythm and a flex gap on the parent column, **not** from
  card borders. `.fin-ov-section` no longer carries card chrome; match that.

## Purge the off-brand colours. This is not optional.

A survey found hardcoded hex values that are not in the palette. Replace every one with
the correct CSS variable from `styles.css` `:root`:

| File | Offenders |
|---|---|
| `week.js` | `#9b6dd6` (a purple, which the anti-slop list forbids outright), `#5b8def` blue, `#3aa675` green, `#8a8f98` grey, `#d98a2b` orange |
| `life.js` | `#5b8def` blue |
| `command.js` | `#5b8def` blue, `#3aa675` green |
| `finance.js` | `#5b8def` and `#3aa675` inside the Subscriptions and Review inline styles |
| `curators.js` | no hex, but its injected styles use generic `rgba(127,127,127,...)` greys instead of `--line` and `--ink-soft` |

`interactions.js` is already correct and uses real tokens. Leave it alone.

Also fold each module's inline `<style>` block into the same approach Finance now uses,
or at minimum make it reference variables rather than literals. Do not introduce new
one-off classes where a shared one above already fits.

## Preserve behaviour. This is where the risk is.

Every one of these modules has load-bearing logic. Read the file properly before editing,
and do not remove or "tidy" any of it:

- `week.js` — the calendar week view and the ripple reschedule preview.
- `life.js` — mood logging, the prompt-driven journal, reflections.
- `command.js` — the Control cockpit: routine anchors editor, planning triggers, bot
  settings, and every `window.dmicoEnqueue` call that queues work for the bot.
- `curators.js` — the three-domain switcher, taste profile editor, latest digest card,
  and the thumbs up/down that writes back to `curator_profiles`.
- `exercise.js` — weight logging with AM/PM.

Any `dmicoKvGet` / `dmicoKvSet` / `dmicoEnqueue` call is a contract with the bot. If you
change one, you break Jade. Restyle around them.

## Constraints

- **Stillness.** These are working screens, not orienting screens. No entrance animations,
  no animated numbers, no hover flourishes beyond the quiet delete. Home is the only
  screen allowed to move.
- No build step, no framework, no npm. Complete files.
- Respect the shared mobile pass already at the end of `styles.css`
  (`@media (max-width: 720px)`): 44px targets, 16px inputs, stacking `.r-row2`,
  horizontally scrolling `.r-tabs`. Extend it, do not fight it.
- Relative paths only. No new hardcoded colours, ever.

## Process, one module at a time

Do not do all five at once. For each module, in this order:
**Curators → Exercise → Life → Control → Week**, finishing with the Finance
Subscriptions/Review cleanup.

Curators and Exercise are smallest, so they prove the pattern cheaply. Week is largest and
messiest, so it goes last when the pattern is settled.

For each one:
1. Read the file.
2. Restyle it.
3. `node --check` it.
4. Confirm by grep that every kv/enqueue call it had before is still there.

Then at the end:
5. Confirm zero off-brand hex values remain across all module files.
6. Critique your own work: five things a senior product designer would criticise about the
   hub's consistency now, and fix the top two.
7. Report what you verified, what you could not verify without a browser, and any place
   where a module genuinely needed a pattern the vocabulary above does not cover.
