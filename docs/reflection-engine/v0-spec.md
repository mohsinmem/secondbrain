### v0 AI Contract (Strict JSON)

```json
{
  "status": "success | partial | failed",
  "candidates": [
    {
      "signal_type": "pattern | opportunity | warning | insight | promise",
      "label": "string (5-100 chars)",
      "description": "string (10-500 chars)",
      "confidence_level": "explicit | inferred",
      "excerpt": "string (required, non-empty)",
      "excerpt_location": "string (optional)",
      "risk_of_misinterpretation": "low | medium | high",
      "constraint_type": "time | resource | skill | knowledge | relationship | external | internal | none",
      "trust_evidence": "consistency | candor | follow_through | warmth | commitment | none",
      "action_suggested": true,
      "suggested_links": {},
      "related_themes": ["string"],
      "temporal_context": "string"
    }
  ],
  "errors": []
}
