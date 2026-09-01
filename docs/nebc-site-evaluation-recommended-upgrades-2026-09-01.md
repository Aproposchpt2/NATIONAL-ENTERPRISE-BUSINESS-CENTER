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

### 5. Worth a live spot-check (not verified in this pass)

The `SUPABASE_URL` fix that repaired member OTP sign-in is a shared env var read by **14 other functions**: `day12-trial-email`, `stripe-webhook`, `marketing-stripe-webhook`, `generate-plan`, `submit-marketing-lead`, `submit-marketing-onboarding`, `member-upload`, `autopilot-enroll`, `autopilot-list`, `website-generate`. All of these were very likely silently broken by the same stale value and are now very likely silently fixed by the same correction — but none of them have a user-facing error surface the way OTP sign-in did, so nothing would have told you if they'd been failing. `stripe-webhook` and `marketing-stripe-webhook` (payment-critical) and `day12-trial-email` (lifecycle email, easy to miss if silently dead) are the highest-value ones to actually exercise once, live.

## Suggested priority order

1. Spot-check `stripe-webhook` / `marketing-stripe-webhook` / `day12-trial-email` live (revenue + lifecycle-critical, silently dependent on the same env var just fixed).
2. Revisit the member-upload / website-generate auth decision now that member sessions work end-to-end, and/or add basic rate limiting to both regardless of the auth decision.
3. Check in on PR #42 (funding source-URL remediation) — finish or close.
4. Bulk-close the 13 stale draft validation PRs; decide on PR #1.
5. Add NV (and other under-covered states') microloan/funding-source records to the catalog as a content task, not a code task.
