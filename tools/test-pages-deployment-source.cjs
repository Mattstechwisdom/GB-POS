const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'pages.yml'), 'utf8');
assert.doesNotMatch(workflow, /tags:\s*\['v\*'\]/, 'Protected GitHub Pages must not deploy from release tags.');
assert.match(workflow, /branches:\s*\[main\]/, 'GitHub Pages must deploy the current app from main.');
console.log('Pages deployment source checks passed.');
