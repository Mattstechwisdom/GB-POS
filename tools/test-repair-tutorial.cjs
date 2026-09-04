const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src', 'lib', 'repairTutorial.ts');
const output = path.join(root, 'tmp', 'test-repair-tutorial.cjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
esbuild.buildSync({ absWorkingDir: root, entryPoints: ['./src/lib/repairTutorial.ts'], outfile: output, bundle: true, platform: 'node', format: 'cjs' });
const { classifyRepairTutorialUrl } = require(output);

assert.deepEqual(classifyRepairTutorialUrl('https://youtu.be/dQw4w9WgXcQ'), {
  normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  mediaType: 'youtube',
  youtubeId: 'dQw4w9WgXcQ',
});
assert.deepEqual(classifyRepairTutorialUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?start=30'), {
  normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  mediaType: 'youtube',
  youtubeId: 'dQw4w9WgXcQ',
});
assert.deepEqual(classifyRepairTutorialUrl('https://cdn.example.com/guides/phone.mp4?token=abc'), {
  normalizedUrl: 'https://cdn.example.com/guides/phone.mp4?token=abc',
  mediaType: 'direct-video',
});
assert.equal(classifyRepairTutorialUrl('https://vendor.example.com/tutorial/phone').mediaType, 'webpage');
assert.equal(classifyRepairTutorialUrl('javascript:alert(1)'), null);
assert.equal(classifyRepairTutorialUrl('file:///C:/private/tutorial.mp4'), null);
assert.equal(classifyRepairTutorialUrl('not a url'), null);

console.log('Repair tutorial URL classification passed.');
