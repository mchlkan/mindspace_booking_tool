# Mindspace Booking Platform: Prototype Build Plan

Based on `Mindspace_Booking_Platform_PRD.pdf` (v1, 25 Nov 2026) and `Brand Book - Mindspace 2.0.pdf`.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | First-class on Vercel; server actions keep booking logic server-side; one codebase for public pages and dashboards |
| Styling | **Tailwind CSS** with brand tokens (section 5) | Mobile-first by default; tokens enforce the brand book's "only our colours" rule |
| Database | **Postgres on Neon** (via Vercel Marketplace) + **Drizzle ORM** | See section 2 |
| Email | **Resend** + **React Email** templates | Free tier covers the volume; templates styled to the brand |
| Calendar invites | `ics` npm package, attached to the confirmation email | PRD: confirmation + .ics |
| Auth (organisers only) | **Auth.js magic-link sign-in, sent via Resend** | No passwords to store or leak; "secure organiser login" |
| File storage | **Vercel Blob** | Banner images, trainer photos |
| Scheduled jobs | **Vercel Cron** | Reminders, hold expiry, GDPR deletion |
| Installable app | Web app manifest + icons (PWA) | PRD: "can be installed to the home screen" |
| Hosting | **Vercel** (Hobby to start) | Preview deploy per branch; zero config for Next.js |

## 2. Database recommendation: relational (Postgres)

The data is relational, and correctness matters at exactly one point: **two people must not book the last spot at the same time.** Postgres handles that with a transaction plus a row lock on the session, and enforces uniqueness (one booking per email per session) with constraints. A document store (Firestore, MongoDB) would push that logic into application code.

**Neon** specifically: serverless Postgres with a free tier far larger than <100 members needs, installed in one click from the Vercel Marketplace (env vars get wired up automatically), and branchable databases for preview deploys. **Supabase** is a fine alternative if you'd rather have a hosted dashboard to browse data; we'd still use it only as Postgres, not its auth.

### Data model (first cut)

- **organisers**: id, email, name, photo_url, payment_link, role (`trainer` | `events_manager` | `admin`), status (`pending` | `approved` | `disabled`)
- **members**: email (unique), added_at. The admin-maintained member list
- **series**: id, organiser_id, weekly rule (weekday, time), until_date. Generates sessions
- **sessions**: id, kind (`training` | `event`), organiser_id, series_id?, title, description, location, starts_at, ends_at, spot_limit, mat_limit, price_cents, payment_methods (`cash`, `link`), visibility (`public` | `private`), private_slug (random, unguessable), banner_url, status (`published` | `cancelled`), cancel_cutoff_hours (default 24)
- **bookings**: id, session_id, full_name, email, mat_requested, payment_method, payment_status (`pending` | `participant_confirmed` | `paid` | `expired` | `cancelled`), cancel_token (random), consent_at, created_at, hold_expires_at. Unique (session_id, lower(email)) among active bookings
- **otp_codes**: email, code_hash, expires_at, attempts
- **email_log**: booking_id/session_id, type, resend_id, sent_at. Prevents duplicate reminders

## 3. Business rules → implementation

| PRD rule | Implementation |
|---|---|
| Cash → confirmed immediately | Booking created with `payment_status = pending` + confirmed booking; organiser flips to `paid` at the session |
| Payment link → pending, "I've paid" confirms | Booking page shows trainer's link and an "I've paid" button → `participant_confirmed`; trainer can override |
| Pending holds take a spot, released after 24 h | Capacity query counts active holds (`hold_expires_at > now()`), so expiry works even without a cron; cron marks them `expired` and logs it |
| "Full" at capacity | Same capacity query; booking action re-checks inside the transaction |
| Mats (trainings only) | Separate counter vs `mat_limit`; mat checkbox disabled when mats run out (booking still allowed) |
| Private events: members only + OTP | Booking form asks for email → if on member list, send 6-digit code (hashed, 10 min, 5 attempts) → verified → book. Non-members get a friendly "members only" message |
| Private trainings: link only | Reachable only via `private_slug` URL (21-char random ID), not listed. **Open question** in PRD; recommended default: anyone with the link can book |
| Cancellation until 24 h before | Email link with `cancel_token`; blocked after cutoff with a clear message |
| GDPR: delete 12 months after last booking | Daily cron deletes bookings (name/email) older than 12 months; consent checkbox required on the form |

## 4. Emails (Resend)

Templates (React Email, brand-styled): **booking confirmation** (+ .ics + cancel link + payment link if relevant), **payment reminder** (pending link bookings), **session reminder 24 h before**, **session changed / cancelled** (to all booked), **one-time code**, **organiser magic-link sign-in**, **organiser approved**.

Scheduling: on the Vercel Hobby plan, cron jobs run **at most once per day**. That's fine for GDPR cleanup and payment reminders. For "24 h before" reminders, either:
- run one daily job (e.g. 09:00) that reminds for all sessions starting in the next 24–48 h ("see you tomorrow"), **or**
- use Resend's `scheduledAt` to schedule each reminder at booking time (cancel it if the booking is cancelled). **Recommended**: exact timing, no cron needed.

