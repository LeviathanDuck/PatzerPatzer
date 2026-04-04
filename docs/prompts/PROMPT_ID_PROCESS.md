# Prompt ID Process

Use this file for:
- reserving root prompt ids
- reserving follow-up `-F#` ids
- releasing abandoned reservations
- understanding allocator and collision rules

## Core Rule

Agents must not compute the next prompt id by reading the registry directly.

All prompt ids must be allocated through the reservation commands.

## Output Truncation Rule (CRITICAL)

Never pipe reservation or lifecycle commands through `head`, `tail`, or any output limiter:

```sh
# WRONG
npm run prompt:reserve -- --title "..." | head -5

# CORRECT
npm run prompt:reserve -- --title "..."
```

Why: these commands end by running `prompts:refresh` as a subprocess. Piping through `head`
sends SIGPIPE which kills the node process before `prompts:refresh` completes. The registry
write happens early and succeeds, but the dashboard HTML is never regenerated — leaving the
dashboard showing stale state with no error message.

If the output was truncated and the reserved ID is unknown, run `npm run prompt:reservations`
to find it. Do not re-run the reserve command.

## Root Prompt IDs

Reserve a root id with:

```sh
npm run prompt:reserve -- --title "Short title" --kind feature --created-by Codex
```

Important:
- the allocator `--kind` flag is reservation input, not the full final dashboard taxonomy
- after `prompt:create`, agents must verify the created registry record uses the correct final:
  - `kind`
  - `category`
- do not assume `--kind bugfix` or `--kind feature` automatically means the created prompt will
  display correctly in the dashboard without that verification

Behavior:
- acquires the registry lock
- reserves the next root `CCP-###`
- writes a reservation record immediately
- returns the reserved id

## Follow-Up Fix IDs

Reserve a follow-up id with:

```sh
npm run prompt:reserve-followup -- CCP-123 --parent-prompt-id CCP-123 --created-by Codex
```

Behavior:
- keeps the same `Task ID` as the root family
- allocates the next `CCP-123-F#`
- stores `parentPromptId`

Use a follow-up id when the new work is fixing or refining an existing tracked task rather
than starting a brand-new root task.

## Reservation State

Reservation records:
- use `status: reserved`
- use `queueState: not-queued`
- are visible to the registry and audit
- prevent the same id from being reissued if an agent stops mid-creation

Reservations remain valid until:
- finalized with `prompt:create`
- or manually released with `prompt:release`

Released reservations do not get reused.

## Recovery Commands

List active reservations:

```sh
npm run prompt:reservations
```

List all reservations, including released ones:

```sh
npm run prompt:reservations -- --all
```

Release a reservation:

```sh
npm run prompt:release -- <PROMPT_ID> --note "reason"
```

Only release prompts that are still `status: reserved`.

## Collision Rule

The allocator is the only supported way to create new prompt ids.

No agent may:
- read the highest current prompt id and pick the next number manually
- pick a follow-up `-F#` suffix manually
- overwrite or reuse another agent’s reserved id

If a reservation exists, that id is taken whether or not the prompt body has been written.
