# Implementation prompt: Finance redesign → real code

Paste below the line into **Claude Code, opened in the `dmico-hub` folder**. Attach the
approved Finance mockups (desktop Overview, mobile Overview, the Expenses component sheet,
the empty-states sheet, and the propagates/self-critique sheet).

---

Read `CLAUDE.md`, then `docs/design/DESIGN-BRIEF-hub-redesign.md`, then
`docs/design/PROMPT-finance-redesign.md` before writing anything.

We have an approved design for **Finance** (mockups attached). Implement it against the
real `finance.js`. **Finance only.** Home is already done and must not be touched.

Finance is the module that settles the **working-screen language** for the whole hub, so
whatever you build here becomes the pattern the other five modules inherit later. Build it
with that reuse in mind: prefer shared class names over one-off `fin-` classes wherever the
pattern is genuinely general.

## Three corrections to the design. These are not optional.

The mockups get three things wrong about how the app actually works. Fix them while
implementing, do not implement them as drawn.

**1. Needs and Wants are NOT derived from "everything that is not a subscription."**
The mockup's own self-critique flagged this. The real derivation already exists in
`renderOverview()` around line 336: `cachedSettings.category_buckets` maps each category to
`"need"` or `"want"`, and anything unmapped accumulates into `split.unsorted`. Keep that
logic exactly as it is.

The mockup also **dropped two existing features** that must survive:
- The `Tag categories` button in the budget-rule section header (`.fin-tag-cats-btn`,
  which opens the category mapping editor and writes `category_buckets`).
- The unsorted note: "RM X this month is in untagged categories."
Redesign their appearance to match the new language if you like, but they must still be
there and still work. Losing them would silently break the budget rule.

**2. The Extra Income panel is missing from the Overview mockup.**
`drawSurplusPanel()` renders extra income for the month and, critically, includes a
dropdown that deposits that amount straight into a savings pool (kv `finance_savings`).
Extra income is RM0 this month so the mockup had nothing to draw, but the panel and the
pool-deposit link must remain. Style it to the new language.

**3. Populated Goals was never designed, only the empty state.**
`buildGoalCard()` already renders a goal card with a progress bar, and a reached goal shows
a `Log as expense` button (`chargeGoal()`) plus confetti (`window.dmicoCelebrate`). Keep all
of that working. Restyle the card to the new language, and use the mockup's empty state for
when there are no goals. Do not remove the confetti.

## What to build

1. **Overview**: ink hero (`RM390.17` style, unit small beside it, never orange when
   healthy), the single stat well (spent / left / days left) rather than three equal cards,
   the budget-rule bars including the faint subscription-reserve marker already implemented
   via the `subsReserve` argument to `draw503020()`, the category chip row with counts, the
   committed-subscriptions list, and the saved-per-month chart.
2. **Expenses**: the form sits inline above the list, never in a modal. Amount is the only
   large field. Category is a chip row of the real categories ordered by frequency, with
   free text still possible. Date defaults to today. List rows are hairline-separated text,
   not cards: micro-label, content, right-aligned amount and date. Delete is quiet and, on
   desktop, appears on row hover only.
3. **Empty states** for Goals, Savings and Investments using the shared skeleton: hairline
   circle icon, one sentence on what the tab is for, one olive action, one faint
   reassurance. No accent colour, no alarm.
4. **The More disclosure** as a panel, not a menu, where each row states what it holds
   ("Savings, no pools yet") so an empty tab is honest before it is tapped. It already
   exists as `.fin-tab-extra` plus `#fin-more-tabs`; restyle rather than rebuild.
5. **The chart**: five empty outlines plus one filled bar is the correct, honest treatment.
   Keep the caption explaining that it shows its own progress rather than faking history.

## Constraints

- No build step, no framework, no npm. Plain JS in the existing structure.
- **Stillness inside the module.** Finance is a working screen. No entrance animations on
  the list, no animated numbers while reading or logging, no hover flourishes beyond the
  quiet delete affordance. Logging an expense must feel instant.
- Reuse the CSS variables in `styles.css` and the shared mobile pass already appended at
  the end of it (`@media (max-width: 720px)`): 44px touch targets, 16px inputs, stacking
  `.r-row2`, horizontally scrolling `.r-tabs`. Do not fight those rules, extend them.
- Relative paths only. Complete files. I push via GitHub Desktop.
- The financial guardrail stands: this module tracks and informs. No advice, no
  recommendations, no projections presented as guidance. The Investments empty state
  wording ("reports value, never advice") is correct and should stay.

## Process

1. Read `finance.js` properly before changing it. It is large and several things in it
   (the rule presets, the category tagger, the surplus-to-pool link, the goal charge flow)
   are load-bearing.
2. Implement.
3. `node --check finance.js` and a brace-balance check on `styles.css` if you touch it.
4. **Critique your own output**: five things a senior product designer would criticise,
   then fix the top two.
5. Tell me exactly what you verified and what you could not verify without a browser, and
   list which patterns you established here that should propagate to the other five
   modules. Do not claim it works because it compiles.
