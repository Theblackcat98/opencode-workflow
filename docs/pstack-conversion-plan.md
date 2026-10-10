# Conversion Plan: pstack (Cursor plugin) → opencode

Status: **plan only — no conversion performed yet.**
Source of truth for the unconverted plugin: `plugin/pstack/` (vendored,
byte-identical to `cursor/plugins@main`, pstack v0.15.15, MIT).

References (verified 2026-10-10):

- Skills: <https://opencode.ai/v2/docs/skills/>
- Agents: <https://opencode.ai/v2/docs/agents/>
- Commands: <https://opencode.ai/v2/docs/commands/>
- Plugins: <https://opencode.ai/v2/docs/plugins/>

---

## 1. Goal

Convert pstack's portable parts into opencode-native assets inside this repo:

- `skills/` (51 Cursor skills) → `.opencode/skills/<id>/SKILL.md`
- `agents/` (2 Cursor subagents) → `.opencode/agents/<id>.md`

…so they are discovered by opencode, loadable via the `skill` tool /
`@skill-id`, and launchable as subagents — while keeping `plugin/pstack/`
untouched as the upstream reference.

### Non-goals

| Item | Verdict | Reason |
|---|---|---|
| `automations/benny/` | **Not portable.** Keep vendored only. | Cursor Automations (webhooks, `.cursor/settings.json`, Slack bot). opencode has no automations runtime. |
| `plugin/pstack/docs/guide/` (10 chapters) | Keep vendored as historical reference. | Written against Cursor UI (`/add-plugin`, Custom Modes, Projects). Revisit only if the converted stack proves useful. |
| `.cursor-plugin/plugin.json` | Drop (no conversion). | opencode discovers skills/agents via fixed directories; there is no manifest mapping to port. |
| Re-publishing as a shareable opencode plugin package | Out of scope. | This repo's charter: repo-local, opt-in per workspace. |

## 2. Target layout

```text
.opencode/
├── agents/
│   ├── poteto-agent.md          ← from plugin/pstack/agents/poteto-agent.md
│   └── comment-sicko.md         ← from plugin/pstack/agents/comment-sicko.md
└── skills/
    ├── poteto-mode/             ← + references/, playbooks/, scripts/
    ├── poteto-help/
    ├── setup-pstack/
    ├── tdd/ …                   ← all converted skills, one dir each
    └── …
```

- **No `opencode.json` changes required** (decided: leave V2 migration
  out — §6.5). `.opencode/skills` and `.opencode/agents` are auto-discovered
  in V2.
- Scripts stay **beside their SKILL.md** (relative paths are part of the skill
  contract; opencode passes the skill's base directory + file sample to the
  agent).
- Converted skills are **copies**, not moves: `plugin/pstack/` remains the
  pristine upstream snapshot for diffing future upstream updates.

## 3. Decisions (recommendations — each is reversible per-skill)

### D1 — Skill visibility: keep pstack's router pattern

50/51 skills carry Cursor's `disable-model-invocation: true` (only
`setup-pstack` lacks it). In opencode V2 this field **exists with
compatible semantics**: the skill is hidden from the model's discovery
list but still loadable by exact ID. That is exactly pstack's design:
`poteto-mode` routes, everything else is loaded by the router.

**Decided (human, 2026-10-10): keep pstack's visibility setup exactly as
shipped.** All 50 skills keep `disable-model-invocation: true` as-is —
including `poteto-mode` and `poteto-help`, which stay hidden from discovery
and are reached by explicit user invocation (`@poteto-mode` /
`@poteto-help`, or the skill tool by exact ID), just as `/poteto-mode` is
explicit in Cursor. Only `setup-pstack` (which never had the field) is
discoverable. Final state: 50 hidden / 1 visible. A conversion-time
consideration (not decided): a thin `.opencode/commands/poteto-mode.md`
wrapper could offer an explicit user-invokable entry point.

### D2 — Models: roles inherit the current model (decided)

pstack hardcodes Cursor slugs (`claude-opus-5-5-xhigh`, `grok-4.7-xhigh-fast`)
in 9 skills + 6 playbooks, selected per-role at spawn time.

