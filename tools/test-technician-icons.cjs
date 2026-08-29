const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const root = path.resolve(__dirname, '..');
const build = esbuild.buildSync({ entryPoints: [path.join(root, 'src/lib/technicianIcons.tsx')], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react'] });
const loaded = { exports: {} };
new Function('module', 'exports', 'require', build.outputFiles[0].text)(loaded, loaded.exports, require);
const { TECHNICIAN_ICONS, DEFAULT_TECHNICIAN_ICON_ID, resolveTechnicianIconId, TechnicianAvatar } = loaded.exports;

assert.equal(TECHNICIAN_ICONS.length, 25);
assert.equal(new Set(TECHNICIAN_ICONS.map((item) => item.id)).size, 25);
assert.deepEqual(Object.fromEntries(['default', 'neon', 'matrix', 'gothic'].map((theme) => [theme, TECHNICIAN_ICONS.filter((item) => item.theme === theme).length])), { default: 10, neon: 5, matrix: 5, gothic: 5 });
assert.equal(resolveTechnicianIconId('not-real'), DEFAULT_TECHNICIAN_ICON_ID);
const html = renderToStaticMarkup(React.createElement(TechnicianAvatar, { iconId: 'gothic-bat', ariaLabel: 'Luke' }));
assert.match(html, /^<svg/);
assert.match(html, /aria-label="Luke"/);
assert.doesNotMatch(html, /<img|https?:\/\//);
console.log('Technician icon catalog behavior checks passed.');
