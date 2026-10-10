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

- **No `opencode.json` changes required.** `.opencode/skills` and
  `.opencode/agents` are auto-discovered in V2. Optional later addition: an
  `instructions` entry for the model-map file (§5.4).
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

**Recommendation:** REMOVE the field from `poteto-mode` + `poteto-help`
during conversion (making them discoverable entry points alongside
`setup-pstack`), and KEEP it on the other 48 sub-skills. Alternative
(flip all to discoverable) floods every step's context with 51 skill
descriptions and abandons the router design. A conversion-time
consideration (not the recommendation): a thin
`.opencode/commands/poteto-mode.md` wrapper could offer an explicit
user-invokable entry point in addition to the discoverable skill.

### D2 — Models: neutralize dynamic model routing (charter compliance)

`.opencode/CHARTER.md`: *"Not a model router. Per-agent models stay static."*
pstack hardcodes Cursor slugs (`claude-opus-5-5-xhigh`, `grok-4.7-xhigh-fast`)
in 9 skills + 6 playbooks, selected per-role at spawn time.

**Recommendation (a): neutralize.** Role→model tables become role→*agent*
guidance: "spawn a subagent; use the session model or the harness agents
(`explore`/`coder`/`reviewer`) where they fit." Drop all Cursor model slugs.
The effort-ladder prose (`max > xhigh > high …`) survives only as "prefer a
higher-reasoning variant when the provider offers one" where it matters.

- (b) Keep tables as an opt-in, user-filled reference file (see D3) — more
  faithful, but contradicts the charter as written.
- (c) Amend the charter — a human decision; out of scope for this plan.

**Flag for the human:** if you want pstack's real two-model routing, that is
decision (b)/(c), not (a).

### D3 — `~/.cursor/rules/pstack-models.mdc` replacement

`setup-pstack` writes a Cursor always-apply rules file; 9+ consumers read
role lines from it. **Recommendation:** replace with a repo-local
`.opencode/pstack-models.md` (role → `provider/model#variant`, user-filled or
left at "inherit"). Consumers read it as a reference file. Add it to
`instructions` in `opencode.json` **only** if the human wants it always in
context — default: no (charter: no model router).

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
| `~/.cursor/rules/pstack-models.mdc` | `.opencode/pstack-models.md` (D3) |
| `~/.cursor/projects/*/agent-transcripts/*.jsonl` (`recall`, `reflect`, `worktree-audit.sh`) | Degrade: point at `~/.local/share/opencode/` with a "layout may differ by version; discover at runtime" note. Skills already degrade gracefully ("no data" is a valid finding). |
| `.cursor/skills/verify-<app>/` (`create-/maintain-verification-skill`) | `.opencode/skills/verify-<app>/` |

### D8 — Frontmatter transform (mechanical, scriptable)

| Cursor field | Action |
|---|---|
| `name` | Keep (display label only; ID is path-derived). |
| `description` | Keep. Rewrite any `/slash` self-reference per D4. |
| `disable-model-invocation: true` | **Keep** on the 48 sub-skills (D1). Valid V2 field. |
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

- **`setup-pstack`**: deepest rewrite. Writes `.opencode/pstack-models.md`
  instead of Cursor rules (D3); model enumeration becomes
  "models available to this opencode install" (provider config / `/models`);
  drops Cursor models-API probing. Under D2(a) the whole skill shrinks to
  optional: it only fills the reference file.
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

## 6. Risks & open questions for the human

1. **Charter tension (D2)** — do you want (a) neutralized model routing
   [recommended, charter-compliant], (b) opt-in user-filled role→model file,
   or (c) a charter amendment to allow static role→model mapping?
2. **Router visibility (D1)** — keep pstack's 48-hidden/3-visible router
   pattern [recommended], or make all 51 discoverable?
3. **Pruning** — 51 skills is a lot of surface. After conversion, consider
   excluding Cursor-lifestyle skills you won't use (`make-bot-ui` is already
   excluded; `automate-me`, `recall` are degraded). Prune now or convert-all
   then prune?
4. **Upstream drift** — vendored at v0.15.15 today; a re-vendor later will
   conflict with converted copies. Accept manual re-porting per update
   [recommended for now].
5. **`opencode.json` is still V1-shaped** (`permission.bash`…). Legal in V2,
   but a separate V1→V2 config modernization (`permissions` array,
   `shell` action) could ride along with Tier-3 if desired.

## 7. Suggested commit sequence

1. `skills: convert pstack tier-1 prose skills (35)` — mechanical batch.
2. `agents: convert pstack poteto-agent + comment-sicko` — small, enables
   Tier-2 references.
3. `skills: convert pstack router set (poteto-mode, poteto-help, tier-2)` —
   the structural core.
4. `skills: convert setup-pstack; record not-portable verdicts` — Tier 3 +
   verdict README.
5. `docs: conversion notes + validation results` — after validation pass.
