# mend results

The final public practice run passed **100 of 100 checks**, for a **practice score of 1000**. The additional regression suite passed **42 of 42 checks**. Both ran with Node 22.23.4 and the kit's runner, comparing exit codes, stdout, and final file contents.

Run these commands from the workspace in PowerShell, with `$kit` set to the unpacked kit directory.

```powershell
$env:TMP = $PWD.Path
$env:TEMP = $PWD.Path
node check.ts "$kit/program/generator/practice.json"
node extra-checks.ts
```

## Implementation

- Section 5 implements exact, trailing-whitespace, and leading-and-trailing-whitespace matching, with strict mode, context preservation, and tier-2 indentation transfer.
- Section 6 reads unified sections and hunks, handles Git metadata and path precedence, places hunks using the adjusted old position, and applies the final line-break rules.
- Section 7 reads SEARCH/REPLACE blocks, resolves explicit and inherited paths, and detects ambiguity at the first matching tier.
- Section 8 reads V4A sections and applies anchored chunks with a forward cursor, EOF constraints, and optional moves.
- The existing CLI stages edits and reports failures before writing. Move reporting uses the final source and destination states and sorts the row by destination. The trial handover remains intact and `runner.ts` matches the kit copy byte for byte.

## Spec readings

- Unified deletions validate hunk syntax during parsing and skip hunk matching during application. This applies the unconditional malformed-header rule and the deletion rule at their respective stages.
- Empty-old unified insertions with a negative adjusted position go at the top. Positions beyond the line count go at the end. Bounding the nearest-match target to the feasible interval also avoids distance rounding on oversized coordinates.
- An EOF-marked V4A chunk restricts the eligible match positions before comparing tiers. An exact match earlier in the file therefore leaves a weaker tail match eligible.
- A V4A section's trailing whitespace-only lines are discarded. Interior empty lines keep their format-defined meaning. After an EOF marker, a subsequent chunk needs an `@@` header.
- Move rows represent recorded moves whose actual endpoints meet the before-and-after conditions in section 2. If multiple moves qualify for the same output pair endpoint, the first qualifying move in patch order takes that endpoint.

## Additional checks

`extra-checks.ts` covers variants and interactions absent from, or less directly exercised by, the public fixtures.

- Unified checks cover rename metadata without paired headers, mode-only creation and deletion, tab-delimited header metadata, a hunk ending at the next header, malformed headers and their line numbers, top and EOF insertion, adjusted nearest ties, an oversized coordinate, newline markers on context and deleted lines, and rollback after an earlier hunk succeeds.
- Matching and SEARCH/REPLACE checks cover tier priority, overlapping occurrences, mixed tab and space prefixes, preservation of context and whitespace-only additions, trailing marker whitespace, path inheritance through fences, and a missing first path.
- V4A checks cover a stronger anchor after a weaker one, weaker matching restricted to EOF, empty-old EOF insertion, cursor movement past newly written lines, multiple chunks in a move, a move with no chunks, staged destination edits, blank lines, and invalid section bodies.
- CLI and tree checks cover syntax errors before unsafe edits, safety before existence, JSON array fault location and overlapping text, arguments after `--`, duplicate flags, atomic failure under `--check`, UTF-8 output sorting, move reporting when a source is recreated, and edits whose combined effect restores the original bytes.
- A 140,000-line insertion verifies that line replacement does not rely on spreading the replacement lines into function arguments.

The sealed scored checks were unavailable during local verification.