**Decided (human, 2026-10-10): the harness charter does not constrain plugin
content — roles inherit whatever model is currently selected.** Conversion
drops all Cursor model slugs and role→model tables; spawn instructions say
"spawn a subagent, which inherits the session model" (opencode subagents
inherit the parent model when none is configured). The effort-ladder prose
(`max > xhigh > high …`) survives only as "prefer a higher-reasoning variant
when the provider offers one" where it matters. D3's model-map file is
accordingly downgraded: `setup-pstack` no longer writes role→model config.

### D3 — `~/.cursor/rules/pstack-models.mdc` replacement

`setup-pstack` writes a Cursor always-apply rules file; 9+ consumers read
role lines from it. **Superseded by the D2 decision (roles inherit the
session model): no model-map file.** `setup-pstack` shrinks to environment
orientation only (reasoning budget, which models this opencode install
offers, optional chaining to `/create-verification-skill`); it writes no
config. Delete all "read your role line from pstack-models.mdc" consumer
instructions along with the slugs (D2).

### D4 — `/skill-name` references → opencode invocation idiom

133 body-only `/skill-name` matches across 14 SKILL.md files (147 total
including frontmatter across 19 files). Mechanical rewrite:
`/poteto-mode` → `the **poteto-mode** skill (load via the `skill` tool, or
`@poteto-mode`)`. First mention in a body gets the long form; later mentions
shorten to `poteto-mode`. Cursor built-ins (`/deslop`, `/loop`,
`/create-skill`, `/add-plugin`) get deleted or footnoted as Cursor-only.

### D5 — Cursor `Task` tool + `subagent_type` → opencode `subagent` tool

10 skills reference the Task tool / `subagent_type` (`arena`, `how`,
`interrogate`, `no-comments`, `poteto-help`, `poteto-mode`, `reflect`,
`setup-pstack`, `swarm`, `why`). Mapping:
`subagent_type: "generalPurpose"` → generic subagent launch (own prompt,
fresh context); `"poteto-agent"` → `subagent` tool, agent ID `poteto-agent`;
`"Comment Sicko"` → agent ID `comment-sicko` (IDs are file-derived in
opencode — rename the reference, keep the persona). `run_in_background` →
the `subagent` tool's background option (not an agent field).

### D6 — `AskQuestion` tool → plain prose

3 SKILL.md files (`automate-me`, `poteto-mode`, `setup-pstack`) + 1
playbook (`poteto-mode/playbooks/autonomous-run.md`). Replace with: "Ask
the user directly in text and wait for the answer." No opencode tool
contract needed.

### D7 — Cursor paths

| Cursor path | opencode treatment |
|---|---|
| `~/.cursor/rules/pstack-models.mdc` | No equivalent (D3 superseded by D2): delete consumer read-instructions with the slugs. |
| `~/.cursor/projects/*/agent-transcripts/*.jsonl` (`recall`, `reflect`, `worktree-audit.sh`) | Degrade: point at `~/.local/share/opencode/` with a "layout may differ by version; discover at runtime" note. Skills already degrade gracefully ("no data" is a valid finding). |
| `.cursor/skills/verify-<app>/` (`create-/maintain-verification-skill`) | `.opencode/skills/verify-<app>/` |

### D8 — Frontmatter transform (mechanical, scriptable)

| Cursor field | Action |
|---|---|
| `name` | Keep (display label only; ID is path-derived). |
| `description` | Keep. Rewrite any `/slash` self-reference per D4. |
| `disable-model-invocation: true` | **Keep** on all 50 skills that carry it (D1 decided: 50 hidden / 1 visible). Valid V2 field. |
| `paths` (typescript-best-practices) | Drop (Cursor glob-gating; opencode has no equivalent). |
| `mode`, `icon`, `color`, `reminder` (poteto-mode) | Drop. Fold `reminder` text into the description or body top. |
| `license` / `metadata` | None present; optional add: `license: MIT` from plugin.json. |

