# Bug: Line Editor Split/Join Newline Mismatch

**Date found:** 2026-04-02  
**Status:** Unresolved  
**Affects:** Prompt detail editor and sprint panel editor in `docs/prompts/dashboard.html`

---

## Symptom

When clicking `Edit` on a prompt or sprint panel:
- Locked header lines (lines 1–5) render as a single row with all text concatenated
- The editable body (line 6) appears as a single narrow `<input>` containing the **entire prompt body** as one line of text
- Lines 7+ do not exist because the body is never split

---

## Root Cause

There is a systematic escaping mismatch between how `generate-prompt-dashboard.mjs` writes JavaScript into `dashboard.html` and how that JavaScript is interpreted by the browser.

### Chain of escaping

The mjs is a code **generator**. The JS functions it contains are written verbatim into the HTML `<script>` block. Each level of escaping matters:

| mjs source | mjs runtime value | written to HTML | browser runtime value |
|---|---|---|---|
| `'\\\\n'` | `\\n` (backslash + backslash + n) | `\\n` | `\n` (backslash + n, 2 chars — **NOT a newline**) |
| `'\\n'` | `\n` (backslash + n) | `\n` | newline character (char code 10 ✓) |

### The data

Prompt bodies are stored in the PROMPTS JSON array with **actual newline characters** (char code 10). JSON `\n` = real newline when parsed.

Example:
```json
"body": "Prompt ID: CCP-666\nTask ID: CCP-666\n## Context\n..."
```
After JSON parse, `body` contains real `\n` characters.

### The split

`createLineEditorState` in the mjs source:
```javascript
const sourceLines = normalized === '' ? [] : normalized.split('\\\\n');
```

In the generated HTML, this becomes:
```javascript
const sourceLines = normalized === '' ? [] : normalized.split('\\n');
```

In the browser, `'\\n'` = backslash + n (char codes 92, 110). The body has newlines (char code 10). **No match. Entire body = one array element = one input.**

### Confirmed via hex dump

`dashboard.html` line 2889 (hex):
```
lit('\\n')  →  27 5c 5c 6e 27  →  TWO backslashes before n  →  browser: backslash+n
```

`dashboard.html` line 2581 (hex, the `sprintPanelContextLines` join):
```
oin('\n')  →  27 5c 6e 27  →  ONE backslash before n  →  browser: newline ✓
```

This inconsistency is why locked lines (joined with correct `\n`) also fail to split (split uses wrong `\\n`).

---

## Affected lines in `generate-prompt-dashboard.mjs`

All of these use `'\\\\n'` (4 backslashes + n) and need to be `'\\n'` (2 backslashes + n):

| Line | Function | Issue |
|---|---|---|
| 3069 | `normalizePromptBody` | regex `/\\\\r\\\\n/g` and replacement `'\\\\n'` and `/\\\\s+$/` |
| 3081 | `lockedPromptMetadataLines` | `join('\\\\n')` |
| 3086 | `splitPromptEditorBody` | `split('\\\\n')` |
| 3088 | `splitPromptEditorBody` | `split('\\\\n')` |
| 3103 | `splitPromptEditorBody` | `join('\\\\n')` |
| 3113 | `composePromptEditorBody` | `'\\\\n\\\\n'` separator |
| 3124 | `createLineEditorState` | `split('\\\\n')` |
| 3139 | `cleanLineEditorBody` | `join('\\\\n')` |
| 3215 | `renderLineEditor` | `split('\\\\n')` (locked lines) |
| 3261 | `buildPromptDiffOps` | `split('\\\\n')` |
| 3262 | `buildPromptDiffOps` | `split('\\\\n')` |
| 3311 | `summarizePromptDiff` | `join('\\\\n')` |

Line 3069 also has `/\\\\s+$/` which becomes `/\\s+$/` in the browser — this matches literal `\s` not whitespace (though trimming still partially works via the `\s+$` regex being re-interpreted).

---

## Already correct (do not change)

| Line | Function | Note |
|---|---|---|
| 2907 | `sprintPanelContextLines` | `join('\\n')` — already produces newline in browser ✓ |

---

## Fix

In `generate-prompt-dashboard.mjs`, do a targeted replacement of `'\\\\n'` → `'\\n'` and `/\\\\r\\\\n/` → `/\\r\\n/` across the affected functions. Then regenerate `dashboard.html`.

Do **not** change lines 3725–3786 (audit/task display string builders) without separate analysis — those embed `\\\\n` into HTML content strings, not JS split/join operations.

---

## Related prompts

- `CCP-667-F4` — Fix stylized editor so it is actually editable (started, not completed due to this finding)
