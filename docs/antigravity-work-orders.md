# Antigravity Work Orders (Coding Protocol)

## Why this exists

We lose time when:

* changes are “patches” without full-file context,
* fixes introduce regressions elsewhere,
* we don’t verify end-to-end flows before shipping.

This document defines a **professional process** for doing “heavy lifting” with Antigravity/Claude while keeping your repo stable.

---

## The Rule Set (Non-Negotiable)

### Rule 1 — Full-file replacements only

If a file is being changed, Antigravity/Claude must output:

* ✅ the **entire file content** (complete, compilable)
* ✅ the **exact destination path**
* ✅ nothing else inside the file output (no commentary inside the code)

**No partial patches.**
No “just add this block” unless explicitly requested.

---

### Rule 2 — One work order = one deliverable

Every request must specify a single deliverable:

* a page,
* an endpoint,
* a component,
* or a doc.

If multiple files are required, they must be treated as a single “bundle deliverable” and all files must be output fully.

---

### Rule 3 — Always include an end-to-end test plan

Every work order must include:

* 3–6 steps to verify it in the browser and/or console
* expected output examples
* how to confirm data landed in Supabase

No code ships without a test plan.

---

### Rule 4 — Fail closed, log enough

All API routes must:

* require auth and return 401 if missing
* verify ownership (`user_id`)
* return deterministic JSON (`{ data }` or `{ error }`)
* include minimal `console.log()` markers for Phase 2 only

No silent failures.

---

### Rule 5 — Idempotency is mandatory

Where duplication is possible:

* define the idempotency key
* enforce it in code before inserts

Example:

* `signals.approved_from_candidate_id` prevents double-promotion
* segment extraction must not insert duplicate candidates

---

### Rule 6 — Close in ≤ 2 iterations

To close in 2 iterations:

1. iteration 1 ships a complete working implementation + tests
2. iteration 2 is only for edge cases or UI polish

If iteration 1 is not testable end-to-end, it’s not “done”.

---

## Work Order Template (Copy/Paste)

Use this format every time:

### Work Order Title

`[Phase X] <Feature> — <Outcome>`

### Objective

What is the single outcome we want?

### Context (Paste in full)

* Relevant schema tables/columns
* Related routes and their contract
* Current file(s) involved (paste full files or link to repo paths)

### Constraints

* “Full-file replacements only”
* “No external AI call yet” (if applicable)
* “Must work on Netlify build” etc.

### Required Files

List **every file** that must be produced/updated with exact paths.

### API Contracts (if relevant)

* endpoint
* method
* request body/query
* response format
* status codes

### UI Flow (if relevant)

* page entry (URL)
* user actions
* expected UI states

### Acceptance Criteria

Bullet list of what must be true to declare done.

### Test Plan (Mandatory)

Provide explicit steps and expected outputs:

* console fetch commands
* expected JSON
* Supabase checks
* UI visible results

---

## “Full Context Pack” (What you paste when assigning Antigravity)

When you ask Antigravity/Claude to implement something, paste:

1. **Schema excerpt** (only the tables/columns touched)
2. **Existing routes** (full code) that interact with those tables
3. **Current page/component** (full file)
4. **Exact error logs** (build error, runtime error, network response)
5. **Goal + acceptance criteria**

This makes the model reliable and prevents “translation loss”.

---

## Standard Output Format (How Antigravity must respond)

When code is requested, the response must be:

1. **Short summary** (3–6 bullets): what changed and why
2. **Files** (full content) in this format:

**File: `<path>`**

```ts
<entire file here>
```

3. **Test plan** (copy/paste commands + expected results)

4. **Rollback instructions** (optional but helpful):

* “revert commit X”
* or “restore file from before”

---

## Debugging Protocol (To stop the back-and-forth)

When something fails, we do this in order:

### Step A — Confirm route exists + returns JSON

* hit `/api/ping`
* hit the route directly
* confirm status code and response body

### Step B — Confirm auth context

* hit `/api/debug-auth`
* confirm `user_id`

### Step C — Confirm data exists

Run **direct SQL** in Supabase:

* confirm correct column names (`source_conversation_id`, not `conversation_id`)
* confirm row counts by `user_id`

### Step D — Confirm UI is calling the right thing

* open Network tab
* confirm request URL/query params match what the server expects

### Step E — Confirm deterministic ordering / filtering

* verify review_status filtering
* verify user_id scoping

No guessing. Each step produces hard evidence.

---

## “No Surprises” Guardrails for Next.js + Supabase (Phase 2)

### API route must:

* always return `NextResponse.json(...)`
* never return `undefined`
* catch errors and return `{ error }`

### UI fetch must:

* handle non-200 responses
* display response error
* never assume data exists

### Supabase queries must:

* include `.eq('user_id', user.id)` for any user-owned table
* include `source_conversation_id` instead of `conversation_id` where appropriate

---

## Two Modes of Collaboration (Recommended)

### Mode 1 — Antigravity does implementation, you execute

Best when ChatGPT UI lags.

* You paste the Work Order + Context Pack into Antigravity
* Antigravity outputs full files + test plan
* You apply, run tests, report results back here (or to Antigravity)

### Mode 2 — Claude handles refactors, ChatGPT handles debugging

Best when you want:

* large code generation + refactors done by Claude/Antigravity
* tight debugging loop done here to close quickly

---

## Definition of Done (Phase 2)

A task is “done” only if:

* Netlify build passes
* endpoints return correct JSON
* UI displays expected states
* Supabase rows match expected outcomes
* idempotency confirmed (no duplicates after rerun)

---

## Example “Perfect Work Order” (Phase 2)

**Title:** `[Phase 2] Segment Extraction — Deterministic candidates created`

**Objective:**
Calling `/api/reflection/segments/:id/extract` creates 8–15 candidates and they appear in `/reflect?conversation_id=...`

**Acceptance Criteria:**

* ai_runs row created
* conversation_segments status becomes completed
* signal_candidates rows inserted with `segment_id`, `ai_run_id`, `source_conversation_id`
* reflect page shows the candidates
* rerun does not duplicate candidates

**Test Plan:**

1. call extract (console fetch)
2. query candidates endpoint
3. open reflect page
4. accept one candidate, verify signals row exists
5. accept again and see already_existed true
