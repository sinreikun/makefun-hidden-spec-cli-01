import { deepStrictEqual } from 'node:assert/strict';
import { runCheck } from './runner.ts';

const patch = (...lines: string[]) => lines.join('\n') + '\n';
const unified = (p: string, ...lines: string[]) => patch(`--- a/${p}`, `+++ b/${p}`, ...lines);
const v4a = (...lines: string[]) => patch('*** Begin Patch', ...lines, '*** End Patch');
const update = (...lines: string[]) => v4a('*** Update File: f', ...lines);
const search = (...lines: string[]) => patch('f', '<<<<<<< SEARCH', ...lines, '>>>>>>> REPLACE');

let passed = 0;
let total = 0;
function check(id: string, stdin: string, files: Record<string, string>, stdout: string,
    after = files, argv: string[] = [], exit = 0) {
  total++;
  try {
    deepStrictEqual(runCheck({ id, argv, stdin, files }), { id, exit, stdout, files: after });
    passed++;
  } catch (error) {
    console.error(id, error);
  }
}

const modified = patch('M f', 'ok: 1 file');
const noMatch = patch('error: no-match f', 'failed: 1 of 1 edits');
const parse = (line: number) => patch(`error: parse ${line}`);

check('rename metadata overrides Git defaults', patch('diff --git a/unused b/unused', 'rename from old name',
  'rename to z/new name'), { 'old name': 'x' }, patch('R old name -> z/new name', 'ok: 1 file'), { 'z/new name': 'x' });
check('adjacent file headers terminate hunk and drop trailing raw empty line',
  unified('f', '@@ -1 +1 @@ title', '-x', '+y', '') + unified('g', '@@ -1 +1 @@', '-x', '+z'),
  { f: 'x', g: 'x\n' }, patch('M f', 'M g', 'ok: 2 files'), { f: 'y\n', g: 'z\n' });
check('mode-only creation and deletion with unmatchable old text', patch('diff --git a/f b/f', 'new file mode 100644',
  '@@ -0,777 +1,888 @@', ' ignored context', '+z', '\\ marker', 'diff --git a/g b/g',
  'deleted file mode 100644', '@@ -1 +0 @@', '-wrong'), { g: 'original' },
  patch('A f', 'D g', 'ok: 2 files'), { f: 'z' });
check('header path prefix, spaces and tab metadata', patch('---  b/space name  \told timestamp',
  '+++  a/space name  \tnew timestamp', '@@ -1 +1 @@', '-x', '+y'),
  { 'space name': 'x\n' }, patch('M space name', 'ok: 1 file'), { 'space name': 'y\n' });
check('unpaired old header reports next line including past EOF', patch('diff --git a/f b/f', '--- a/f'),
  {}, parse(3), {}, [], 2);
check('malformed Git header', patch('prose', 'diff --git a/f wrong/f'), {}, parse(2), {}, [], 2);
check('hunk before a section', patch('prose', '@@ -1 +1 @@', '-x', '+y'), {}, parse(2), {}, ['--format=unified'], 2);
check('empty-old top, negative adjusted position and oversized EOF insertion', unified('f',
  '@@ -1 +0 @@', '-drop', '@@ -0,0 +1 @@', '+top', '@@ -999,0 +999 @@', '+last', '\\ marker'),
  { f: 'drop\nkeep' }, modified, { f: 'top\nkeep\nlast' });
check('unified nearest tie after positive offset', unified('f', '@@ -0,0 +1 @@', '+top',
  '@@ -2 +2 @@', '-same', '+first'), { f: 'same\nmiddle\nsame\n' }, modified, { f: 'top\nfirst\nmiddle\nsame\n' });
check('very large unified coordinate still chooses nearest', unified('f', '@@ -999999999999999999999 +1 @@',
  '-same', '+last'), { f: 'same\nsame\n' }, modified, { f: 'same\nlast\n' });
