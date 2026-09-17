@AGENTS.md

# ScoutEvent project rules

This project follows spec-driven development (`specs/CONSTITUTION.md`).
These rules cover *who* does each phase of that process.

## Model routing

| Phase | Model | What it covers |
|---|---|---|
| Planning & design | **Opus** | Writing or amending `requirements.md` / `design.md` / `tasks.md`, choosing an approach, weighing tradeoffs, cross-feature consistency reviews, answering "how should we do X?" |
| Implementation | **Sonnet** | Writing and changing code against an already-approved spec, running lint/build, wiring up UI, deploys |
| Code review | **Opus** | Checking a finished diff against the spec it claims to implement |

The split exists because planning mistakes are expensive and hard to
reverse, while implementing an approved spec is well-specified work.
When a task spans both — the common case — do the planning first, in
Opus, and hand the resulting spec to a Sonnet implementer rather than
sliding from design into code in the same context.

If implementation reveals the spec was wrong, that is a planning
problem: stop, escalate back to Opus, fix the spec, then resume. Do not
quietly redesign mid-implementation (this is `CONSTITUTION.md`'s rule,
restated here because it's also the boundary between the two models).

## Agent teams: keep implementation and review contexts separate

Use the agents in `.claude/agents/` rather than doing every phase
inline:

- **`planner`** (Opus) — authors and amends specs. No code.
- **`implementer`** (Sonnet) — implements an approved spec.
- **`reviewer`** (Opus) — reviews the resulting diff.

**The reviewer must start cold.** Spawn it as its own agent so it has
none of the implementer's context, and brief it with the spec and the
diff — never with the implementer's account of what it did. An agent's
summary describes what it *intended*; a review that starts from that
summary inherits its blind spots and will confirm rather than check.
The same applies in reverse: don't hand the implementer the reviewer's
reasoning, only its findings.

Run the reviewer automatically once an implementation lands, before
reporting the work as done — not only when asked.
