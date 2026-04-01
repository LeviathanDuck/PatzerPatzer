# Sprint Audit Process

Use this file when auditing sprint implementation and progress.

## Required Comparison Inputs

Every sprint audit must compare:
- the sprint markdown doc
- the sprint registry entry
- linked prompts in `docs/prompts/prompt-registry.json`
- linked prompt review outcomes
- actual implementation evidence in the codebase
- linked audits
- unresolved issues and follow-up prompts

## Required Audit Outputs

Every sprint audit must produce:
- sprint status by phase/task
- prompt coverage gaps
- implementation vs plan gaps
- reviewed-but-broken findings
- unreviewed execution risk
- exact next-best-step recommendations
- dashboard-ready recommendation items

## Hard Rule

Sprint audits must update the sprint registry, not only a prose audit doc.

Prose audit docs remain valuable, but the sprint registry must receive:
- updated sprint/task statuses
- linked audit references
- recommended next steps
- completion summary updates when appropriate

## Bootstrap Audit

Use `/Users/leftcoast/Development/PatzerPatzer/docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md`
as the initial backfill baseline for current sprints.

After backfill, it remains a time-stamped audit artifact, not the live status store.
