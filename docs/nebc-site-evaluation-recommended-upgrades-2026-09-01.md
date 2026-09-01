# NEBC Site Evaluation — Recommended Upgrades

**Date:** 2026-09-01
**Repo:** github.com/Aproposchpt2/NATIONAL-ENTERPRISE-BUSINESS-CENTER
**Site:** https://nebc.aproposgroupllc.com
**Scope:** Requested open-ended pass — "go through the site and evaluate it, document recommended upgrades" — following same-session fixes to the build pipeline and member OTP sign-in flow.

## Fixed this session (context, not new findings)

- Build pipeline: 12+ consecutive failed deploys, root-caused to two validator mismatches (`index.html` `parentOrganization` JSON-LD, `_recommend.js` federal-portal URL) — fixed, pushed (`c18db21`), deploys green again.
- Member OTP sign-in: two stacked root causes — stale `SUPABASE_URL` (fixed in Netlify production env) and a dead `RESEND_API_KEY` (0 total uses; you rolled it) — confirmed working end-to-end with a real test email received.
- Funding-match quality: initially looked like a bug (only 1/25 NV results were NV-based for a Nevada test profile). Checked against `docs/nebc-funding-center-validation-acceptance-protocol-2026-08-21.md` — this is **documented, tested, and already accepted behavior**: out-of-state sources are deliberately surfaced as relevance candidates (not eligibility findings), and the UI discloses this ("What still needs confirmation: verify the out-of-state source serves NV"). Not re-litigated as a defect. The catalog-depth gap behind it is listed below as a real, separate opportunity.

## Findings, ranked

### 1. HIGH — Two production endpoints are unauthenticated by explicit accepted-risk, not oversight — but the risk itself is real and worth re-weighing

Both are marked in-code as a known, deliberate gap ("Accepted as-is for now per directive; auth is a separate security directive"), so this isn't a "found a bug" item — it's a "the accepted risk is bigger than a one-line comment suggests" item:

- **`netlify/functions/member-upload.js`** — `sign` / `list` / `delete` actions take a raw `path`/`prefix` with no session check. Anyone who can guess or enumerate a member's email-based folder path can **list, read (via signed/public URLs), or permanently delete** another member's private documents (business plans, financials, contracts) in the `member-documents` bucket. Delete is irreversible.
- **`netlify/functions/website-generate.js`** — unauthenticated endpoint that calls a paid Claude model (`claude-sonnet-4-6`) per request. Anyone who finds the URL can run the org's LLM bill up with no rate limit.
- Confirmed: **no rate limiting exists on any public NEBC function** (checked all of `netlify/functions/*.js`) — this compounds both items above (scriptable enumeration/abuse, not just a single manual request).

Recommendation: keep this as a conscious call, but it's worth re-deciding now that a real path to member session tokens already exists (the OTP flow just got fixed and verified) — gating these two behind that session would be a small, high-leverage change. At minimum, add basic rate limiting to both before any marketing push increases traffic to the site.

### 2. MEDIUM — Funding catalog has real state-coverage gaps behind the (correctly-disclosed) out-of-state matching

Verified directly against the embedded catalog: **0 of 152 microloan records are NV-based** (549 records total). For any Nevada business requesting a microloan, the engine is structurally unable to return an in-state match — it's not a scoring bug, there's simply no NV row to score. The UI handles this honestly today, but the fix is data, not code: broaden the catalog's per-state density for the more commonly requested capital types.

### 3. MEDIUM — In-flight catalog remediation branch is currently red

Open draft PR **#42, "Funding: authoritative SBA source URLs for all 549 catalog records"** (`agent/funding-authoritative-urls`, opened today 2026-09-01) appears to be automated work-in-progress addressing empty `source_url` fields in the funding catalog — the same gap surfaced independently by my live test data. Its last 4 CI pushes on `Validate NEBC funding center` all show `failure` (most recent at 13:57:42Z). Worth a look before it's forgotten — either finish it or close it; a stalled red branch with the same intent as a real gap is easy to lose track of.

### 4. LOW — PR/branch hygiene

15 open PRs on the repo, 13 of them `DRAFT` and dated from automated validation runs on or before 2026-08-25 (e.g. `validation/morgan-funding-*`, `validation/morgan-session-restoration-*`) that all appear to be one-off evidence-capture branches from already-accepted work — safe to close in bulk. Separately, **PR #1, "SEO Phase 1 — Free Membership Positioning & Business Acquisition"**, has been sitting `OPEN` (not draft) since 2026-07-31 — over a month — and may be worth a decision (merge, revive, or close) rather than left ambiguous.

### 5. Still worth a live spot-check

`day12-trial-email` and the two Stripe webhooks were checked live — see the **Spot-check results** section below; none of the three turned out to be "silently fixed by the SUPABASE_URL correction" the way OTP was. The `SUPABASE_URL` fix is still a shared env var read by the remaining functions not yet individually verified: `generate-plan`, `submit-marketing-lead`, `submit-marketing-onboarding`, `member-upload`, `autopilot-enroll`, `autopilot-list`, `website-generate`. Lower urgency than the two items above, but same logic — none of them have a user-facing error surface, so nothing would tell you if one were still failing.