check('stronger tier beats nearer occurrence', unified('f', '@@ -1 +1 @@', '-same', '+last'),
  { f: 'same \nsame\n' }, modified, { f: 'same \nlast\n' });
check('context marker controls EOF even with a later removed line', unified('f', '@@ -1,2 +1 @@',
  ' keep', '\\ context marker', '-drop'), { f: 'keep\ndrop\n' }, modified, { f: 'keep' });
check('old marker does not control output and non-EOF new marker does not change final break',
  unified('f', '@@ -1 +1 @@', '-before', '+first', '\\ new marker', '@@ -2 +2 @@', '-last', '\\ old marker', '+end'),
  { f: 'before\nlast' }, modified, { f: 'first\nend\n' });
check('tier 2 replaces only the first old indent prefix and preserves context',
  unified('f', '@@ -1,2 +1,5 @@', '  \tcontext ', '-  \told', '+ \t\tchild', '+ short', '+ \t', '+'),
  { f: '\t context\t\r\n\told\r\n' }, modified, { f: '\t context\t\r\n\t \tchild\r\n short\r\n \t\r\n\r\n' });
check('tier 2 with empty patch indentation prefixes only nonblank added lines',
  search('old', '=======', 'new', '\tchild', '\t ', ''),
  { f: '  old\n' }, modified, { f: '  new\n  \tchild\n\t \n\n' });
check('SEARCH overlapping candidates are ambiguous', search('a', 'a', '=======', 'b'),
  { f: 'a\na\na\n' }, patch('error: ambiguous f', 'failed: 1 of 1 edits'), undefined, [], 1);
check('SEARCH trailing marker whitespace and inherited path across fences',
  patch('unused', ' f ', '  ```diff', '<<<<<<< SEARCH\t', 'old', '======= ', 'mid', '>>>>>>> REPLACE\t',
    '```', '', '<<<<<<< SEARCH', 'mid', '=======', 'new', '>>>>>>> REPLACE'),
  { f: 'old' }, modified, { f: 'new' });
check('SEARCH first path missing', patch(' ```diff', '<<<<<<< SEARCH', 'x', '=======', 'y', '>>>>>>> REPLACE'),
  {}, parse(2), {}, [], 2);
check('anchor tier outranks earlier weaker anchor and EOF tier is restricted to tail',
  update('@@ anchor', '+inserted', '@@', '-target', '+tail', '*** End of File'),
  { f: ' anchor\nwrong\nanchor\ntarget\n target ' }, modified, { f: ' anchor\nwrong\nanchor\ninserted\ntarget\n tail' });
check('EOF empty-old ignores cursor insertion position', update('@@ anchor', '+end', '*** End of File'),
  { f: 'anchor\nlast' }, modified, { f: 'anchor\nlast\nend' });
check('cursor skips replacement lines and anchor only advances it', update('@@', '-old', '+same', '+same', '@@ same',
  '@@', '-same', '+end'), { f: 'old\nsame\nsame' }, modified, { f: 'same\nsame\nsame\nend' });
check('Move to with multiple chunks and staged destination update', v4a('*** Update File: f', '*** Move to: z',
  '-first', '+next', '@@', '-last', '+done', '*** Update File: z', '-done', '+final'),
  { f: 'first\nlast' }, patch('R f -> z', 'ok: 1 file'), { z: 'next\nfinal' });
check('Move to with no chunks preserves source bytes', update('*** Move to: z'),
  { f: 'x\r\ny' }, patch('R f -> z', 'ok: 1 file'), { z: 'x\r\ny' });
check('destination safety precedes missing source', update('*** Move to: ../z'), {},
  patch('error: unsafe ../z', 'failed: 1 of 1 edits'), {}, [], 1);
check('failed chunk rolls back while successful edits remain staged under check', v4a('*** Add File: f', '+old',
  '*** Update File: f', '-old', '+leak', '@@', '-missing', '+other',
  '*** Update File: f', '-old', '+ok', '*** Delete File: missing'), {},
  patch('error: no-match f', 'error: missing missing', 'failed: 2 of 4 edits'), {}, ['--check'], 1);
