# Claude Code User Guide — Patzer Pro

_Last updated: 2026-04-03_

This documents how Claude Code is configured for this project: instruction files, rules,
permissions, memory, and available skills.

---

## Instruction Files

Claude Code loads instruction files at session start. These shape behavior for every interaction.

### Always-loaded files

| File | Purpose | Lines |
|---|---|---|
| `CLAUDE.md` | Core behavioral gates, prompt/sprint lifecycle, project identity | 385 |
| `AGENTS.md` | Shared repo policy for all agents: Lichess-first rule, prompt/sprint hard rules, review workflow, validation requirements, decision lock rule | 710 |

Both files are loaded into context at the start of every session regardless of what
you're working on.

### `.claude/rules/` — Conditional rules (path-scoped)

These files only load when Claude reads files matching their `paths` frontmatter.
This saves context in sessions that don't touch source code.

| File | Loads when touching | Content |
|---|---|---|
| `performance.md` | `src/**/*.ts`, `server/**` | CR-1 to CR-10, anti-patterns, rendering rules, performance pre-implementation steps |
| `lichess-reference.md` | `src/**/*.ts` | Key Lichess source paths table, reuse priority, adaptation rule |
| `architecture.md` | `src/**/*.ts`, `server/**` | File-structure rules, subsystem boundaries, module patterns, state architecture, first task rule |
| `stack-and-build.md` | `src/**/*.ts`, `package.json`, `tsconfig.json`, `esbuild*`, `server/**` | Stack tables, deliberate divergences, npm packages, frontend rules, TS config, backend rules, build system |
| `board-engine-tree.md` | `src/board/**`, `src/engine/**`, `src/tree/**`, `src/ceval/**`, `src/analyse/**`, `src/puzzles/**`, `src/openings/**`, `src/study/practice/**` | Board implementation, engine architecture, move tree/variations, puzzle generation logic |
| `import-and-storage.md` | `src/header/**`, `src/import/**`, `src/games/**`, `src/idb/**`, `src/openings/**`, `server/**` | Game import system, data storage, header/nav UI reference |
| `provenance.md` | `src/**/*.ts`, `server/**` | Commit message rules, code comment rules, external reference handling, provenance tracking |

### How rules loading works

- Rules with a `paths` frontmatter block only activate when Claude reads a file matching one of those glob patterns in the current session
- Rules without `paths` frontmatter are always loaded (same as CLAUDE.md)
- All current Patzer Pro rules use `paths` — none are unconditionally loaded
- If a session touches `src/engine/foo.ts`, rules matching `src/**/*.ts` and `src/engine/**` both activate

### Editing rules

- Rules are plain Markdown files in `.claude/rules/`
- Add new rules by creating a new `.md` file in that directory
- Use `paths` frontmatter to scope when it loads:
  ```yaml
  ---
  paths:
    - "src/puzzles/**"
  ---
  ```
- Without `paths`, the rule loads every session (use sparingly)
- Claude Code discovers rules files recursively, so subdirectories work too

---

## Permissions

Permissions control which tools Claude can use without asking.

### Project-level permissions (`.claude/settings.local.json`)

These are accumulated "allow" rules from previous sessions. When you approve a tool call,
Claude Code saves the pattern here so it won't ask again for similar calls.

Current state: ~90+ Bash patterns allowed (build commands, git operations, npm/pnpm,
grep/find on Lichess source, curl for GitHub APIs, etc.). Plus `WebSearch`, `WebFetch` for
specific domains, and `Read` for prompt items and temp files.

To reset permissions: delete `.claude/settings.local.json` and Claude will ask fresh.

To add permanent allow rules: edit `.claude/settings.local.json` directly. The format is:
```json
{
  "permissions": {
    "allow": ["Bash(npm run:*)", "WebSearch"],
    "deny": []
  }
}
```

### User-level permissions (`~/.claude/settings.local.json`)

Currently allows:
- `WebFetch` for `github.com` and `raw.githubusercontent.com`
- `Bash(wc:*)` and `Bash(xargs ls:*)`

These apply to all projects.

---

## Memory System

Claude Code has a persistent memory system that survives across sessions.

### Location

`~/.claude/projects/-Users-leftcoast-Development-PatzerPatzer/memory/`

### Current memories

| File | Type | Content |
|---|---|---|
| `feedback_orp_naming.md` | feedback | Use "Opening Repetition Practice" / "ORP" — never competitor product names |
| `project_opponent_rename.md` | project | "Openings" page renamed to "Opponents" as of 2026-03-29 |
| `feedback_competitor_refs.md` | feedback | Never include competitor names/URLs in repo files |
| `feedback_prompt_queue_state.md` | feedback | New prompts must use queueState "queued-pending", not "not-queued" |

