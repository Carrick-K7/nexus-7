import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const vendor = import.meta.dirname;
const app = path.resolve(vendor, '../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-braces-proof-'));
const require = createRequire(import.meta.url);
const provenance = JSON.parse(fs.readFileSync(path.join(vendor, 'UPSTREAM.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(vendor, 'MANIFEST.json')));
const originalPath = path.join(root, 'upstream/package');
const forkPath = path.join(root, 'fork/package');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal('sha512-' + createHash('sha512').update(fs.readFileSync(path.join(vendor, 'upstream.tgz'))).digest('base64'), provenance.dist.integrity);
assert.equal(sha256(fs.readFileSync(path.join(vendor, 'fork.tgz'))), manifest.archiveSha256);
for (const name of ['upstream', 'fork']) {
 const dest = path.join(root, name); fs.mkdirSync(dest);
 const unpack = spawnSync('tar', ['-xzf', path.join(vendor, name + '.tgz'), '-C', dest], { encoding:'utf8', timeout:5000 });
 assert.equal(unpack.status, 0, unpack.stderr);
 fs.symlinkSync(path.join(app, 'node_modules'), path.join(dest, 'package/node_modules'), 'dir');
}
for (const file of provenance.files) assert.equal(sha256(fs.readFileSync(path.join(originalPath,file.path))), file.sha256);
for (const [name, digest] of Object.entries(manifest.files)) {
 assert.equal(sha256(fs.readFileSync(path.join(forkPath,name))), digest);
 assert.equal(sha256(fs.readFileSync(path.join(app,'node_modules/braces',name))), digest);
}
const original = require(originalPath);
const fork = require(path.join(app, 'node_modules/braces'));
const changed = provenance.files.filter(file => sha256(fs.readFileSync(path.join(forkPath, file.path))) !== file.sha256).map(file => file.path).sort();
assert.deepEqual(changed, ['lib/compile.js', 'lib/expand.js', 'lib/parse.js', 'lib/stringify.js', 'package.json']);

const patterns = [
 '', 'plain', '{}', '{a}', '{a,b}', '{a,a,b}', '{,a,}', 'a/{b,}/{c,}/*', '{a,{b,c}}', '{{a,b},{a,c}}',
 '{1..3}', '{3..1}', '{1..7..2}', '{7..1..-2}', '{01..04}', '{-03..02}', '{a..e..2}', '{a..c}',
 'x${a,b}', String.raw`x\{a,b\}`, String.raw`x{a\,b,c}`, String.raw`x{a,b}\*`,
 '[{a,b}]', '"{a,b}"', "'{a,b}'", '`{a,b}`', '{1..1000}', '{1..1001}', '{1..1001..2}',
 '{1..1000}{a,b}', String.raw`\{1..1001\}`, '[{1..1001}]', '{a},b}', 'apps/!(ignored)',
 'a{b', 'a}b', '(a|b)', '({a,b})', 'a\\b/{c,d}', 'p/{-2..2}/{x,y}', '{000..010..5}',
 '{'.repeat(64) + 'x,y' + '}'.repeat(64), '('.repeat(64) + '{a,b}' + ')'.repeat(64),
 '"' + '{'.repeat(2000) + 'x' + '}'.repeat(2000) + '"',
 '[' + '{'.repeat(2000) + 'x' + '}'.repeat(2000) + ']',
];
const options = [{}, { nodupes: true }, { noempty: true }, { keepQuotes: true }, { keepEscaping: true },
 { escapeInvalid: true }, { rangeLimit: 5 }, { rangeLimit: false }];
const normal = [];
const serialize = value => JSON.stringify(value, (key, member) => key === 'parent' || key === 'prev' ? undefined : member);
function result(fn) {
 try { return { kind: 'return', value: serialize(fn()) }; }
 catch (error) { return { kind: 'error', name: error.name, message: error.message }; }
}
for (const pattern of patterns) for (const opts of options) for (const method of ['parse', 'compile', 'expand', 'stringify']) {
 const before = result(() => original[method](pattern, { ...opts }));
 const after = result(() => fork[method](pattern, { ...opts }));
 assert.deepEqual(after, before, `${method} ${JSON.stringify(pattern.slice(0, 100))} ${JSON.stringify(opts)}`);
 normal.push({ method, patternLength: pattern.length, options: opts, matched: true });
}
for (const opts of [{}, { expand: true }, { expand: true, nodupes: true }]) {
 assert.deepEqual(fork(['a/{b,c}', 'a/{b,c}'], opts), original(['a/{b,c}', 'a/{b,c}'], opts));
}
for (const method of ['compile', 'expand', 'stringify']) {
 const shared = () => { const leaf = { type: 'text', value: 'a' }; return { type: 'root', nodes: [leaf, leaf] }; };
 assert.deepEqual(fork[method](shared()), original[method](shared()));
}

const childCode = String.raw`
const braces = require(process.argv[1]);
const method = process.argv[2], kind = process.argv[3];
let input, options = {};
if (kind === 'brace' || kind === 'override') {
 input = '{'.repeat(4500) + 'x' + '}'.repeat(4500);
 if (kind === 'override') options = { maxLength: 1e9, maxDepth: Infinity, rangeLimit: false };
} else if (kind === 'paren') input = '('.repeat(4500) + 'x' + ')'.repeat(4500);
else if (kind === 'ast') {
 input = { type: 'text', value: 'x' };
 for (let i=0;i<12000;i++) input = { type: 'root', nodes: [input] };
} else { input = { type: 'root', nodes: [] }; input.nodes.push(input); }
try {
 const value = method === 'main' ? braces(input, options) : braces[method](input, options);
 process.stdout.write(JSON.stringify({ kind:'returned', resultType:typeof value }));
} catch (error) {
 process.stdout.write(JSON.stringify({ kind:'rejected', name:error.name, message:error.message }));
}
`;
function probe(modulePath, method, kind) {
 const child = spawnSync(process.execPath, ['--max-old-space-size=128', ...(kind === 'brace' ? ['--stack_size=512'] : []), '-e', childCode, modulePath, method, kind], {
  encoding: 'utf8', timeout: 5000, maxBuffer: 64 * 1024,
  env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: path.join(root, 'home'), NODE_ENV: 'test' },
 });
 assert.equal(child.error, undefined, `${method}/${kind}: child failure ${child.error}`);
 assert.equal(child.signal, null, `${method}/${kind}: child signal ${child.signal}`);
 assert.equal(child.status, 0, child.stderr);
 return JSON.parse(child.stdout);
}
const security = [];
for (const method of ['main', 'compile', 'expand']) {
 const before = probe(originalPath, method, 'brace');
 assert.equal(before.name, 'RangeError');
 assert.match(before.message, /Maximum call stack size exceeded/);
 const after = probe(forkPath, method, 'brace');
 assert.equal(after.name, 'SyntaxError'); assert.match(after.message, /safe depth of 128/);
 security.push({ method, kind: 'brace-under-character-cap', stackSizeKiB:512, before, after });
}
for (const method of ['compile', 'expand', 'stringify']) for (const kind of ['ast', 'cycle', 'paren', 'override']) {
 const after = probe(forkPath, method, kind);
 assert.equal(after.name, 'SyntaxError');
 assert.match(after.message, kind === 'cycle' ? /acyclic tree/ : /safe depth of 128/);
 const before = ['ast', 'cycle'].includes(kind) ? probe(originalPath, method, kind) : undefined;
 if (before) { assert.equal(before.name, 'RangeError'); assert.match(before.message, /Maximum call stack size exceeded/); }
 security.push({ method, kind, before, after });
}

const boundaries = [];
function ast(depth) { let value = { type: 'text', value: 'x' }; for (let i=0;i<depth;i++) value={type:'root',nodes:[value]}; return value; }
for (const [open, close] of [['{','}'], ['(',')']]) {
 const pattern = depth => open.repeat(depth) + 'x' + close.repeat(depth);
 assert.doesNotThrow(() => fork.parse(pattern(128)));
 assert.throws(() => fork.parse(pattern(129)), /safe depth of 128/);
 for (const method of ['compile','expand','stringify']) {
  assert.doesNotThrow(() => fork[method](pattern(127)));
  assert.throws(() => fork[method](pattern(128)), /safe depth of 128/);
  boundaries.push({ method, open, parsedPatternAccepted:127, parsedPatternRejected:128 });
 }
}
for (const method of ['compile','expand','stringify']) {
 assert.doesNotThrow(() => fork[method](ast(128)));
 assert.throws(() => fork[method](ast(129)), /safe depth of 128/);
 boundaries.push({ method, directAstAcceptedEdges:128, directAstRejectedEdges:129 });
}
assert.throws(() => fork.expand('{1..1001}'), /range limit/);
assert.equal(fork.expand('{1..1001}', { rangeLimit: false }).length, 1001);
assert.equal(fork.expand('{1..1000}{a,b}').length, 2000);
assert.throws(() => fork.parse('x'.repeat(10001)), /exceeds max characters/);

const report = { source:'braces3.0.3 verified npm archive', referencePR:88,
 referenceCommit:'a795ee83ecd011131b2d618fe754ac5a8e124dae', referenceMerged:false,
 runtimeGuardMatchesPR:true, changedOriginalFiles:changed,
 normalDifferentialCases:normal.length, additionalArrayAndSharedDAGCases:6,
 securityCases:security.length, boundaries,
 originalRangeLimitUnchanged:true, noSilentTruncation:true, node:process.version,
 security, normal };
// Only remove the exact mkdtemp directory created by this verification process.
assert.equal(path.dirname(root), os.tmpdir());
assert.ok(path.basename(root).startsWith('nexus-braces-proof-'));
fs.rmSync(root, { recursive:true });
console.log(JSON.stringify({ ...report, normal:undefined },null,2));