All 51/51 directory names already match
`^[a-z0-9]+(-[a-z0-9]+)*$`. The 49/51 figure applies to the display `name:`
frontmatter fields — the two outliers (`Poteto Mode`, `Make Bot UI`) are
harmless in opencode since IDs derive from paths.

### D9 — Scripts policy

bun 1.4.0 + node v22.22.0 are installed on this box; scripts run as-is.

- `watch-pr/`, `orch/`, `bootstrap.ts`, `check-plan.mjs`, `bun.lock` (in
  `poteto-mode/scripts/`): copy unchanged; add one line to poteto-mode's
  SKILL.md: "scripts require bun (>=1.4) and `gh`."
- `show-me-your-work/scripts/log.sh`: copy unchanged (runs under bash; no
  changes).
- `worktree-audit.sh`: keep, but its transcript scan target is Cursor-only —
  apply D7 degrade (env-var overridable path, default best-effort).

### D10 — `why` skill / MCP

Keep the MCP-centric investigation flow. Replace "list MCPs from the Cursor
environment" with the opencode idiom (configured `mcp.servers`; user-facing
`/mcps`). The eight per-source playbooks (`references/sources/*.md`:
`code-archaeology`, `databricks`, `datadog`, `incident-postmortem`,
`linear`, `notion`, `sentry`, `slack`) are largely harness-neutral — light
touch: remove `mcp_auth` Cursor-isms, keep the "no matching MCP available
is a valid finding" degradation.

## 4. Tiered execution order

Reconciliation: 35 (Tier 1) + 14 (Tier 2) + 2 (Tier 3: `setup-pstack`,
`make-bot-ui`) = 51 skills.

### Tier 1 — self-contained prose (35 skills, effort: M, ~1 batch)

Near-mechanical: copy dir → D8 frontmatter transform → grep-sweep body for
`/skill-name` (D4), `~/.cursor` (D7), `Task`/`subagent_type` (D5).

The 24 `principle-*` skills, `unslop`, `bro`, `tdd`, `technical-writing`,
`typescript-best-practices`, `show-me-your-work`, `blast-radius`,
`benchmark-checklist`, `figure-it-out`, `correct`, `teach`.

Note: `show-me-your-work` keeps `scripts/log.sh` (runs under bash; no
changes). `typescript-best-practices` keeps `references/patterns.md`, drops
`paths`.

### Tier 2 — structural / multi-agent (14 skills + 2 agents, effort: M–L)

- **`poteto-mode`** (+23 playbooks): the core. Drop 4 Cursor frontmatter
  fields; rewrite model defaults in 6 playbooks per D2; script invocations
  stay per D9; `orchestrate.md`/`autonomous-run.md` Task-tool rewrites per D5.
- **`poteto-help`**: the ~105-reference routing table → D4 rewrite
  (highest manual-review density).
- **`how`, `why`, `reflect`, `recall`, `interrogate`, `arena`, `architect`, `swarm`**:
  per-role model tables → D2; spawn instructions → D5; `reflect` + `recall`
  transcript paths → D7 degrade.
- **`no-comments`**: `subagent_type: "Comment Sicko"` → `comment-sicko`.
- **`automate-me`**: `/loop` + Automations references → Cursor-only
  footnote; keep the "write a verification command" core.
- **`create-verification-skill`, `maintain-verification-skill`**: output
  path → `.opencode/skills/verify-<app>/` (D7).
- **Agents**: `poteto-agent.md` — add `mode: subagent`, drop
  `is_background: true`, fix its poteto-mode path reference;
  `comment-sicko.md` — add `mode: subagent`, keep body, rename refs.
  `comment-sicko` should also get read-only `permissions`
  (`edit`/`shell` deny) since its contract is report-only.

### Tier 3 — deep Cursor coupling (2 skills + verdicts, effort: S–M)

- **`setup-pstack`**: deepest rewrite. Writes no config (D3 superseded by
  D2); model enumeration becomes "models available to this opencode
  install" (provider config / `/models`); drops Cursor models-API probing.
  The skill shrinks to optional environment orientation (reasoning budget,
  chaining to the verification-skill flow).
