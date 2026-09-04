const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'lib', 'repairTutorial.ts');
const output = path.join(root, 'tmp', 'test-repair-tutorial-ui.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ entryPoints: [source], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
const { repairTutorialControlState } = require(output);
const form = fs.readFileSync(path.join(root, 'src', 'repairs', 'RepairItemForm.tsx'), 'utf8');

assert.deepEqual(repairTutorialControlState(''), { kind: 'input', label: 'Tutorial URL' });
assert.deepEqual(repairTutorialControlState('https://youtu.be/dQw4w9WgXcQ'), {
  kind: 'button', label: 'Repair Tutorial', mediaType: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
});
assert.match(form, />Repair Tutorial</);
assert.match(form, />Change URL</);
assert.match(form, />Remove URL</);
assert.match(form, /name="tutorialUrl"/);

console.log('Repair tutorial editor behavior passed.');
