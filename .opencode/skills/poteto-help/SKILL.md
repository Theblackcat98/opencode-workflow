---
name: poteto-help
description: Guides users through pstack setup, poteto-mode, and picking the skill, playbook, or principle for a task. Load via the `skill` tool, or `@poteto-help`, with a question.
metadata:
  opencode/autoinvoke: false
---

# Poteto help

Answer the user's question about pstack, hand them a prompt they can send, and link the file the answer came from. For a help question, don't start the work. The user asked how, and a pstack run spends real tokens, so let them send the prompt.

A message that asks for work, such as "use pstack to fix this bug", is not a help question. Read [`poteto-mode`](../poteto-mode/SKILL.md), do the work under it, and mention once that invoking it with `@poteto-mode` keeps it on.

This file maps questions to the skills and guide pages that hold the answers. Those files own the details. Read the file you route to before you quote it, and trust it when it disagrees with this map. The links here point into the installed plugin, which the user may not be able to open, so give the user the file's public copy: `https://github.com/cursor/plugins/blob/main/pstack/` followed by its path.

## Find out what they need

Infer the need from the message and the conversation. A named situation, such as "which skill reviews a PR?", goes straight to its section. If the need is still unclear, ask one multiple-choice question with these options, then answer only the section they pick:

- Get set up
- Start a task with poteto-mode
- Pick a skill for a situation
- Fix a run that went wrong
- Make pstack my own

Check the state that changes the answer, and mention it only when it does:

- Roles inherit the session model. There is no per-role model configuration, so never tell the user to pick a model for a role.
- No `verify-*` skill or other app harness in the project means agents have no scripted way to drive the app. Mention the **create-verification-skill** skill when the question is about proving a change works.

If the user is new or the question is about setup or cost, offer the **setup-pstack** skill for environment orientation. Offer it at most once per chat. If the need is also unclear, ask both questions together.

## Get set up

1. The skills live under `.opencode/skills/` in the repo (in Cursor, install with the `add-plugin` command, which is Cursor-only).
2. Run the **setup-pstack** skill. It covers the reasoning budget and environment orientation for new chats.
3. Start a real task with the **poteto-mode** skill (load via the `skill` tool, or `@poteto-mode`), a goal, and a check that can pass or fail.

Installing changes nothing until the user invokes a skill. The [README](../../../plugin/pstack/README.md) and [guide page 1](../../../plugin/pstack/docs/guide/01-setup.md) have the details. Offer to word their first prompt with them, per [`references/prompting.md`](references/prompting.md).

If cost is the worry, say where the tokens go and how to spend fewer. pstack spends extra tokens on subagents and review panels. A shorter panel list runs fewer subagents, one for each entry. Save poteto-mode for work that needs rigor.

pstack was built for Cursor. Its skills use the Agent Skills format, so other tools can read them. In this repo the workflow skills launch subagents via the `subagent` tool and every subagent inherits the session model. Custom Modes and the `loop` command are Cursor-only and not available here.

## Start a task with poteto-mode

The **poteto-mode** skill (load via the `skill` tool, or `@poteto-mode`) matches the task to a playbook, copies the playbook's steps into the todo list, and runs the other skills as the steps need them. A step it skips stays in the list as `skip: <reason>`. A good prompt states the goal and how to tell it's done. It doesn't list skills, because a hand-written sequence tends to drop or reorder steps the playbook would keep. Read [`references/prompting.md`](references/prompting.md) before you help word one. [Guide page 2](../../../plugin/pstack/docs/guide/02-poteto-mode.md) has examples.

Invoke it per task with `@poteto-mode` or the `skill` tool. There are no Custom Modes here, so start each new task with it explicitly. Saying "new task" mid-chat makes the mode match a fresh playbook.

