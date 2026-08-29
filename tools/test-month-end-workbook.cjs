const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const result = esbuild.buildSync({
  entryPoints: [path.resolve('src/lib/monthEndWorkbook.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  write: false,
});
const loaded = { exports: {} };
new Function('module', 'exports', 'require', result.outputFiles[0].text)(loaded, loaded.exports, require);

const html = loaded.exports.buildMonthEndWorkbookHtml({
  monthLabel: 'August 2026',
  summary: [
    { label: 'Product Sales Gross Profit', value: '$538.52', tone: 'positive' },
    { label: 'Total Commission', value: '$496.80', tone: 'accent' },
  ],
  sections: [{ title: 'Technician Commission Totals', rows: [{ Technician: 'Matt', 'Sales Commission': '$110.90' }] }],
});

assert.match(html, /<html[\s\S]*Product Sales Gross Profit[\s\S]*\$538\.52/);
assert.match(html, /Technician Commission Totals[\s\S]*Matt[\s\S]*\$110\.90/);
assert.match(html, /mso-number-format|background:/, 'Workbook must include spreadsheet styling rather than plain CSV text.');
assert.doesNotMatch(html, /Known Profit/);
console.log('Styled month-end workbook checks passed.');