- **`make-bot-ui`**: **verdict: not portable** (Cursor Automations webhooks,
  Tailscale bot setup). Keep vendored; exclude from `.opencode/skills`.
- Post-conversion README note in this repo listing verdicts + upstream pin.

## 5. Validation plan (after each tier, and at the end)

1. **Structure:** every `.opencode/skills/<id>/` contains `SKILL.md`;
   `find .opencode/skills -mindepth 1 -maxdepth 1 -type d | wc -l` matches
   the tier's expected count; IDs unique against
   `~/.config/opencode/skills/` (currently zero collisions — audited) and
   `.opencode/agents/`, `.opencode/commands/`.
2. **Lint greps (must be zero hits in converted tree):**
   `~/.cursor`, `subagent_type`, `disable-model-invocation: false`
   (sanity), `claude-opus-5-5-xhigh`, `grok-4.7-xhigh-fast`,
   `\b/why\b`-style slash refs, `AskQuestion`, `is_background`,
   `alwaysApply` outside fenced examples.
3. **Frontmatter parse:** YAML loads; only allowlisted fields present
   (`name`, `description`, `license`, `metadata`, and
   `disable-model-invocation` where D1 keeps it).
4. **Runtime:** restart opencode (config loads at startup — repo
   convention); `opencode debug config` shows no errors; load one Tier-1
   skill via `@<id>`; ask the model to route a fake task through
   `poteto-mode` and confirm it loads a sub-skill by ID despite
   `disable-model-invocation`.
5. **Regression:** `python3 -m unittest discover -s sandbox` stays green
   (conversion must not touch `sandbox/`).
6. **Diff discipline:** `diff -r plugin/pstack <upstream>` unchanged —
   converted copies only; vendored tree never edited.

## 6. Risks & decided questions (human answers, 2026-10-10)

1. **Models (D2) — decided: roles inherit the current model.** The harness
   charter does not constrain plugin content. Drop all Cursor slugs/tables;
   subagents inherit the session model.
2. **Router visibility (D1) — decided: keep pstack's setup exactly.**
   50 hidden / 1 visible (`setup-pstack`); `poteto-mode` + `poteto-help`
   stay hidden, reached by explicit invocation.
3. **Pruning — decided: convert all, prune later.** (`make-bot-ui` already
   excluded as not portable; `automate-me`, `recall` convert degraded.)
4. **Upstream drift** — vendored at v0.15.15 today; a re-vendor later will
   conflict with converted copies. Accept manual re-porting per update
   [recommended for now].
5. **`opencode.json` — decided: leave V1-shaped.** Legal in V2; no
   modernization rides along.

## 7. Suggested commit sequence

1. `skills: convert pstack tier-1 prose skills (35)` — mechanical batch.
2. `agents: convert pstack poteto-agent + comment-sicko` — small, enables
   Tier-2 references.
3. `skills: convert pstack router set (poteto-mode, poteto-help, tier-2)` —
   the structural core.
4. `skills: convert setup-pstack; record not-portable verdicts` — Tier 3 +
   verdict README.
5. `docs: conversion notes + validation results` — after validation pass.

## 8. Conversion verdicts

Recorded 2026-10-10 on completion of Tier 3.

- **Converted: 50 skills + 2 agents.** All 51 upstream skills except
  `make-bot-ui` → `.opencode/skills/<id>/`; `poteto-agent` and
  `comment-sicko` → `.opencode/agents/`. `plugin/pstack/` untouched as the
  upstream reference.
- **Explicitly not ported:**
  - `make-bot-ui` — Cursor Automations webhooks (Tailscale bot setup);
    no opencode equivalent. No `.opencode/skills/make-bot-ui/` created.
  - `automations/benny/` — Cursor Automations pack; kept vendored only.
  - `docs/guide/` (10 chapters) — kept vendored as historical reference
    (written against Cursor UI).
  - `.cursor-plugin/plugin.json` — dropped; opencode discovers
    skills/agents via fixed directories, no manifest to map to.
- **Upstream pin:** `cursor/plugins`, pstack v0.15.15 (MIT).
- No README added under `.opencode/skills/` (a root `*.md` there would be
  discovered as a skill).