Link the [opencode skills docs](https://opencode.ai/v2/docs/skills/) when this comes up. Mid-chat, "new task" makes the mode match a fresh playbook. poteto-mode already launches the subagents its playbook steps spawn via the `subagent` tool with agent ID `poteto-agent`. To get the same style from a subagent of your own, launch via the `subagent` tool with agent ID `poteto-agent`.

## Pick a skill

The default answer is the **poteto-mode** skill (load via the `skill` tool, or `@poteto-mode`), which runs most of the others when its steps need them. Name a skill directly when the user wants more or less of something than the playbook gives. Read the skill before you recommend it, and give one example prompt.

| The user wants to | Skill |
|---|---|
| Do any non-trivial task with rigor | [**poteto-mode**](../poteto-mode/SKILL.md) |
| Know how code works now, or where new code should live | [**how**](../how/SKILL.md) |
| Know why code is shaped this way, or where a number came from | [**why**](../why/SKILL.md) |
| Understand a change or subsystem, explained plainly | [**teach**](../teach/SKILL.md) |
| Catch up on their own recent work on a topic | [**recall**](../recall/SKILL.md) |
| Know what a small diff could break outside itself | [**blast-radius**](../blast-radius/SKILL.md) |
| Settle types and module shape before code that crosses a function boundary | [**architect**](../architect/SKILL.md) |
| Get several attempts at one brief, merged into the best one | [**arena**](../arena/SKILL.md) |
| Run parallel checks over slices, or race workers, as background agents | [**swarm**](../swarm/SKILL.md) |
| Have independent reviewers challenge a diff and try to break it | [**interrogate**](../interrogate/SKILL.md) |
| Fix a bug test-first when a cheap local test exists | [**tdd**](../tdd/SKILL.md) |
| Apply TypeScript rules to `.ts` or `.tsx` work | [**typescript-best-practices**](../typescript-best-practices/SKILL.md) |
| Strip comments before review, using a reviewer that didn't write them | [**no-comments**](../no-comments/SKILL.md) |
| Clean AI tells out of prose | [**unslop**](../unslop/SKILL.md) |
| Write docs, an RFC, a README, a PR description, or a commit message to a standard | [**technical-writing**](../technical-writing/SKILL.md) |
| Hear the last reply again in plain words | [**bro**](../bro/SKILL.md) |
| Give agents a scripted way to drive the app and prove behavior | [**create-verification-skill**](../create-verification-skill/SKILL.md) |
| Bring a verification skill and its feature map back in line with the app | [**maintain-verification-skill**](../maintain-verification-skill/SKILL.md) |
| Vet a performance number before reporting or acting on it | [**benchmark-checklist**](../benchmark-checklist/SKILL.md) |
| Run a large or cross-cutting change, or one to review after stepping away | [**figure-it-out**](../figure-it-out/SKILL.md) |
| Keep a decision log during a run, and review it afterward | [**show-me-your-work**](../show-me-your-work/SKILL.md) |
| Get oriented on the environment and reasoning budget | [**setup-pstack**](../setup-pstack/SKILL.md) |
| Turn their own working habits into a personal mode skill | [**automate-me**](../automate-me/SKILL.md) |
| Turn what a finished task taught into skill edits | [**reflect**](../reflect/SKILL.md) |
| Stop agents from repeating the same mistakes in this repo | [**correct**](../correct/SKILL.md) |
| Build a page whose buttons wake a Grok Bot over a webhook | **make-bot-ui** (not ported — Cursor-only) |
| Find their way around pstack | **poteto-help** |

If a skill directory next to this one is missing from the table, read its frontmatter and route by its description. The `principle-*` directories are covered under principles below.

Close calls:

- how explains what the code does. why explains the reasons. teach runs one or both and explains the result plainly.
- arena gives every worker the same brief and merges the best parts. swarm splits work into slices or a race and returns one report.
- architect implements right after it settles the design. Add "with checkpoint" to review the design before it writes code.
- interrogate reviews the diff. blast-radius looks for breakage outside the diff and proves the one fact that makes the change safe.
- recall rebuilds context across recent chats. Resuming one specific chat or branch is the Session pickup playbook.
- figure-it-out designs one rigorous run. The Orchestrate playbook runs a program that spans days and many PRs. The Autonomous run playbook drives one task to a finish condition.

Not in pstack:

- `deslop`, `control-cli`, and `control-ui` ship in the `cursor-team-kit` plugin.
- The `loop` command and skill authoring via Cursor's built-in `create-skill` are Cursor-only.
- pstack has no `orchestrate` skill. Orchestrate is a poteto-mode playbook.

## Playbooks and principles

Playbooks are step lists inside poteto-mode, not skills, so they have no invocation command. Inside poteto-mode, describing the task picks one, and these phrases name one directly:

- "babysit this pr" or "check on pr 123" runs Babysit. It drives the PR to merge-ready and stops there. It doesn't merge unless the user asks to merge, land, or ship.
- "land the stack" runs Shipping.
- "take over this branch" runs Session pickup.
- "pause safely" runs Pause safely.
- "full autopilot on this queue" runs Autopilot-full. "stack them, don't ship" runs Autopilot-stack.
- "run the eval playbook" runs Eval.

The Playbooks section of [`poteto-mode`](../poteto-mode/SKILL.md) lists every playbook and when it applies. [Guide page 6](../../../plugin/pstack/docs/guide/06-verify-and-ship.md) covers opening, babysitting, and landing a PR.

pstack has no planning skill. For work that spans phases or stacked PRs, asking poteto-mode for a plan runs the [Multi-phase plan playbook](../poteto-mode/playbooks/multi-phase-plan.md), which writes the plan and doesn't implement it. For a design question, the Prototype playbook or the **architect** skill settles it in code first.

Principles are one-rule skills that poteto-mode reads and cites in its replies. The user rarely invokes one. They steer with the names instead, as in "apply prove it works. show me the real output." Loading `principle-<name>` via the `skill` tool still loads one on demand. [Guide page 8](../../../plugin/pstack/docs/guide/08-principles.md) lists them.

## Fix a run that went wrong

| Symptom | Fix |
|---|---|
| A question got treated as the next step of the last task | Say "new task", or say the turn doesn't need the mode. |
| Runs cost more than expected | See the cost paragraph under Get set up. |
| A skill didn't load on its own | Skills load when the user invokes them by ID or when poteto-mode runs them, and it doesn't run every skill. |
| Parallel agents overwrote each other | Give each agent its own worktree, or run them as background agents with disjoint scopes. |
| An overnight run moved but finished nothing | An autonomous run needs a check that can pass or fail, not a duration. See [guide page 7](../../../plugin/pstack/docs/guide/07-overnight.md). |
| The reply claims success from a green build | Ask for the real command, flow, stored value, or profile. That's the prove-it-works principle. |

For a run that drifts, [`references/prompting.md`](references/prompting.md) has one-line steers. [Guide page 10](../../../plugin/pstack/docs/guide/10-recipes-and-pitfalls.md) has more pitfalls and the recipes worth copying.

## Make pstack my own

- The **automate-me** skill drafts a personal mode skill from the user's own history, to use alongside poteto-mode.
- The **reflect** skill after a session turns its lessons into skill edits the user approves.
- `poteto-mode write a skill for <workflow>` runs the authoring playbook. The eval playbook tests a skill change blind.
- Fix a misbehaving skill in its own PR, not inside the feature work where it went wrong.

[Guide page 9](../../../plugin/pstack/docs/guide/09-make-it-yours.md) covers each of these.

## Reply

Lead with the answer. Give at most one example prompt in a code block, adapted from [`references/recipes.md`](references/recipes.md) when one fits, then the link to that file. Keep it short unless the user asked for the whole map.
