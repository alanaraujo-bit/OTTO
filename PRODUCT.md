# OTTO — Product truth

> Assumptions in this file were inferred from the owner's written brief (2026-08-31) and from the
> mid-session correction that promoted the auth screens to phase 1. The owner explicitly instructed
> autonomous operation with no clarifying questions, so Impeccable's interview step was substituted
> with brief-inference and is labeled here.

## What it is
OTTO is a personal finance instrument for Android. Each ledger remains private and individually
owned; a finite debt can be shared, by explicit revocable invitation, with the one person on its
other side. It exists because its owner has repeatedly failed to stay current in generic finance apps.

## Who uses it
One person: Alan (pt-BR). Developer. Owns a Motorola Edge 60 Fusion. Uses the phone one-handed,
frequently, in short bursts — often while paying for something.

## The core promise
**Time-to-record is the product.** Opening OTTO and logging a transaction must feel faster than
remembering not to. Everything else (statistics, forecasting, notifications) exists to remove the
need to open it at all.

## What it must do
1. Home screen that answers "where do I stand" in one glance, no scrolling.
2. Recurring outflows (rent, subscriptions) and recurring inflows (salary).
3. Debts — finite, with a start and an end: creditor, installment value, total count, count already
   paid, next due date. OTTO computes remaining balance, end date, and progress.
4. Accounts and credit cards, with statement close/due dates.
5. Statistics that are actually decision-useful, not decoration.
6. Category spend control and forward projection ("futuramento").
7. A notification system that keeps the owner ahead of every due date.
8. Two-sided finite debts: money the owner owes and money owed to the owner, with a live,
   privacy-minimized web view and an optional linked mirror in the recipient's app.

## Constraints
- Private-by-default. A ledger lives in the owner's authenticated store; only a deliberately shared
  debt exposes a minimal public projection through a long, revocable capability URL.
- Portuguese (pt-BR) throughout. BRL currency.
- Target device is fixed and known: layout may be tuned to it rather than merely tolerant of it.
- Must run in Expo Go SDK 54 for the live-preview loop.

## Explicitly out of scope
Teams, public profiles, social feeds, bank sync/Open Finance (phase 5+ at earliest), a general-purpose
web app, iOS. The public web surface is only the read-only view of one invited debt.

## Failure modes to design against
- Any screen that requires reading more than one number to know if things are fine.
- Any capture flow longer than three taps.
- Notifications that become noise and get muted.
