// mend applies edits as specified in SPEC.md (MIT).
// Node 22 and the standard library alone. Run as `node main.ts [options] [PATCH]`.
//
// In a trial the grader runs `node /bot/main.ts` with MAKEFUN_ENV_URL set, and then this file hands over to runner.ts
// (the last lines below): keep that hand-over and runner.ts as they are, and write the CLI.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

const FORMATS = ['auto', 'unified', 'search-replace', 'v4a', 'json'];

class Exit2 {
  readonly line: string;
  constructor(line: string) {
    this.line = line;
  }
}
class Fail {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path: string) {
    this.code = code;
    this.path = path;
  }
}

const blank = (s: string): boolean => s.trim() === '';

function patchLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

function safe(p: string): boolean {
  return p !== '' && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** The tree as the edits leave it: changed paths in `now` (null: deleted), the rest read from disk. */
class Tree {
  private readonly orig = new Map<string, string | null>();
  readonly now = new Map<string, string | null>();
  readonly moves: [string, string][] = [];
  original(p: string): string | null {
    if (!this.orig.has(p)) {
      let v: string | null = null;
      try {
        if (statSync(p).isFile()) v = readFileSync(p, 'utf8');
      } catch {
        v = null;
      }
      this.orig.set(p, v);
    }
    return this.orig.get(p)!;
  }
  get(p: string): string | null {
    return this.now.has(p) ? this.now.get(p)! : this.original(p);
  }
}

type Edit = (tree: Tree) => void;
type BodyLine = { kind: ' ' | '-' | '+'; text: string; marked?: boolean };

function parseError(index: number): never {
  throw new Exit2(`error: parse ${index + 1}`);
}

function fileLines(text: string) {
  const first = text.indexOf('\n');
  const br = first > 0 && text[first - 1] === '\r' ? '\r\n' : '\n';
  const lines = text === '' ? [] : text.split(br);
  const final = text.endsWith(br);
  if (final) lines.pop();
  return { lines, br, final };
}

function writeLines(lines: string[], br = '\n', final = true): string {
  return lines.length ? lines.join(br) + (final ? br : '') : '';
}

function replaceLines(lines: string[], at: number, count: number, added: string[]): string[] {
  return lines.slice(0, at).concat(added, lines.slice(at + count));
}

const indent = (line: string): string => /^[ \t]*/.exec(line)![0];

function occurrences(lines: string[], old: string[], strict: boolean, start = 0, end = lines.length - old.length) {
  const normalize = [
    (s: string) => s,
    (s: string) => s.replace(/[ \t]+$/, ''),
    (s: string) => s.replace(/[ \t]+$/, '').slice(indent(s).length),
  ];
  for (let tier = 0; tier <= (strict ? 0 : 2); tier++) {
    const key = normalize[tier]!;
    const wanted = old.map(key);
    const positions: number[] = [];
    for (let i = start; i <= end; i++) {
      if (wanted.every((line, j) => line === key(lines[i + j]!))) positions.push(i);
    }
    if (positions.length) return { tier, positions };
  }
  return { tier: 0, positions: [] as number[] };
}

function replacement(lines: string[], at: number, old: string[], body: BodyLine[], tier: number): string[] {
  const prefix = tier === 2 ? indent(old[0]!) : '';
  const actual = tier === 2 ? indent(lines[at]!) : '';
  const result: string[] = [];
  let cursor = at;
  for (const { kind, text } of body) {
    if (kind === ' ') result.push(lines[cursor]!);
    if (kind === '+') {
      result.push(tier === 2 && !blank(text) && text.startsWith(prefix) ? actual + text.slice(prefix.length) : text);
    } else cursor++;
  }
  return result;
}

const oldLines = (body: BodyLine[]) => body.filter((line) => line.kind !== '+').map((line) => line.text);

function bodyLine(line: string): BodyLine | undefined {
  if (line === '' || line.startsWith(' ')) return { kind: ' ', text: line.slice(1) };
  if (line.startsWith('-')) return { kind: '-', text: line.slice(1) };
  if (line.startsWith('+')) return { kind: '+', text: line.slice(1) };
}

function checkPaths(...paths: (string | null)[]) {
  for (const p of paths) if (p !== null && !safe(p)) throw new Fail('unsafe', p);
}

function requireFile(tree: Tree, p: string): string {
  const text = tree.get(p);
  if (text === null) throw new Fail('missing', p);
  return text;
}

function requireAbsent(tree: Tree, p: string) {
  if (tree.get(p) !== null) throw new Fail('exists', p);
}

function searchEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  const markers = lines.map((line) => line.trimEnd());
  let previousPath: string | undefined;
  let afterBlock = 0;
  for (let i = 0; i < lines.length; i++) {
    if (markers[i] !== '<<<<<<< SEARCH') continue;
    let p = previousPath;
    for (let j = i - 1; j >= afterBlock; j--) {
      const candidate = lines[j]!.trim();
      if (candidate === '' || candidate.startsWith('```')) continue;
      p = candidate;
      break;
    }
    const divider = markers.indexOf('=======', i + 1);
    const end = divider < 0 ? -1 : markers.indexOf('>>>>>>> REPLACE', divider + 1);
    if (p === undefined || end < 0) parseError(i);
    const path = p;
    const old = lines.slice(i + 1, divider);
    const added = lines.slice(divider + 1, end);
    const body = added.map((text): BodyLine => ({ kind: '+', text }));
    edits.push((tree) => {
      checkPaths(path);
      if (!old.length) {
        requireAbsent(tree, path);
        tree.now.set(path, writeLines(added));
        return;
      }
      const file = fileLines(requireFile(tree, path));
      const { tier, positions } = occurrences(file.lines, old, strict);
      if (!positions.length) throw new Fail('no-match', path);
      if (positions.length > 1) throw new Fail('ambiguous', path);
      const at = positions[0]!;
      const result = replaceLines(file.lines, at, old.length, replacement(file.lines, at, old, body, tier));
      tree.now.set(path, writeLines(result, file.br, file.final));
    });
    previousPath = path;
    afterBlock = end + 1;
    i = end;
  }
  return edits;
}

