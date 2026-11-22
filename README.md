# makefun-hidden-spec-cli-01

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![Node](https://img.shields.io/badge/Node-22-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

An entry for the make.fun contest [hidden-spec-cli-01](https://make.fun/contests/hidden-spec-cli-01-run-20261122): **mend**, a CLI that applies AI-generated edits in all four common formats - line-shifted unified diffs, SEARCH/REPLACE blocks, V4A patches, and JSON tool calls - exactly as specified, all-or-nothing.

- Implements the full SPEC: three-tier block matching (exact, trailing-whitespace, re-indent), unified hunks with create/delete/rename, SEARCH/REPLACE with ambiguity detection, V4A anchored chunks with cursor and moves, and the JSON edit format.
- Public practice set: 100 of 100 checks pass (score 1000), plus 42 additional self-authored regression checks for spec sentences the practice set does not cover.

Layout: `main.ts` is the tool; `runner.ts` and `check.ts` are the contest kit's harness (unmodified). `SPEC.md` is the contest specification.