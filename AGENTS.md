# Workspace Notes

This repository is the engineering-harness project: a staging ground for a
copyable opencode template (see `.opencode/CHARTER.md`). The `sandbox/` directory is a small
training project used to validate the harness (its own conventions live in
`sandbox/AGENTS.md`).

## Project facts

- Tests: `python3 -m unittest discover -s sandbox` (stdlib `unittest`; pytest
  is not installed on this Termux box)
- Product intent: `.opencode/CHARTER.md`; approved work: `.opencode/ROADMAP.md`;
  past decisions: `.opencode/DECISIONS.md`; validation: `docs/validation.md`
- After changes to `opencode.json`, agent files, or commands: restart opencode
  (config is loaded once at startup)