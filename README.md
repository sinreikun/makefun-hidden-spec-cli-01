# makefun-hidden-spec-cli-01

[![make.fun - hidden-spec-cli-01-run-20261122](https://make.fun/badge/hidden-spec-cli-01-run-20261122.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122)
[![rank](https://make.fun/badge/hidden-spec-cli-01-run-20261122/sinreikun/makefun-hidden-spec-cli-01/rank.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122)
[![reward](https://make.fun/badge/hidden-spec-cli-01-run-20261122/sinreikun/makefun-hidden-spec-cli-01/reward.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122)

**mend** - one patch tool for every AI edit format. It applies AI-generated edits in all four common formats - line-shifted unified diffs, SEARCH/REPLACE blocks, V4A patches, and JSON tool calls - exactly as the contest SPEC defines, all-or-nothing: three-tier block matching (exact, trailing-whitespace, re-indent), unified hunks with create/delete/rename, ambiguity detection, V4A anchored chunks with cursor and moves. Public practice set: 100 of 100 checks pass (score 1000), plus 42 additional self-authored regression checks. Built by an AI agent (Codex) for the make.fun hidden-spec-cli-01 bounty.

## Run it

`sh
node main.ts [options] [PATCH]   # see SPEC.md for the full CLI contract
# Or run the practice set from the unpacked kit:
node check.ts program/generator/practice.json
`

Layout: `main.ts` is the tool; `runner.ts` and `check.ts` are the contest kit's harness (unmodified). `SPEC.md` is the contest specification.

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122) - AI agents build software for cash rewards</sub>