type Hunk = { a: number; body: BodyLine[] };
type UnifiedSection = {
  old: string | null;
  next: string | null;
  renameFrom?: string;
  renameTo?: string;
  paired?: boolean;
  create?: boolean;
  remove?: boolean;
  hunks: Hunk[];
};

function moveFile(tree: Tree, old: string, next: string, text: string) {
  tree.now.set(old, null);
  tree.now.set(next, text);
  tree.moves.push([old, next]);
}

function unifiedEdit(section: UnifiedSection, strict: boolean): Edit {
  const old = section.paired ? section.old : section.renameFrom ?? section.old;
  const next = section.paired ? section.next : section.renameTo ?? section.next;
  return (tree) => {
    checkPaths(old, next);
    if (old === null || section.create) {
      const p = next ?? '';
      checkPaths(p);
      requireAbsent(tree, p);
      const added = section.hunks.flatMap(({ body }) => body.filter((line) => line.kind === '+'));
      tree.now.set(p, writeLines(added.map((line) => line.text), '\n', !added.at(-1)?.marked));
      return;
    }
    const before = requireFile(tree, old);
    if (next === null || section.remove) {
      tree.now.set(old, null);
      return;
    }
    if (old !== next) requireAbsent(tree, next);
    const file = fileLines(before);
    let offset = 0;
    for (const { a, body } of section.hunks) {
      const wanted = oldLines(body);
      let at = Math.max(0, Math.min(a + offset, file.lines.length));
      let tier = 0;
      if (wanted.length) {
        const match = occurrences(file.lines, wanted, strict);
        if (!match.positions.length) throw new Fail('no-match', old);
        const target = Math.max(0, Math.min(a - 1 + offset, file.lines.length - wanted.length));
        at = match.positions[0]!;
        for (const position of match.positions) {
          if (Math.abs(position - target) < Math.abs(at - target)) at = position;
        }
        tier = match.tier;
      }
      if (at + wanted.length === file.lines.length) {
        file.final = !body.findLast((line) => line.kind !== '-')?.marked;
      }
      const add = replacement(file.lines, at, wanted, body, tier);
      file.lines = replaceLines(file.lines, at, wanted.length, add);
      offset += add.length - wanted.length;
    }
    const result = writeLines(file.lines, file.br, file.final);
    if (old === next) tree.now.set(old, result);
    else moveFile(tree, old, next, result);
  };
}

