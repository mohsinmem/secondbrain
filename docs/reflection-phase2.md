# Reflection Phase 2 Spec (Single Source of Truth)

## Purpose

Phase 2 creates a deterministic, reviewable pipeline that:

1. extracts **signal candidates** from a conversation segment
2. lets the user **review** candidates (accept/reject/defer/edit)
3. promotes accepted candidates into **signals**
4. supports safe re-runs without duplication

No external AI call is required in Phase 2 (heuristic/deterministic is acceptable). Claude integration comes later.

---

## Entities and Required DB Columns

### `raw_conversations`

Used to scope candidate lists to a conversation.

**Required columns (must exist):**

* `id` (uuid, PK)
* `user_id` (uuid, FK -> auth.users)
* `raw_text` (text)
* `status` (conversation_status enum) *(optional for Phase 2 logic)*
* `date_range_start`, `date_range_end` *(optional)*
* `message_count` *(optional)*

---

### `conversation_segments`

A conversation is segmented into chunks that can be processed independently.

**Required columns:**

* `id` (uuid, PK)
* `conversation_id` (uuid, FK -> raw_conversations.id)
* `user_id` (uuid)
* `segment_number` (int)
* `segment_text` (text)
* `extraction_status` (segment_extraction_status enum)
* `created_at` (timestamptz)

**`extraction_status` expected values (minimum set):**

* `pending`
* `processing`
* `completed`
* `no_signals_found`
* `failed`

---

### `ai_runs`

Audit trail for each extraction attempt.

**Required columns:**

* `id` (uuid, PK)
* `user_id` (uuid)
* `conversation_id` (uuid)
* `segment_id` (uuid, nullable)
* `model` (text)
* `status` (enum: success|partial|failed)
* `error_type` (nullable)
* `error_details` (nullable text)
* `raw_output` (jsonb)
* `candidates_generated` (int)
* `execution_time_ms` (int, nullable)
* `executed_at` (timestamptz)

---

### `signal_candidates`

Review queue produced by extraction.

**Required columns:**

* `id` (uuid, PK)
* `user_id` (uuid) ✅ must be set on insert
* `signal_type` (enum)
* `label` (text)
* `description` (text, nullable)
* `confidence` (numeric nullable; optional in v0)
* `source_conversation_id` (uuid nullable) ✅ this is the conversation link
* `source_excerpt` (text; required for usefulness)
* `segment_id` (uuid nullable) ✅ must be set in Phase 2
* `ai_run_id` (uuid nullable) ✅ must be set in Phase 2
* `confidence_level` (enum nullable)
* `risk_of_misinterpretation` (enum nullable)
* `excerpt_location` (text nullable)
* `constraint_type` (enum default 'none')
* `trust_evidence` (text nullable)
* `action_suggested` (boolean default false)
* `related_themes` (array nullable)
* `temporal_context` (text nullable)
* `suggested_links` (jsonb nullable)
* `review_status` (enum default 'pending')
* `reviewed_at` (timestamptz nullable)
* `reviewed_by` (uuid nullable)
* `review_notes` (text nullable)
* `deferred_until` (date nullable)
* `is_reviewed` (boolean default false)
* `is_accepted` (boolean nullable)
* `created_at` (timestamptz)
* `updated_at` (timestamptz)

**`review_status` expected values:**

* `pending`
* `accepted`
* `rejected`
* `deferred`

---

### `signals`

Accepted, durable items produced by promoting candidates.

**Required columns:**

* `id` (uuid, PK)
* `user_id` (uuid)
* `signal_type` (enum)
* `label` (text)
* `description` (text nullable)
* `confidence` (numeric nullable)
* `user_notes` (text nullable)
* `constraint_type` (enum default 'none')
* `trust_evidence` (text nullable)
* `risk_of_misinterpretation` (enum nullable)
* `interpretation_confidence` (int 1–5 nullable) *(optional for Phase 2)*
* `action_required` (boolean default false)
* `status` (enum default 'open')
* `extracted_at` (timestamptz)
* `extraction_method` (text)
* provenance:

  * `source_conversation_id` (uuid nullable)
  * `source_segment_id` (uuid nullable)
  * `source_excerpt` (text nullable)
  * `approved_from_candidate_id` (uuid nullable)

---

## Endpoints

### 1) Extract candidates from a segment

**POST** `/api/reflection/segments/[id]/extract`

**Request body (Phase 2):**

```json
{ "model": "heuristic-v0" }
```

`model` is informational/audit-only in Phase 2.

**Behavior:**

