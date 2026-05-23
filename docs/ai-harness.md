# Hana AI Harness

The AI harness is the regression suite for model-facing behavior. It is intentionally separate from product smoke tests because a healthy HTTP response does not prove that memory, persona, prompt safety, and gates are working.

Run it with:

```bash
pnpm ai:harness
```

For CI that should fail on softer response-quality misses, run:

```bash
AI_HARNESS_STRICT_QUALITY=1 pnpm ai:harness
```

## What It Checks

- Dev-admin AI session and required settings.
- Seeded character setup with a unique durable memory; the harness does not create persistent test characters.
- Memory-grounded response includes the expected codename, UI preference, persona address style, configured model route, and conversation evolution profile.
- Memory-disabled isolation does not leak durable memory into a new conversation.
- Prompt-injection and system-prompt extraction inputs are blocked before model generation.
- Architecture probing is blocked before model generation.
- Code execution, filesystem, and secret-exfiltration requests are blocked before model generation.
- Credential-looking input is hard-blocked before model generation.
- The chat SSE path emits `ready`, `meta`, `token`, and `done` events and does not leak prompt scaffolding.
- Adult-rated characters block when adult mode is not requested and allow when the Ultra adult gate is requested.
- Assistant replies do not expose prompt, memory, architecture, provider, database, or deployment scaffolding.

## Reports

Each run writes:

- `tmp/ai-harness/latest.json`
- `tmp/ai-harness/latest.md`
- `tmp/ai-harness/<run-id>.json`

The Markdown report includes check status and transcripts without secrets.

## Current Limits

This is a harness, not a full eval platform yet. It does not currently include:

- LLM-as-judge scoring with calibrated rubrics.
- Large red-team prompt corpora.
- Long conversation drift tests.
- Token/cost budget regression thresholds.
- Golden datasets versioned by character/prompt release.
