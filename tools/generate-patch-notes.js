const { execSync } = require('child_process');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const path = require('path');

function safeExec(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch (err) {
    return '';
  }
}

function main() {
  const repoRoot = process.cwd();
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const version = pkg.version || '0.0.0';
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);

  const lastTag = safeExec('git describe --tags --abbrev=0');
  const range = lastTag ? `${lastTag}..HEAD` : '';
  const logCmd = range ? `git log ${range} --pretty=format:"- %s"` : 'git log -n 20 --pretty=format:"- %s"';
  const raw = safeExec(logCmd);
  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const entries = lines.length ? lines.join('\n') : '- No commits recorded.';

  const header = `## v${version} (${dateStr})\n`;
  const body = `${header}${entries}\n\n`;

  const changelogPath = path.join(repoRoot, 'CHANGELOG.md');
  const prev = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : '# Changelog\n\n';
  const next = prev.endsWith('\n') ? prev + body : prev + '\n' + body;
  writeFileSync(changelogPath, next, 'utf8');
  console.log(`Updated CHANGELOG with v${version} entries.`);
}

main();
