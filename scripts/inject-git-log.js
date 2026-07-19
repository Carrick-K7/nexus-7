/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

let gitLogRaw;
try {
  gitLogRaw = execSync(
    'git log --format=%H%n%ai%n%s%n%b---END---',
    {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }
  );
} catch {
  gitLogRaw = '';
}

function parseTrigger(subject) {
  const key = subject.split(':')[0].toLowerCase();
  if (key === 'fix') return 'bug';
  if (key === 'feat') return 'enhancement';
  if (key === 'test') return 'test';
  return 'observation';
}

const gitEntries = gitLogRaw
  .split('---END---')
  .map(block => block.trim())
  .filter(block => block.length > 0)
  .map(block => {
    const lines = block.split('\n');
    const hash = lines[0] || '';
    const date = (lines[1] || '').slice(0, 10);
    const subject = lines[2] || '';
    const body = lines.slice(3).join(' ').slice(0, 200);
    const versionMatch = subject.match(/\bv([\d.]+)/i);

    return {
      id: hash.slice(0, 8),
      version: versionMatch?.[1] || 'unreleased',
      date,
      trigger: parseTrigger(subject),
      triggerReason: subject,
      action: body || subject,
      outcome: 'See git log',
      metrics: [],
    };
  })
  .filter(entry => entry.id && entry.triggerReason);

const manifestDir = path.resolve(repoRoot, 'iterations');
const manifestEntries = fs.existsSync(manifestDir)
  ? fs.readdirSync(manifestDir)
      .filter(fileName => fileName.endsWith('.json'))
      .map(fileName => {
        try {
          const entry = JSON.parse(
            fs.readFileSync(path.join(manifestDir, fileName), 'utf-8')
          );
          return { ...entry, source: 'manifest' };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.version.localeCompare(left.version, undefined, { numeric: true }))
  : [];

const manifestVersions = new Set(manifestEntries.map(entry => entry.version));
const entries = [
  ...manifestEntries,
  ...gitEntries
    .filter(entry => !manifestVersions.has(entry.version))
    .map(entry => ({ ...entry, source: 'git' })),
];

const outDir = path.resolve(repoRoot, 'public', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'iteration-manifests.json'),
  JSON.stringify(entries, null, 2)
);
console.log(
  `Wrote ${manifestEntries.length} manifests and ${gitEntries.length} git entries to public/data/iteration-manifests.json`
);
