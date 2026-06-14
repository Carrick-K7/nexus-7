/* eslint-disable @typescript-eslint/no-require-imports */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

let gitLogRaw;
try {
  gitLogRaw = execSync(
    'git log --format=%H%n%ai%n%s%n%b---END---',
    { cwd: repoRoot, encoding: 'utf-8' }
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

const entries = gitLogRaw
  .split('---END---')
  .filter(Boolean)
  .map(block => {
    const lines = block.trim().split('\n');
    const hash = lines[0] || '';
    const date = (lines[1] || '').slice(0, 10);
    const subject = lines[2] || '';
    const body = lines.slice(3).join(' ').slice(0, 200);

    return {
      id: hash.slice(0, 8),
      version: (subject.match(/v[\d.]+/) || [])[0] || 'unreleased',
      date,
      trigger: parseTrigger(subject),
      triggerReason: subject,
      action: body || subject,
      outcome: 'See git log',
      metrics: [],
    };
  });

const outDir = path.resolve(repoRoot, 'public', 'data');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, 'git-log.json'),
  JSON.stringify(entries, null, 2)
);
console.log(`Wrote ${entries.length} git log entries to public/data/git-log.json`);