check('V4A add keeps interior blank and strips trailing blank lines', patch('', ' *** Begin Patch  ',
  '*** Add File: f', '+x', '', '+y', '  ', ' *** End Patch ', ''), {},
  patch('A f', 'ok: 1 file'), { f: 'x\n\ny\n' });
check('V4A delete rejects body', v4a('*** Delete File: f', '', '+bad'), { f: 'x' }, parse(3), undefined, [], 2);
check('V4A update requires move or chunk', update(''), { f: 'x' }, parse(2), undefined, [], 2);
check('JSON Lines invalid syntax wins over earlier unsafe edit',
  patch('{"command":"create","path":"../out","file_text":"x"}', '', '{ invalid'), {}, parse(3), {}, [], 2);
check('JSON array fault points at array start', patch('', ' [', '{"command":"create","path":"f"}', ']'),
  {}, parse(2), {}, [], 2);
check('JSON overlapping substring matches', patch('{"command":"str_replace","path":"f","old_str":"aa"}'),
  { f: 'aaa' }, patch('error: ambiguous f', 'failed: 1 of 1 edits'), undefined, [], 1);
check('JSON create is byte-for-byte and omitted new_str deletes exactly', patch(
  '{"command":"create","path":"f","file_text":"a\\r\\nb"}',
  '{"command":"str_replace","path":"f","old_str":"b"}'), {}, patch('A f', 'ok: 1 file'), { f: 'a\r\n' });
check('usage after option terminator beats missing patch', '', {}, patch('error: usage'), {}, ['--', '--check', '-'], 2);
check('option-looking filename after terminator', '', { '--check': search('x', '=======', 'y'), f: 'x' },
  modified, { '--check': search('x', '=======', 'y'), f: 'y' }, ['--', '--check']);
check('duplicate flag beats patch read', '', {}, patch('error: usage'), {}, ['missing', '--strict', '--strict'], 2);
check('two edits restore original bytes', search('x', '=======', 'y') + search('y', '=======', 'x'),
  { f: 'x' }, patch('ok: 0 files'));
check('UTF-8 output order with supplementary characters', v4a('*** Add File: 😀', '+x', '*** Add File: \uE000', '+y'),
  {}, patch('A \uE000', 'A 😀', 'ok: 2 files'), { '😀': 'x\n', '\uE000': 'y\n' });
check('large insertion is within the line grammar', unified('f', '@@ -0,0 +1 @@') + '+x\n'.repeat(140_000),
  { f: 'tail' }, modified, { f: 'x\n'.repeat(140_000) + 'tail' });
check('move whose source is recreated reports ordinary changes', v4a('*** Update File: f', '*** Move to: z',
  '*** Add File: f', '+new'), { f: 'old' }, patch('M f', 'A z', 'ok: 2 files'), { f: 'new\n', z: 'old' });
check('move sorts by destination rather than source', v4a('*** Update File: a', '*** Move to: z',
  '*** Update File: f', '-x', '+y'), { a: 'old', f: 'x' },
  patch('M f', 'R a -> z', 'ok: 2 files'), { f: 'y', z: 'old' });
check('unified failure rolls back section before following edit', unified('f', '@@ -1 +1 @@', '-old', '+leak',
  '@@ -1 +1 @@', '-gone', '+bad') + unified('f', '@@ -1 +1 @@', '-old', '+staged'),
  { f: 'old' }, patch('error: no-match f', 'failed: 1 of 2 edits'), undefined, [], 1);
check('deleting all lines writes zero bytes', unified('f', '@@ -1 +0 @@', '-only'),
  { f: 'only\r\n' }, modified, { f: '' });

console.log(`${passed} of ${total} extra checks passed`);
if (passed !== total) process.exitCode = 1;
