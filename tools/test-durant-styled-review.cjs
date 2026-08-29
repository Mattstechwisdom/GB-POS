const assert = require('node:assert/strict');
const fs = require('node:fs');

const durant = fs.readFileSync('src/durant/DurantApp.tsx', 'utf8');
const review = fs.readFileSync('src/workorders/DurantProposalReview.tsx', 'utf8');

assert.match(durant, />Part URL</);
assert.match(durant, /partUrl/);
assert.match(durant, />Invoice URL</);
assert.match(review, /View Durant Entries/);
assert.match(review, /Durant Media Entries/);
assert.match(review, /Open Part URL/);
assert.match(review, /Open Invoice/);
assert.match(review, /Approve Changes/);
assert.match(review, /Return for Changes/);
assert.doesNotMatch(review, /JSON\.stringify/);
assert.doesNotMatch(review, /<pre/);

console.log('Durant styled proposal review checks passed.');