* Auth required
* Must verify segment belongs to user
* Must:

  1. mark segment `processing`
  2. generate candidates deterministically
  3. insert an `ai_runs` audit record
  4. insert rows into `signal_candidates`
  5. update segment status to `completed` or `no_signals_found`
  6. return `{ ai_run, candidates_generated }`

**Response 200 example:**

```json
{ "data": { "ai_run": {...}, "candidates_generated": 12 } }
```

---

### 2) List candidates for a conversation

**GET** `/api/reflection/candidates?conversation_id=...&review_status=pending`

**Behavior:**

* Auth required
* Verify conversation belongs to user
* Return deterministic ordering (created_at ASC)
* Filter by:

  * `source_conversation_id = conversation_id`
  * `review_status = provided review_status`
  * `user_id = user.id`

**Response:**

```json
{ "data": [ ...candidates ] }
```

---

### 3) Review a candidate (accept/reject/defer/edit)

**POST** `/api/reflection/candidates/[id]/review`

**Body**

```json
{
  "action": "accept|reject|defer|edit",
  "review_notes": "optional",
  "user_notes": "optional (used only on accept)",
  "elevated": true,
  "reflection_data": { "elevated": true },
  "deferred_until": "YYYY-MM-DD (required for defer)",
  "updates": { "label": "...", "description": "..." }
}
```

**Actions:**

* `reject`: candidate.review_status -> rejected; is_reviewed=true; is_accepted=false
* `defer`: candidate.review_status -> deferred; deferred_until required; is_reviewed=false; is_accepted=null
* `edit`: updates safe fields only; review_status unchanged
* `accept`: promote candidate -> signals and then mark candidate accepted

**Response (accept):**

```json
{ "data": { "status": "accepted", "signal_id": "uuid", "already_existed": false } }
```

---

### 4) List signals created from a conversation

**GET** `/api/reflection/signals?source_conversation_id=...&action_required=true|false`

**Behavior:**

* Auth required
* Return signals for that conversation and user
* Optionally filter by action_required
* Deterministic order by created_at ASC

---

## Expected UI Flow

### A) Inbox → Reflection Review

1. User selects a conversation to reflect on.
2. UI navigates to: `/reflect?conversation_id=<uuid>`

### B) Candidate review screen

1. UI calls:

   * `GET /api/reflection/candidates?conversation_id=...&review_status=pending`
2. UI displays candidates one at a time:

   * label, description, excerpt
   * metadata (risk, constraint, trust evidence)
3. User actions:

   * Reject → POST review action reject → advance
   * Accept → POST accept → advance
   * Elevate → POST accept with elevated flags → advance
   * Defer → POST defer with +7 days default → advance
   * Edit → POST edit updates → update local state
   * Notes → attach `user_notes` during accept/elevate

### C) Completion

When no candidates remain, UI shows “All done”.

---

## Idempotency Rules (Non-negotiable)

### 1) Segment extraction idempotency

A segment extraction must not create duplicate candidates on rerun.

**Policy:**

* If rerun is allowed (failed or no_signals_found), it must:

  * delete existing candidates for that `segment_id` *before* inserting new ones
    OR
  * use a deterministic unique key and upsert (harder)

**Recommended for v0:** delete-by-segment-id then insert.

### 2) Candidate accept idempotency

Accepting a candidate must not create duplicate signals.

**Policy:**

* `signals.approved_from_candidate_id` is the idempotency key.
* On accept:

  * Check if a signal already exists for `approved_from_candidate_id`
  * If yes: return it (`already_existed=true`) and do not insert a new one

---

## Status Transitions

### `conversation_segments.extraction_status`

* `pending` → `processing` (when extraction starts)
* `processing` → `completed` (if candidates inserted)
* `processing` → `no_signals_found` (if none found)
* `processing` → `failed` (on any error)

**Allowed re-run states:**

* `failed`, `no_signals_found` can be re-run
* `completed`, `processing` should be blocked (409)

---

### `signal_candidates.review_status`

* `pending` → `accepted` (on accept)
* `pending` → `rejected` (on reject)
* `pending` → `deferred` (on defer)
* `deferred` → `accepted` (accept later)
* `deferred` → `rejected` (reject later)

Edits do not change status.

---

## Minimal Deterministic Extraction Contract (Phase 2)

Extractor must output candidates that satisfy:

**Required per candidate:**

* `signal_type`
* `label`
* `description`
* `confidence_level`
* `excerpt` (maps to DB `source_excerpt`)
* `risk_of_misinterpretation`

**Accepted enums:**

* signal_type: `pattern | opportunity | warning | insight | promise`
* confidence_level: `explicit | inferred`
* risk_of_misinterpretation: `low | medium | high`