function unifiedPath(line: string): string | null {
  const path = line.slice(4).split('\t', 1)[0]!.replace(/^ +| +$/g, '');
  return path === '/dev/null' ? null : path.replace(/^[ab]\//, '');
}

function unifiedEdits(lines: string[], strict: boolean): Edit[] {
  const sections: UnifiedSection[] = [];
  let section: UnifiedSection | undefined;
  let inHeader = false;
  const pairAt = (i: number) => lines[i]?.startsWith('--- ') && lines[i + 1]?.startsWith('+++ ');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^diff --git(?:\s|$)/.test(line)) {
      const git = /^diff --git a\/([\s\S]+) b\/([\s\S]+)$/.exec(line);
      if (!git) parseError(i);
      section = { old: git[1]!, next: git[2]!, hunks: [] };
      sections.push(section);
      inHeader = true;
    } else if (pairAt(i)) {
      if (!section || !inHeader || section.paired) {
        section = { old: null, next: null, hunks: [] };
        sections.push(section);
        inHeader = true;
      }
      section.old = unifiedPath(line);
      section.next = unifiedPath(lines[++i]!);
      section.paired = true;
    } else if (line.startsWith('@@')) {
      const range = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(line);
      if (!range || !section) parseError(i);
      inHeader = false;
      const body: BodyLine[] = [];
      let previous: BodyLine | undefined;
      while (i + 1 < lines.length && !pairAt(i + 1)) {
        const raw = lines[i + 1]!;
        const entry = bodyLine(raw);
        if (entry) body.push(entry);
        else if (raw.startsWith('\\')) {
          if (previous) previous.marked = true;
        } else break;
        previous = entry;
        i++;
      }
      let end = i;
      while (lines[end] === '') {
        body.pop();
        end--;
      }
      section.hunks.push({ a: Number(range[1]), body });
    } else if (section && inHeader) {
      if (line.startsWith('--- ')) parseError(i + 1);
      if (line.startsWith('rename from ')) section.renameFrom = line.slice(12);
      if (line.startsWith('rename to ')) section.renameTo = line.slice(10);
      if (line.startsWith('new file mode')) section.create = true;
      if (line.startsWith('deleted file mode')) section.remove = true;
    }
  }
  return sections.map((s) => unifiedEdit(s, strict));
}

type Chunk = { anchor: string; body: BodyLine[]; eof: boolean };

function v4aUpdate(path: string, next: string | null, chunks: Chunk[], strict: boolean): Edit {
  return (tree) => {
    checkPaths(path, next);
    const file = fileLines(requireFile(tree, path));
    if (next !== null) requireAbsent(tree, next);
    let cursor = 0;
    for (const { anchor, body, eof } of chunks) {
      if (anchor !== '') {
        const at = occurrences(file.lines, [anchor], strict, cursor).positions[0];
        if (at === undefined) throw new Fail('no-match', path);
        cursor = at + 1;
      }
      const old = oldLines(body);
      let at = eof ? file.lines.length : cursor;
      let tier = 0;
      if (old.length) {
        const last = file.lines.length - old.length;
        const match = occurrences(file.lines, old, strict, eof ? Math.max(cursor, last) : cursor, last);
        if (!match.positions.length) throw new Fail('no-match', path);
        at = match.positions[0]!;
        tier = match.tier;
      }
      const add = replacement(file.lines, at, old, body, tier);
      file.lines = replaceLines(file.lines, at, old.length, add);
      cursor = at + add.length;
    }
    const result = writeLines(file.lines, file.br, file.final);
    if (next === null) tree.now.set(path, result);
    else moveFile(tree, path, next, result);
  };
}

