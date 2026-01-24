# AFERR SecondBrain

## UI Spec Directive v1

**(Intent Mode + Life Spine Orientation)**

**Status:** Active
**Audience:** Engineering, Product, Design, AI Agents
**Last Updated:** 2026-01-xx
**Owner:** Mohsin Memon

---

## 1. Purpose of This Document

This document defines the **non-negotiable UI and UX contract** for AFERR SecondBrain.

Its goal is to ensure that:

* The system remains **functional from Day 1**
* Cognitive value appears **within 30 minutes of use**
* No visual or interaction pattern introduces **implicit ranking, importance, or pressure**
* Development aligns with **metacognition, not dashboards**

If there is a conflict between this document and an implementation decision,
**this document overrides the implementation.**

---

## 2. Core Mental Model (Locked)

### The Life Spine

The primary visual metaphor is a **Life Spine**.

* **Horizontal axis = Time**

  * Scrollable left ⇄ right
  * Past → Present → Future
* **Events = Truth Atoms**

  * Anchored *on* the spine
  * Immutable
* **Meaning = Emergent**

  * Appears *off* the spine later
  * Signals, notes, consequences
* **Consequence = Forward-only**

  * Arrows or threads always point forward in time
* **Vertical distance has NO semantic meaning**

  * It is layout only
  * It does NOT mean importance, intensity, value, or relevance

> Nothing is ranked.
> Nothing is “bigger” because it matters more.
> The **shape** tells the story.

---

## 3. Primary Entry Surface: Intent Mode (Locked)

### Intent Mode is now the **default entry point**.

The system begins by asking:

> **“What’s top of mind for you right now?”**

Examples:

* “Preparing for a trip to Dubai”
* “Reflecting on the last quarter”
* “Getting ready for an important conversation”

### Intent governs orientation — not conclusions.

Intent Mode outputs **3–5 navigable cards**, never more.

---

## 4. Intent Output Cards (v1)

Each card must satisfy **one rule**:

> **Every card must take the user somewhere meaningful when clicked.**

### Card Types (v1)

#### A. Upcoming Anchors → *Forecasting*

* Opens future-facing timeline view
* Helps user explore what’s coming up
* No advice, no judgment

#### B. Past Relevant Periods → *Reflection*

* Always **chronological**
* Opens the Life Spine **zoomed into that period**
* Leads into reflection & signal updating

#### C. Save to Focus

* User explicitly bookmarks a period/event
* Indicates **intentional attention**
* No auto-prioritization

> ❗ “Networks” are **not shown upfront by default**
> They may appear only after user chooses a reflection-first path.

---

## 5. Time & Period Rules (Locked)

* All periods are **chronological**
* Never labeled as:

  * “Most important”
  * “High impact”
  * “Critical”
* Language must remain **descriptive only**

Examples:

* ✅ “Late Nov 2024”
* ❌ “Key period in your life”

---

## 6. Timeline Behavior (Mobile-First)

### Zoom Levels

#### Month (Macro)

* Events are **aggregated**
* Represented as:

  * Dots, stacks, or bundles
* Purpose: reveal **shape of life**, not detail

#### Week (Meso)

* Discrete snap-to-week segments
* No drifting
* Each swipe lands on one clear period

#### Day (Micro – optional later)

* Only when explicitly zoomed
* Never default

---

## 7. Density Handling (Critical)

An average professional has **4–6 calendar items per day**.

Therefore:

* ❌ No “one dot per event” at macro zoom
* ❌ No variable dot sizes implying importance
* ❌ No color intensity gradients

Allowed:

* Neutral aggregation
* Stacked markers
* Counts shown as numbers only (e.g. “5 events”)

---

## 8. Consequence Threads (Meaning Accumulation)

### Rules

* Consequences are **never auto-asserted**
* System may propose **hypotheses**
* User validates or rejects

### Creation Constraints

* Created only from **Event Detail Panel**
* Must include:

  * source_event_id
  * signal_id
  * target_event_id
* Enforced forward-time only

### Visual Rules

* Threads are **latent by default**
* Appear only on hover or focus
* Thin, neutral lines
* No arrowheads, no labels

---

## 9. Interaction Cost Budget

### Daily Usage Expectation: **~30 minutes max**

* 5–10 min setup or check-in
* 10–15 min exploration
* Optional deeper reflection

If value requires more than this → **UX has failed**.

---

## 10. Guardrails (Non-Negotiable)

### Visual Guardrails

* No salience gradients
* No “AI glow”
* No heatmaps
* No urgency cues

### Language Guardrails

Prohibited words anywhere in UI or AI output:

* “priority”
* “important”
* “critical”
* “top”
* “must”

### Cognitive Guardrails

* Orientation ≠ interpretation
* Meaning is always user-validated
* Forgetting is a feature, not a bug

---

## 11. Development Checkpoints (Hard Gates)

Before shipping any UI change, it must pass:

### Gate 1 — Orientation

> Can a user answer “What period am I looking at?” in <2 seconds?

### Gate 2 — Density

> Does this still work with a realistic calendar (4–6 events/day)?

### Gate 3 — No Salience

> Does anything visually imply importance without user choice?

### Gate 4 — Navigation

> Every visible element either:

* clarifies structure, or
* takes the user somewhere meaningful

---

## 12. What This Is Not

* ❌ Not a productivity dashboard
* ❌ Not a task manager
* ❌ Not an AI advice engine

This is an **Operating System for Thinking**.

---

## 13. Final Test (Non-Technical)

Phase is complete when a user can say:

> “I can see how my past quietly shaped my present —
> and what I might want to keep in mind for future choices.”

---

**End of Directive v1**
