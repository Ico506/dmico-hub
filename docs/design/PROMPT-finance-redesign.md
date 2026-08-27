# Kickoff prompt: DMICO Hub — Finance redesign (design pass)

Paste below the line into the same Claude Design chat that produced Home (so it keeps
that context), or a fresh one with the four approved Home mockups attached.

Finance is the second and final screen we design by hand. It carries the **working-screen
language** (forms, list rows, tabs, stat clusters, progress bars, charts) that the
remaining five modules will inherit.

---

Now design the **Finance** screen, inheriting every decision we settled on Home. Home is
done and approved, do not redesign it. Give me desktop and mobile, and treat mobile as
the primary target.

## Inherit these, unchanged

- Parenthetical section labels: `(THIS MONTH)`, `(EXPENSES)`, `(BUDGET RULE)`.
- Micro-label above value (`TIME` / `BLOCK` style) for dense information.
- Numbered `01 / 02` blocks where a sequence or ranking exists.
- State language: neutral is the default and most common, amber means waiting, orange
  means needs attention, and **only orange breathes**.
- One hero number per screen. Everything else is quieter than it.
- Locked tokens: cornsilk paper, deep-brown ink, olive for actions, alloy orange as the
  single signal colour. Never dark. Saturation is a budget.
- Custom line icons, never emoji.

## What Finance actually contains

Tab bar, five visible: **Overview · Expenses · Goals · Subscriptions · Review**, plus a
"More" disclosure holding **Savings** and **Investments**.

## Use my REAL data. Do not invent numbers.

- Monthly spending limit: **RM1,000**
- Spent this month: **RM390.17** (so the normal state is comfortably UNDER budget)
- Monthly allowance: **RM1,080** (this is separate from the limit, and the budget rule is
  calculated on the allowance, not the limit)
- 70 expenses logged, real categories: **Food (24), Entertainment (18), Subscription (11),
  Shopee (5), Errands (4), Groceries (3)**
- Subscriptions: Claude Pro RM100, Railway RM24.90, YouTube Premium RM12.90,
  HBOMax RM12.50, roughly **RM150/month committed**
- Extra income this month: **RM0**
- **Goals: 0. Investments: 0. Savings pools: 0.** These are genuinely empty.
- Wishlist: 3 items

## The two things I most need from this screen

**1. The calm state is the default state.** I am at 39% of my limit. Most of the time
Finance is healthy, so design the healthy state first and make the over-budget state the
variant, not the reverse. Home taught us that designing only the alarming state makes a
screen feel wrong on ordinary days.

**2. Empty states are first-class, not an afterthought.** Goals, Savings and Investments
are all genuinely empty and may stay that way for a while. Design what those tabs look
like with nothing in them. They should invite a first action and explain what the tab is
for, and they must not look broken or shout for attention. This is the same lesson as the
Home quiet state.

## Components to settle here (this is the real point of the exercise)

Whatever you decide becomes the pattern for Week, Life, Control, Curators and Exercise:

1. **A form** (log an expense: amount, category, note, date). Category should feel like
   picking from my real six, not typing blind.
2. **A list row** (one logged expense: amount, category, note, date, delete). Show me 70
   rows worth of rhythm, including what a long note does.
3. **A tab bar** with five tabs plus a More disclosure, on a 390px screen.
4. **A stat cluster** (spent / left / days remaining).
5. **Progress bars** for the 50/30/20 rule, including the faint subscription-reserve
   marker on the Needs bar (about RM150 of committed spending sits inside Needs).
6. **A chart** (six-month savings). Decide how a chart behaves on a narrow screen.
7. **A disclosure** ("More" revealing two extra tabs).

## Mobile constraints, learned from implementing Home

- Bottom bar is fixed, so leave clearance at the base of the scroll.
- Touch targets minimum 44px.
- Inputs at 16px minimum, otherwise mobile browsers zoom on focus.
- Two-column form rows must stack.
- The tab bar scrolls horizontally rather than wrapping.
- Long category names and notes must wrap, never force sideways scroll.

## Anti-slop list, unchanged

No purple or blue gradients. No glassmorphism or blur. No Inter or Poppins. No emoji as
icons. No dark mode. No uniform grid where a critical number and a decorative stat look
identical. No stock illustrations. No lorem ipsum. Motion only where I am orienting, so
inside a working screen like this: **stillness**. No animated numbers while I am reading
or logging.

## Process

1. Design the **Overview** tab first, desktop and mobile, in its normal healthy state.
2. Then **Expenses** (the form plus the list), because that is where the component
   language really gets decided.
3. Then the **empty states** for Goals, Savings and Investments.
4. Critique your own output: five things a senior product designer would criticise,
   focusing on hierarchy, spacing rhythm, and whether the accent is over-spent. Fix the
   top two.
5. Tell me which decisions here are meant to propagate to the other five modules.

Do not design the other modules. Finance only.
