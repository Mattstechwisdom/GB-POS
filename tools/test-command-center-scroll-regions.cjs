const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const component = fs.readFileSync(path.join(root, 'src/components/CommandCenter.tsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles/command-center.css'), 'utf8');

assert.equal((component.match(/className="command-center-section-scroll"/g) || []).length, 3,
  'Repair Queue, Client Replies, and Product Delivery must each own a scroll region.');
assert.match(component, /model\.repairQueuePreview\.map\(/,
  'Repair Queue must retain its seven-record priority preview limit.');
assert.doesNotMatch(component, /clientResponses\.slice\(/,
  'Client Replies must remain uncapped and scroll when necessary.');
assert.doesNotMatch(component, /model\.productDeliveries\.slice\(/,
  'Product Delivery must remain uncapped and scroll when necessary.');
assert.match(styles, /\.command-center-section-scroll\{[^}]*max-height:[^;}]+;[^}]*overflow-y:auto/,
  'Section rows must only scroll vertically after filling their visible area.');
assert.match(styles, /\.command-center-section-scroll::?-webkit-scrollbar/,
  'Command Center scroll regions must use the themed scrollbar.');

console.log('Command Center scroll-region checks passed.');