## Spot-check results (live, 2026-09-01)

Requested follow-up: check `day12-trial-email` and the Stripe webhooks live rather than just flagging them as "worth checking."

### `day12-trial-email` — confirmed broken, unrelated to the SUPABASE_URL fix

This is a **new, real finding**, not a confirmation of the earlier one. In the Netlify Functions dashboard:
- `autopilot-run` (also cron-scheduled, `export const config = { schedule: ... }`) correctly shows a **"Scheduled"** badge and "Next execution today at 12:00 PM."
- `day12-trial-email` — same `config.schedule` pattern, same file — shows **no "Scheduled" badge and no next-execution time at all.** It reads as a plain on-demand function to Netlify, not a cron job.
- Its function log is **empty over the full 7-day retention window** (checked both "Real-time" and "Last 7 days" views) — "No results found for query." A daily 9am-Pacific job that had been firing would show at least one entry per day.

Net: this trial-expiry nudge (the one that asks lapsing trial members to continue at $39/month) has very likely **never actually run**, since before today's redeploys. I did not invoke it manually to double-confirm, deliberately — doing so would email every real member currently inside the day-12 window, which needs your go-ahead, not mine. Worth comparing the working `autopilot-run` function's export style against `day12-trial-email.js` line-by-line for whatever Netlify requires to register a schedule — that's the likely fix.

### Stripe webhooks — bigger finding: NEBC's real webhook target isn't in this repo at all

Checked Stripe's Workbench → Webhooks (Apropos Group LLC account) for both handlers:

- **`stripe-webhook.js`**'s real registered destination is **`BUSINESS CENTER SUBSCRIPTION STRIPE WEBHOOK`** → `https://aibizcenter.aproposgroupllc.com/.netlify/functions/stripe-webhook` — **not** `nebc.aproposgroupllc.com`.
- **`marketing-stripe-webhook.js`**'s counterpart, **`BIZ_CENTER_MARKETING_WEBHOOK`**, same story → `https://aibizcenter.aproposgroupllc.com/.netlify/functions/marketing-stripe-webhook`.
- You separately confirmed mid-check: the live NEBC payment link (`price_1U0lxqBMRgYNYb8Di4ZPgkKq`) redirects to `ai4-product-purchasing.ai4businesses.org/subscription-success/?product=nebc` after payment, with its webhook pointed at `aibizcenter.aproposgroupllc.com/.netlify/functions/stripe-webhook` — confirming this is the intended live wiring, not a stale leftover.
- Searched every webhook destination on the account: **none** target `nebc.aproposgroupllc.com`.
- Both `aibizcenter` destinations show **zero event deliveries, all-time** (not just this week) — Stripe has never once attempted to call either endpoint.

What this means: **the `stripe-webhook.js` / `marketing-stripe-webhook.js` files living in this repo (NATIONAL-ENTERPRISE-BUSINESS-CENTER) are not the code Stripe actually calls for NEBC.** The real handler is a same-named file on a *different* Netlify site (`aibizcenter.aproposgroupllc.com`, the original Business Center/APROPOS-BIZPLAN project), which this session never touched — meaning today's `SUPABASE_URL` fix in `nat-enterprise-business-center` had **no effect** on the function that actually processes NEBC's real Stripe events. I did not check that other site's env vars or code in this pass — flagging it here rather than assuming, since it's a different project than what I was scoped to.

Separately, since no event has ever been delivered to either destination, there's no history to confirm whether that real handler is even healthy — it's simply never been exercised by a live transaction yet.

**Recommendation:** decide whether `aibizcenter.aproposgroupllc.com` is the permanent, intended home for NEBC's Stripe logic (in which case the copies in this repo are dead code worth deleting to stop the two from silently drifting apart) or whether NEBC is supposed to have migrated to its own webhook and that migration just never happened (in which case a Stripe destination pointing at `nebc.aproposgroupllc.com` needs to be created). Either way, worth checking `aibizcenter.aproposgroupllc.com`'s own `SUPABASE_URL` config directly before the first real NEBC subscriber goes through checkout.

## Suggested priority order

1. Fix `day12-trial-email`'s scheduling registration (confirmed not running — see spot-check above) and decide the `aibizcenter.aproposgroupllc.com` vs. this-repo question for the two Stripe webhooks before the first real NEBC subscriber pays.
2. Revisit the member-upload / website-generate auth decision now that member sessions work end-to-end, and/or add basic rate limiting to both regardless of the auth decision.
3. Check in on PR #42 (funding source-URL remediation) — finish or close.
4. Bulk-close the 13 stale draft validation PRs; decide on PR #1.
5. Add NV (and other under-covered states') microloan/funding-source records to the catalog as a content task, not a code task.