### How memory works

- `MEMORY.md` is the index file — always loaded into context
- Individual memory files contain the actual content
- Memory types: `user` (about you), `feedback` (corrections/preferences), `project` (ongoing work context), `reference` (external system pointers)
- To add: tell Claude "remember that..." and it saves automatically
- To remove: tell Claude "forget that..." and it removes the entry
- Memories are point-in-time; Claude verifies against current code before acting on them

---

## Hooks

**No Claude Code hooks are currently configured.**

### Important distinction: hooks vs lifecycle commands

Your prompt and sprint lifecycle commands (`npm run prompt:start`, `npm run prompt:complete`,
`npm run sprint:create`, etc.) are **not** Claude Code hooks. They are npm scripts that Claude
runs manually via Bash, enforced by behavioral instructions in CLAUDE.md and AGENTS.md.

**Claude Code hooks** are a different system — automatic shell commands configured in
`settings.json` that fire on platform events without Claude deciding to run them.

| | Lifecycle commands (what you have) | Claude Code hooks (not configured) |
|---|---|---|
| **How they work** | Instructions in CLAUDE.md tell Claude to run specific npm commands before/after tasks | Shell commands that fire automatically on tool-use events |
| **Enforcement** | Claude must remember to follow the instruction | Platform executes them — no choice involved |
| **Configuration** | Written as rules in CLAUDE.md / AGENTS.md | Configured in `.claude/settings.json` |
| **Failure mode** | Claude might forget (mitigated by strong instruction wording) | Cannot be forgotten — they always fire |

### If you wanted to add actual hooks

Create `.claude/settings.json` (project-level) with:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit",
        "command": "echo 'About to edit a file'"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "command": "echo 'Bash command completed'"
      }
    ]
  }
}
```

Available hook events: `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop`.

### Could your lifecycle commands become hooks?

In theory, yes — you could create a `PreToolUse` hook that checks whether a CCP prompt
has been started before allowing Edit/Write tool calls. This would make the Tracked Prompt
Gate enforceable at the platform level rather than relying on instruction adherence. This
would be a more robust guarantee but also more complex to implement correctly.

---

## Available Skills (Slash Commands)

These are invoked with `/command` in the Claude Code prompt:

| Command | Purpose |
|---|---|
| `/commit` | Create a git commit with proper message formatting |
| `/review-pr` | Review a pull request |
| `/simplify` | Review changed code for reuse, quality, and efficiency |
| `/loop` | Run a prompt or command on a recurring interval |
| `/schedule` | Create/manage scheduled remote agents (cron-based) |
| `/claude-api` | Help building apps with the Claude API or Anthropic SDK |
| `/update-config` | Configure Claude Code harness settings |
| `/keybindings-help` | Customize keyboard shortcuts |

### Built-in commands (not skills)

| Command | Purpose |
|---|---|
| `/help` | Get help with Claude Code |
| `/clear` | Clear conversation context |
| `/model` | Switch model (Opus/Sonnet/Haiku) |
| `/fast` | Toggle fast mode (same model, faster output) |
| `/compact` | Compress conversation context |
| `/vim` | Toggle vim mode |
| `/terminal-setup` | Configure terminal integration |
| `/status` | Show session status |

---

## Key Configuration Files

| File | Location | Purpose |
|---|---|---|
| `CLAUDE.md` | repo root | Always-loaded project instructions |
| `AGENTS.md` | repo root | Always-loaded shared agent policy |
| `.claude/rules/*.md` | repo `.claude/` | Conditional path-scoped rules |
| `.claude/settings.local.json` | repo `.claude/` | Project permission allow/deny lists |
| `~/.claude/settings.json` | user home | User-level settings (currently empty) |
| `~/.claude/settings.local.json` | user home | User-level permissions |
| `~/.claude/projects/.../memory/` | user home | Persistent memory files |

---

## History of Changes

- **2026-04-03**: CLAUDE.md slimdown — reduced from 1,176 to 385 lines. Created 7 path-scoped
  rules files. AGENTS.md was also expanded to serve as canonical source for rules trimmed from
  CLAUDE.md. Initial scoped-rule path coverage was corrected post-rollout (added missing paths
  for puzzles, openings, header, study/practice). See `docs/CLAUDE_MD_SLIMDOWN-2026-04-03.md`
  and `docs/CLAUDE_MD_SLIMDOWN_AUDIT_BRIEF.md` for full details.