**Prerequisite:** Resend can only email arbitrary recipients from a **verified domain**. The club needs a domain (or a subdomain of one it controls) with DNS access to add Resend's records. Free tier: 3,000 emails/month, 100/day, plenty for this volume.

## 5. UI from the brand book

**Colour tokens** (sampled from the brand book's colour page; confirm against the Canva source before launch):

| Token | Hex (approx.) | Use |
|---|---|---|
| `navy-700` | `#3B4359` | Primary text, headers, primary buttons |
| `navy-500` | `#53617F` | Logo background, nav bar, accents |
| `slate-400` | `#7586A1` | Secondary accents, tags |
| `yellow-300` | `#FDF3A9` | Highlights, "Free spots" badges, logo on navy |
| `yellow-500` | `#ECDF67` | CTA ("Book now"), but always with navy text for contrast |
| `sand-300` | `#C4BDB3` / `#D8D3C8` | Cards, dividers |
| `cream-50` | `#F7F4F0` / `#FBFBFA` | Page background |
| `ink-900` | `#232833` | Body text |
| grey | `#838B93`, `#C9C7CA` | Muted text, borders, "Full" state |

**Typography**
- **League Spartan** (Google Fonts): UI text and session headlines ("writing font… gen. text & headlines on events")
- **Open Sauce** (open licence, self-host): logo wordmark and brand headings
- **Tan Nimbus**: CTAs only ("BOOK NOW"), *if* the club holds a web licence. It's a commercial font. Fallback: League Spartan bold caps
- Rule from the book: max 2 fonts per screen, max 3 colours per component

**Look & feel**
- Logo: "MIND / SPACE" with hand-drawn ellipse. Export as SVG; use yellow-on-navy in the header, navy-on-cream elsewhere
- Session cards: banner photo with a **transparent brand-colour overlay** behind the title (book p.30)
- Alternate card tints in the list so the same colour isn't adjacent (book's feed rule)
- Icons: fine, single-line, one colour → **Lucide** at `stroke-width: 1.25` fits well
- Lots of white space ("less is more"); friendly, supportive copy ("Create space for yourself this week", not "Submit")
- Event cards show all key details up front: date, price, place, spots left, how to book (book p.34)

## 6. Screens

**Public (no account)**
1. Sessions list: upcoming public trainings & events, filter by type, "x spots left" / "Full"
2. Session detail + booking form: name, email, mat checkbox, payment method, GDPR consent. Target: done in < 1 minute
3. Booking result: confirmed / pending with payment link + "I've paid"
4. Member verification (private events): enter email → enter code
5. Cancel booking (from email link)

**Organisers (magic-link login)**
6. Sign-up request → "waiting for approval"
7. Dashboard: my sessions, bookings per session, mat requests, payment status toggles
8. Create/edit session: one-off or weekly recurring, image upload, public/private (copy private link)
9. Edit/cancel session → triggers notice email to all booked
10. Profile: name, photo, payment link

**Admin**
11. Approve organisers
12. Member list: add, remove, CSV import
13. All sessions & payments overview

## 7. Build phases

| # | Phase | Done when |
|---|---|---|
| 0 | **Setup**: Next.js repo, Tailwind brand tokens, fonts, logo SVG, Vercel project linked to GitHub, Neon via Marketplace, Drizzle schema + migrations, seed data | Empty branded app deployed to a Vercel URL |
| 1 | **Public booking**: list, detail, booking transaction with capacity/mats, result page | Can book a seeded session on mobile in < 1 min; last spot can't be double-booked |
| 2 | **Emails**: Resend domain, confirmation + .ics + cancel flow, scheduled reminder | Real email arrives with working calendar invite and cancel link |
| 3 | **Organiser area**: magic-link login, create/edit sessions (incl. weekly), dashboard, payment status, Blob uploads | Trainer creates a weekly class and marks a booking paid |
| 4 | **Payment-link flow & holds**: pending, "I've paid", 24 h expiry, payment reminder | Unpaid hold frees its spot after 24 h |
| 5 | **Private sessions**: unguessable links, member list + CSV import, OTP verification | Non-member can't book a private event; member can |
| 6 | **Admin**: organiser approval, all-sessions view | Admin approves a new trainer |
| 7 | **Polish**: PWA manifest, change/cancel notices, GDPR cron, rate limiting on OTP & booking, accessibility pass | Installs to home screen; Lighthouse mobile ≥ 90 |

Phases 0–2 make a demoable prototype; 3–7 complete v1.

## 8. Decisions needed

1. **Domain** for sending email (and optionally for the app URL)
2. **Private trainings**: anyone with the link, or members only? (Recommended: anyone with the link)
3. **Tan Nimbus licence**: do we have web rights, or fall back to League Spartan?
4. **Vercel plan**: Hobby is for non-commercial use; fine for a student club, but confirm nothing is sold through the app (the PRD says no money passes through it, which helps)