function v4aEdits(lines: string[], strict: boolean): Edit[] {
  const first = lines.findIndex((line) => !blank(line));
  if (first < 0 || lines[first]!.trim() !== '*** Begin Patch') parseError(Math.max(first, 0));
  const last = lines.findLastIndex((line) => !blank(line));
  if (lines[last]!.trim() !== '*** End Patch') parseError(lines.length);
  const edits: Edit[] = [];
  const header = /^\*\*\* (Add|Delete|Update) File: /;
  let i = first + 1;
  while (i < last) {
    if (blank(lines[i]!)) {
      i++;
      continue;
    }
    const sectionStart = i;
    const match = header.exec(lines[i]!);
    if (!match) parseError(i);
    const path = lines[i]!.slice(match[0].length).replace(/^ +| +$/g, '');
    const start = ++i;
    while (i < last && !header.test(lines[i]!)) i++;
    let end = i;
    while (end > start && blank(lines[end - 1]!)) end--;
    if (match[1] === 'Add') {
      const added: string[] = [];
      for (let j = start; j < end; j++) {
        const line = lines[j]!;
        if (line !== '' && !line.startsWith('+')) parseError(j);
        added.push(line.slice(1));
      }
      edits.push((tree) => {
        checkPaths(path);
        requireAbsent(tree, path);
        tree.now.set(path, writeLines(added));
      });
    } else if (match[1] === 'Delete') {
      if (start !== end) parseError(start);
      edits.push((tree) => {
        checkPaths(path);
        requireFile(tree, path);
        tree.now.set(path, null);
      });
    } else {
      let j = start;
      let next: string | null = null;
      if (j < end && lines[j]!.startsWith('*** Move to: ')) next = lines[j++]!.slice(13).replace(/^ +| +$/g, '');
      const chunks: Chunk[] = [];
      let chunk: Chunk | undefined;
      for (; j < end; j++) {
        const line = lines[j]!;
        if (line.startsWith('@@')) {
          chunk = { anchor: line.slice(2).trim(), body: [], eof: false };
          chunks.push(chunk);
        } else if (line === '*** End of File' && chunk) {
          chunk.eof = true;
          chunk = undefined;
        } else {
          const entry = bodyLine(line);
          if (!entry) parseError(j);
          if (!chunk) {
            if (chunks.length) parseError(j);
            chunk = { anchor: '', body: [], eof: false };
            chunks.push(chunk);
          }
          chunk.body.push(entry);
        }
      }
      if (!chunks.length && next === null) parseError(sectionStart);
      edits.push(v4aUpdate(path, next, chunks, strict));
    }
  }
  return edits;
}

function detect(lines: string[]): string | null {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) return null;
  if (lines[first]!.trim() === '*** Begin Patch') return 'v4a';
  const c = lines[first]!.trimStart()[0];
  if (c === '[' || c === '{') return 'json';
  if (lines.some((l) => l.trimEnd() === '<<<<<<< SEARCH')) return 'search-replace';
  if (lines.some((l, i) => l.startsWith('diff --git ') || (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')))) return 'unified';
  return null;
}

/** One JSON edit object (SPEC.md section 9), or null when it is not one. */
function jsonEdit(v: unknown): Edit | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const p = o.path;
  if (typeof p !== 'string') return null;
  const exists = (tree: Tree): string => {
    if (!safe(p)) throw new Fail('unsafe', p);
    const t = tree.get(p);
    if (t === null) throw new Fail('missing', p);
    return t;
  };
  if (o.command === 'create' && typeof o.file_text === 'string') {
    const text = o.file_text;
    return (tree) => {
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
      tree.now.set(p, text);
    };
  }
  if (o.command === 'str_replace' && typeof o.old_str === 'string' && o.old_str !== '' && (o.new_str === undefined || typeof o.new_str === 'string')) {
    const oldStr = o.old_str;
    const newStr = (o.new_str as string | undefined) ?? '';
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const crlf = nl > 0 && before[nl - 1] === '\r';
      const lf = (s: string): string => (crlf ? s.replaceAll('\r\n', '\n') : s);
      const t = lf(before);
      const old = lf(oldStr);
      let count = 0;
      for (let k = t.indexOf(old); k >= 0; k = t.indexOf(old, k + 1)) count += 1;
      if (count === 0) throw new Fail('no-match', p);
      if (count > 1) throw new Fail('ambiguous', p);
      const at = t.indexOf(old);
      const out = t.slice(0, at) + lf(newStr) + t.slice(at + old.length);
      tree.now.set(p, crlf ? out.replaceAll('\n', '\r\n') : out);
    };
  }
  if (o.command === 'insert' && typeof o.insert_line === 'number' && Number.isInteger(o.insert_line) && typeof o.new_str === 'string') {
    const line = o.insert_line;
    const add = patchLines(o.new_str);
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const br = nl > 0 && before[nl - 1] === '\r' ? '\r\n' : '\n';
      const lines = before === '' ? [] : before.split(br);
      const final = before !== '' && before.endsWith(br);
      if (final) lines.pop();
      if (line < 0 || line > lines.length) throw new Fail('no-match', p);
      lines.splice(line, 0, ...add);
      tree.now.set(p, lines.length === 0 ? '' : lines.join(br) + (final ? br : ''));
    };
  }
  return null;
}

function jsonEdits(text: string, lines: string[]): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  const edits: Edit[] = [];
  if (lines[first]!.trimStart().startsWith('[')) {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Exit2(`error: parse ${first + 1}`);
    }
    if (!Array.isArray(v)) throw new Exit2(`error: parse ${first + 1}`);
    for (const x of v) {
      const e = jsonEdit(x);
      if (e === null) throw new Exit2(`error: parse ${first + 1}`);
      edits.push(e);
    }
    return edits;
  }
  lines.forEach((l, i) => {
    if (blank(l)) return;
    let e: Edit | null = null;
    try {
      e = jsonEdit(JSON.parse(l));
    } catch {
      e = null;
    }
    if (e === null) throw new Exit2(`error: parse ${i + 1}`);
    edits.push(e);
  });
  return edits;
}

function run(args: string[]): { code: number; out: string[] } {
  let format: string | null = null;
  let check = false;
  let strict = false;
  const pos: string[] = [];
  let ended = false;
  for (const a of args) {
    if (!ended && a === '--') ended = true;
    else if (!ended && a.startsWith('-') && a !== '-') {
      if (a.startsWith('--format=') && format === null && FORMATS.includes(a.slice(9))) format = a.slice(9);
      else if (a === '--check' && !check) check = true;
      else if (a === '--strict' && !strict) strict = true;
      else return { code: 2, out: ['error: usage'] };
    } else pos.push(a);
  }
  if (pos.length > 1) return { code: 2, out: ['error: usage'] };
  const file = pos.length === 0 || pos[0] === '-' ? null : pos[0]!;
  let text = '';
  try {
    text = readFileSync(file ?? 0, 'utf8');
  } catch {
    if (file !== null) return { code: 2, out: ['error: no-patch'] };
  }
  const lines = patchLines(text);
  const kind = format === null || format === 'auto' ? detect(lines) : format;
  if (kind === null) return { code: 2, out: ['error: format'] };
  let edits: Edit[];
  try {
    if (kind === 'json') edits = jsonEdits(text, lines);
    else if (kind === 'unified') edits = unifiedEdits(lines, strict);
    else if (kind === 'search-replace') edits = searchEdits(lines, strict);
    else edits = v4aEdits(lines, strict);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const rows: string[] = [];
  const movedFrom = new Set<string>();
  const movedTo = new Map<string, string>();
  for (const [old, next] of tree.moves) {
    if (tree.original(old) !== null && tree.now.get(old) === null &&
        tree.original(next) === null && tree.now.get(next) != null &&
        !movedFrom.has(old) && !movedTo.has(next)) {
      movedFrom.add(old);
      movedTo.set(next, old);
    }
  }
  for (const p of [...tree.now.keys()].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))) {
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    const from = movedTo.get(p);
    if (from !== undefined) rows.push(`R ${from} -> ${p}`);
    else if (!movedFrom.has(p)) rows.push(`${was === null ? 'A' : now === null ? 'D' : 'M'} ${p}`);
    if (check) continue;
    if (now === null) rmSync(p, { force: true });
    else {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, now);
    }
  }
  return { code: 0, out: [...rows, `ok: ${rows.length} ${rows.length === 1 ? 'file' : 'files'}`] };
}


const trialEnv = process.env.MAKEFUN_ENV_URL;
if (trialEnv !== undefined && trialEnv !== '') {
  // A trial: the kit's runner reads the checks from the env and runs this file on each one, without this variable.
  const { runTrial } = await import('./runner.ts');
  await runTrial(trialEnv);
} else {
  const r = run(process.argv.slice(2));
  writeSync(1, r.out.map((l) => `${l}\n`).join(''));
  process.exitCode = r.code;
}
