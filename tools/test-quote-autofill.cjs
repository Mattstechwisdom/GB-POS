const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

function loadTypeScriptModule(file) {
  const result = esbuild.buildSync({
    entryPoints: [path.join(__dirname, '..', file)],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
  });
  const compiled = { exports: {} };
  new Function('module', 'exports', 'require', result.outputFiles[0].text)(compiled, compiled.exports, require);
  return compiled.exports;
}

const { buildQuoteAutofillDraft } = loadTypeScriptModule(path.join('src', 'lib', 'quoteAutofill.ts'));

const iphone = buildQuoteAutofillDraft({
  ok: true,
  title: 'Apple iPhone 15 Pro 256GB - Natural Titanium',
  description: 'Brand new unlocked smartphone with a 120Hz display.',
  specs: [{ name: 'Storage Capacity', value: '256 GB' }, { name: 'Color', value: 'Natural Titanium' }],
});
assert.equal(iphone.deviceType, 'Apple Devices');
assert.equal(iphone.dynamic.device, 'iPhone');
assert.equal(iphone.dynamic.storage, '256 GB');
assert.equal(iphone.model, 'iPhone 15 Pro');
assert.equal(iphone.dynamic.color, 'Natural Titanium');
assert.equal(iphone.dynamic.carrier, 'Unlocked');
assert.equal(iphone.dynamic.cellular, undefined);
assert.equal(iphone.dynamic.os, 'iOS');
assert.equal(iphone.dynamic.screenSize, undefined);
assert.equal(iphone.dynamic.otherSpecs, undefined);
assert.equal(iphone.brand, 'Apple');
assert.equal(iphone.condition, 'New');
assert.match(iphone.description, /^iPhone 15 Pro delivers/);
assert.doesNotMatch(iphone.description, /Confirmed specifications include/i);

const laptop = buildQuoteAutofillDraft({
  ok: true,
  title: 'ASUS ROG Gaming Laptop RTX 4070 16GB RAM 1TB SSD',
  specs: [{ name: 'Processor', value: 'Intel Core i7' }, { name: 'Refresh Rate', value: '165 Hz' }],
});
assert.equal(laptop.deviceType, 'Gaming Laptop');
assert.equal(laptop.brand, 'ASUS');
assert.equal(laptop.dynamic.cpu, 'Intel i7');
assert.equal(laptop.dynamic.refreshRate, '165 Hz');

const gameConsole = buildQuoteAutofillDraft({ ok: true, title: 'Sony PlayStation 5 Slim Digital Edition Console - 1TB' });
assert.equal(gameConsole.deviceType, 'Console');
assert.equal(gameConsole.brand, 'Sony');

const categoryCases = [
  ['Phone', 'Samsung Galaxy Z Fold 7 512GB Unlocked'],
  ['Tablet', 'Samsung Galaxy Tab S10 Ultra 256GB'],
  ['Desktop Computer', 'Dell Alienware Aurora Gaming Desktop RTX 4080'],
  ['Audio', 'Sony WH-1000XM6 Wireless Headphones'],
  ['TV', 'LG 65-inch OLED Smart TV 4K'],
  ['Camera', 'GoPro HERO13 Black Action Camera'],
  ['Drone', 'DJI Mavic 4 Pro Fly More Combo'],
  ['Console', 'ASUS ROG Ally X Handheld Gaming System'],
];
for (const [expectedType, title] of categoryCases) {
  assert.equal(buildQuoteAutofillDraft({ ok: true, title }).deviceType, expectedType, title);
}

const generic = buildQuoteAutofillDraft({ ok: true, title: 'USB-C 100W Charging Cable' });
assert.equal(generic.deviceType, 'Other');

const schemaCases = [
  {
    type: 'Phone', title: 'Samsung Galaxy S24 Ultra Smartphone',
    specs: [['Storage', '512GB'], ['Color', 'Titanium Black'], ['Carrier', 'Unlocked'], ['Operating System', 'Android 14'], ['Screen Size', '6.8 inch']],
    expected: { storage: '512 GB', color: 'Titanium Black', carrier: 'Unlocked', os: 'Android 14' }, forbidden: ['screenSize'],
  },
  {
    type: 'Tablet', title: 'Samsung Galaxy Tab S10 Ultra Tablet',
    specs: [['Screen Size', '14.6'], ['Storage', '256GB'], ['Connectivity', 'Wi-Fi'], ['Operating System', 'Android 14']],
    expected: { size: '14.6"', storage: '256 GB', connectivity: 'Wi‑Fi', os: 'Android 14' }, forbidden: ['screenSize'],
  },
  {
    type: 'Gaming Laptop', title: 'ASUS ROG Gaming Laptop RTX 4070',
    specs: [['Processor', 'Core i7 - Gen 13 (H)'], ['Memory', '32GB'], ['Storage', '1TB SSD'], ['Graphics', 'NVIDIA RTX 4070'], ['Display Size', '16'], ['Resolution', '2560 x 1600'], ['Refresh Rate', '240 Hz']],
    expected: { cpu: 'Intel i7', ram: '32 GB', bootDriveStorage: '1 TB', gpuModel: 'NVIDIA RTX 4070', displaySize: '16"', displayResolution: '2560 x 1600', refreshRate: '240 Hz' }, forbidden: ['storage', 'screenSize', 'resolution'],
  },
  {
    type: 'TV', title: 'LG 65-inch OLED Smart TV',
    specs: [['Screen Size', '65'], ['Resolution', '4K UHD'], ['Display Technology', 'OLED'], ['Refresh Rate', '120 Hz'], ['HDR', 'Dolby Vision']],
    expected: { screenSize: '65"', resolution: '4K UHD', displayTech: 'OLED', refreshRate: '120 Hz', hdr: 'Dolby Vision' }, forbidden: ['ram'],
  },
  {
    type: 'Camera', title: 'Sony Alpha Mirrorless Digital Camera',
    specs: [['Camera Type', 'Mirrorless'], ['Sensor', 'Full-frame'], ['Lens Mount', 'Sony E'], ['Resolution', '24 MP'], ['Video Recording', '4K']],
    expected: { cameraType: 'Mirrorless', sensor: 'Full-frame', mount: 'Sony E', resolution: '24 MP', video: '4K' }, forbidden: ['storage'],
  },
  {
    type: 'Drone', title: 'DJI Mavic 4 Pro Drone',
    specs: [['Camera', '20 MP / 5.4K'], ['Flight Time', '40+ min'], ['Maximum Range', '18 km'], ['Maximum Speed', '60 mph'], ['Weight', '1063 g'], ['GPS', 'Yes']],
    expected: { camera: '20 MP / 5.4K', flightTime: '40+ min', range: '18 km', maxSpeed: '60 mph', weight: '1063 g', gps: 'Yes' }, forbidden: ['screenSize'],
  },
  {
    type: 'Audio', title: 'Sony Wireless Noise Cancelling Headphones',
    specs: [['Color', 'Black'], ['Features', 'Bluetooth, active noise cancellation']],
    expected: { audioType: 'Headphones', color: 'Black', features: 'Bluetooth, active noise cancellation' }, forbidden: ['storage'],
  },
  {
    type: 'Console', title: 'Sony PlayStation 5 Slim Digital Edition Console',
    specs: [['Storage', '1TB'], ['Edition', 'Digital']],
    expected: { model: 'PS5 Slim', storage: '1 TB', edition: 'Digital' }, forbidden: ['ram'],
  },
  {
    type: 'Desktop Computer', title: 'Dell OptiPlex Desktop Computer',
    specs: [['Processor', 'Intel Core i5'], ['Memory', '16GB'], ['Storage', '512GB SSD'], ['Operating System', 'Windows 11 Pro'], ['Ports', 'USB-C, HDMI']],
    expected: { cpu: 'Intel i5', ram: '16 GB', storage: '512 GB', os: 'Windows 11 Pro', ports: 'USB-C, HDMI' }, forbidden: ['screenSize'],
  },
];
for (const testCase of schemaCases) {
  const draft = buildQuoteAutofillDraft({
    ok: true,
    title: testCase.title,
    specs: testCase.specs.map(([name, value]) => ({ name, value })),
  });
  assert.equal(draft.deviceType, testCase.type, testCase.title);
  for (const [key, value] of Object.entries(testCase.expected)) assert.equal(draft.dynamic[key], value, `${testCase.title}: ${key}`);
  for (const key of testCase.forbidden) assert.equal(draft.dynamic[key], undefined, `${testCase.title}: unexpected ${key}`);
  assert.ok(draft.description.split(/[.!?]+/).filter(Boolean).length >= 2, `${testCase.title}: summary`);
}

const backMarketUrl = 'https://www.backmarket.com/en-us/p/iphone-15-pro';
const { extractPartMetadataFromReader, extractPartMetadataFromHtml } = loadTypeScriptModule(path.join('src', 'lib', 'partOrdering.ts'));
const genericStoreReaderFixture = `
Title: Google Pixel 9 Pro 256GB Unlocked | Example Electronics
# Google Pixel 9 Pro
![Google Pixel 9 Pro front](https://cdn.example-shop.com/products/pixel-9-pro-front?width=1200)
![Google Pixel 9 Pro back](https://cdn.example-shop.com/products/pixel-9-pro-back?width=1200)
![Google Pixel 9 Pro side](https://cdn.example-shop.com/products/pixel-9-pro-side?width=1200)
$899.99
**Storage:** 256 GB
**Color:** Obsidian
**Carrier:** Unlocked
**Operating System:** Android 15
`;
const genericStoreMetadata = extractPartMetadataFromReader(genericStoreReaderFixture, 'https://example-shop.com/products/google-pixel-9-pro');
const genericStoreDraft = buildQuoteAutofillDraft(genericStoreMetadata);
assert.equal(genericStoreMetadata.price, 899.99);
assert.equal(genericStoreMetadata.currency, 'USD');
assert.equal(genericStoreMetadata.images.length, 3);
assert.equal(genericStoreDraft.deviceType, 'Phone');
assert.equal(genericStoreDraft.model, 'Google Pixel 9 Pro');
assert.equal(genericStoreDraft.dynamic.storage, '256 GB');
assert.equal(genericStoreDraft.dynamic.color, 'Obsidian');
assert.equal(genericStoreDraft.dynamic.carrier, 'Unlocked');
assert.equal(genericStoreDraft.dynamic.os, 'Android 15');

const genericJsonLdFixture = `<!doctype html><html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"DJI Mini 4 Pro Drone Fly More Combo","image":["https://media.example.com/mini4-front.webp","https://media.example.com/mini4-side.webp"],"description":"Compact camera drone","additionalProperty":[{"@type":"PropertyValue","name":"Flight Time","value":"34 minutes"},{"@type":"PropertyValue","name":"Weight","value":"249 g"}],"offers":{"@type":"Offer","price":"759.00","priceCurrency":"USD"}}</script>
</head><body></body></html>`;
const genericJsonLdMetadata = extractPartMetadataFromHtml(genericJsonLdFixture, 'https://manufacturer.example/products/mini-4-pro');
const genericJsonLdDraft = buildQuoteAutofillDraft(genericJsonLdMetadata);
assert.equal(genericJsonLdMetadata.price, 759);
assert.equal(genericJsonLdMetadata.images.length, 2);
assert.equal(genericJsonLdDraft.deviceType, 'Drone');
assert.equal(genericJsonLdDraft.dynamic.flightTime, '34 minutes');
assert.equal(genericJsonLdDraft.dynamic.weight, '249 g');
const backMarketReaderFixture = `
Title: iPhone 15 Pro - Unlocked Refurbished | Back Market

Every device is professionally inspected and guaranteed to be 100% functional. Compare conditions

* Fair $525.29
* Good $556.19
* Excellent $528.00
* Premium $878.00

Select a battery option

![iPhone 15 Pro front](https://d2e6ccujb3mkqf.cloudfront.net/example-front.jpg)
![iPhone 15 Pro back](https://d2e6ccujb3mkqf.cloudfront.net/example-back.jpg)
![iPhone 15 Pro side](https://d2e6ccujb3mkqf.cloudfront.net/example-side.jpg)

Selected configuration

* Fair
* Standard battery
* 128 GB
* Black Titanium
* Unlocked

$528.00 before trade-in
`;
const backMarketMetadata = extractPartMetadataFromReader(backMarketReaderFixture, backMarketUrl);
const backMarketDraft = buildQuoteAutofillDraft(backMarketMetadata);
const backMarketExcellentDraft = buildQuoteAutofillDraft(backMarketMetadata, { condition: 'Excellent' });
assert.equal(backMarketMetadata.ok, true);
assert.match(backMarketMetadata.title, /iPhone 15 Pro/i);
assert.equal(backMarketMetadata.price, 528);
assert.equal(backMarketMetadata.images.length, 3);
assert.equal(backMarketMetadata.conditionOptions.length, 4);
assert.equal(backMarketDraft.deviceType, 'Apple Devices');
assert.equal(backMarketDraft.dynamic.device, 'iPhone');
assert.equal(backMarketDraft.dynamic.storage, '128 GB');
assert.equal(backMarketDraft.dynamic.color, 'Black Titanium');
assert.equal(backMarketDraft.dynamic.carrier, 'Unlocked');
assert.equal(backMarketDraft.dynamic.cellular, undefined);
assert.equal(backMarketDraft.dynamic.battery, 'Standard battery');
assert.equal(backMarketDraft.dynamic.os, 'iOS');
assert.equal(backMarketDraft.model, 'iPhone 15 Pro');
assert.equal(backMarketDraft.condition, undefined);
assert.equal(backMarketExcellentDraft.condition, 'Excellent');
assert.match(backMarketExcellentDraft.description, /listed in Excellent condition/);

const thinkPadReaderFixture = `
Title: Lenovo ThinkPad T490 14\" Refurbished | Back Market
# Lenovo ThinkPad T490 14\"
$205.84 before trade-in
Select the processor
* Core i5 - Gen 10 (U) $437.00
* Core i5 - Gen 8 (U) $205.84
Select storage
* 256 GB $336.00
* 512 GB $205.84
Select memory
* 16 GB $205.84
![Windows Laptop](https://search.statics.backmarket.com/navigation/windows-laptop.png)
![Lenovo ThinkPad T490 14-inch (2019) - Core i5 - Gen 8 (U) - 16 GB - SSD 512 GB](https://d2e6ccujb3mkqf.cloudfront.net/t490-front.jpg)
![Lenovo ThinkPad T490 14-inch (2019) - Core i5 - Gen 8 (U) - 16 GB - SSD 512 GB](https://d2e6ccujb3mkqf.cloudfront.net/t490-back.jpg)
* Core i5 - Gen 8 (U)
* 512 GB
* 16 GB
$205.84 before trade-in
Resolution 1920 x 1080
OS Windows 11
Memory (GB)16 GB
Storage (GB)512 GB
Screen size 14
`;
const thinkPadMetadata = extractPartMetadataFromReader(thinkPadReaderFixture, 'https://www.backmarket.com/en-us/p/lenovo-thinkpad-t490-14');
const thinkPadDraft = buildQuoteAutofillDraft(thinkPadMetadata);
assert.equal(thinkPadDraft.deviceType, 'Laptop');
assert.equal(thinkPadDraft.brand, 'Lenovo');
assert.equal(thinkPadDraft.dynamic.cpu, 'Intel i5');
assert.equal(thinkPadDraft.dynamic.cpuGen, 'Gen 8 (U)');
assert.equal(thinkPadDraft.dynamic.ram, '16 GB');
assert.equal(thinkPadDraft.dynamic.storage, '512 GB');
assert.equal(thinkPadDraft.dynamic.screenSize, '14\"');
assert.equal(thinkPadDraft.dynamic.os, 'Windows 11');
assert.equal(thinkPadMetadata.images.length, 2);
assert.ok(thinkPadMetadata.images.every((image) => image.includes('t490-')));
assert.match(thinkPadDraft.description, /portable computer configured for dependable everyday productivity/);
assert.doesNotMatch(thinkPadDraft.description, /Confirmed specifications include/i);

console.log('Quote autofill classification tests passed.');

async function runOptionalLiveChecks() {
if (process.argv.includes('--live')) {
  const url = 'https://www.phonelcdparts.com/apple/iphone-parts/iphone-16-pro/oled-assembly-for-iphone-16-pro-aftermarket-qv8-soft-120hz-ic-transfer-eligible-16p-qv8-soft';
  const { extractPartMetadataFromHtml } = loadTypeScriptModule(path.join('src', 'lib', 'partOrdering.ts'));
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 GBPOS/1.0' },
    signal: AbortSignal.timeout(25_000),
  });
  assert.equal(response.ok, true);
  const metadata = extractPartMetadataFromHtml(await response.text(), url);
  assert.equal(metadata.ok, true);
  assert.match(metadata.title, /iPhone 16 Pro/i);
  assert.equal(typeof metadata.price, 'number');
  assert.ok(metadata.images.length >= 2 && metadata.images.length <= 3);
  console.log(`Live quote scrape passed: ${metadata.title}; $${metadata.price}; ${metadata.images.length} images.`);
}

if (process.argv.includes('--backmarket')) {
  const response = await fetch('https://r.jina.ai/http://www.backmarket.com/en-us/p/iphone-15-pro', {
    signal: AbortSignal.timeout(25_000),
  });
  assert.equal(response.ok, true);
  const metadata = extractPartMetadataFromReader(await response.text(), backMarketUrl);
  const draft = buildQuoteAutofillDraft(metadata);
  assert.equal(metadata.ok, true);
  assert.match(metadata.title, /iPhone 15 Pro/i);
  assert.equal(typeof metadata.price, 'number');
  assert.equal(metadata.images.length, 3);
  assert.equal(draft.deviceType, 'Apple Devices');
  assert.equal(draft.dynamic.device, 'iPhone');
  assert.ok(draft.condition);
  console.log(`Back Market fallback passed: ${metadata.title}; $${metadata.price}; ${metadata.images.length} images; ${draft.condition}.`);
}

if (process.argv.includes('--thinkpad')) {
  const url = 'https://www.backmarket.com/en-us/p/lenovo-thinkpad-t490-14';
  const response = await fetch('https://r.jina.ai/http://www.backmarket.com/en-us/p/lenovo-thinkpad-t490-14', {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.ok, true);
  const metadata = extractPartMetadataFromReader(await response.text(), url);
  const draft = buildQuoteAutofillDraft(metadata);
  assert.equal(draft.deviceType, 'Laptop');
  assert.equal(draft.dynamic.cpu, 'Intel i5');
  assert.equal(draft.dynamic.cpuGen, 'Gen 8 (U)');
  assert.equal(draft.dynamic.ram, '16 GB');
  assert.equal(draft.dynamic.storage, '512 GB');
  assert.equal(draft.dynamic.screenSize, '14\"');
  assert.equal(draft.dynamic.os, 'Windows 11');
  assert.equal(metadata.images.length, 3);
  assert.ok(metadata.images.every((image) => /\.jpe?g(?:\?|$)/i.test(image) && !/iphone/i.test(image)), JSON.stringify(metadata.images));
  assert.match(draft.description, /ThinkPad T490/);
  console.log(`ThinkPad fallback passed: ${metadata.title}; ${draft.dynamic.cpu}; ${draft.dynamic.ram}; ${draft.dynamic.storage}; ${metadata.images.length} images.`);
}

if (process.argv.includes('--ipad')) {
  const url = 'https://www.backmarket.com/en-us/p/ipad-air-2022-m1-series';
  const response = await fetch('https://r.jina.ai/http://www.backmarket.com/en-us/p/ipad-air-2022-m1-series', {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.ok, true);
  const metadata = extractPartMetadataFromReader(await response.text(), url);
  const draft = buildQuoteAutofillDraft(metadata);
  assert.equal(draft.deviceType, 'Apple Devices');
  assert.equal(draft.dynamic.device, 'iPad Air');
  assert.equal(draft.dynamic.size, '10.9"');
  assert.equal(draft.dynamic.storage, '64 GB');
  assert.match(draft.dynamic.connectivity, /^Wi‑Fi(?: \+ Cellular)?$/, JSON.stringify(metadata.specs));
  assert.equal(draft.dynamic.os, 'iPadOS');
  assert.match(draft.dynamic.color, /^(?:Space Gray|Starlight|Blue|Purple|Pink)$/);
  assert.equal(metadata.conditionOptions?.length, 4);
  assert.equal(metadata.images.length, 3);
  assert.ok(metadata.images.every((image) => !/iphone|thinkpad/i.test(image)), JSON.stringify(metadata.images));
  assert.match(draft.description, /iPad Air/i);
  console.log(`iPad Air fallback passed: ${metadata.title}; ${draft.dynamic.size}; ${draft.dynamic.storage}; ${draft.dynamic.connectivity}; ${metadata.images.length} images.`);
}

if (process.argv.includes('--galaxy')) {
  const url = 'https://www.backmarket.com/en-us/p/galaxy-s23-ultra';
  const response = await fetch('https://r.jina.ai/http://www.backmarket.com/en-us/p/galaxy-s23-ultra', {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.ok, true);
  const metadata = extractPartMetadataFromReader(await response.text(), url);
  const draft = buildQuoteAutofillDraft(metadata);
  assert.equal(draft.deviceType, 'Phone', JSON.stringify({ title: metadata.title, description: metadata.description, specs: metadata.specs }));
  assert.equal(draft.brand, 'Samsung');
  assert.equal(draft.model, 'Galaxy S23 Ultra');
  assert.match(draft.dynamic.storage, /^(?:256|512|1000) GB$/);
  assert.equal(draft.dynamic.carrier, 'Unlocked');
  assert.equal(draft.dynamic.os, 'Android');
  assert.match(draft.dynamic.color, /^(?:Black|Beige|Green|Purple|Red)$/);
  assert.equal(draft.condition, undefined);
  assert.equal(metadata.conditionOptions?.length, 4);
  assert.equal(metadata.images.length, 3);
  assert.equal(new Set(metadata.images).size, 3);
  assert.ok(metadata.images.every((image) => /cloudfront\.net\/[^/]+\.jpe?g(?:\?|$)/i.test(image)), JSON.stringify(metadata.images));
  assert.match(draft.description, /Galaxy S23 Ultra/i);
  console.log(`Galaxy S23 Ultra fallback passed: ${draft.model}; ${draft.dynamic.storage}; ${draft.dynamic.carrier}; ${draft.dynamic.os}; ${metadata.images.length} images.`);
}

if (process.argv.includes('--switch')) {
  const url = 'https://www.backmarket.com/en-us/p/switch';
  const response = await fetch('https://r.jina.ai/http://www.backmarket.com/en-us/p/switch', {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.ok, true);
  const metadata = extractPartMetadataFromReader(await response.text(), url);
  const draft = buildQuoteAutofillDraft(metadata);
  assert.equal(draft.deviceType, 'Console', JSON.stringify({ title: metadata.title, specs: metadata.specs }));
  assert.equal(draft.brand, 'Nintendo');
  assert.equal(draft.dynamic.model, 'Nintendo Switch');
  assert.equal(draft.dynamic.storage, '32 GB');
  assert.equal(metadata.images.length, 3);
  assert.equal(new Set(metadata.images).size, 3);
  assert.ok(metadata.images.every((image) => !/iphone|ipad|thinkpad/i.test(image)), JSON.stringify(metadata.images));
  assert.match(draft.description, /Switch/i);
  console.log(`Nintendo Switch fallback passed: ${metadata.title}; ${draft.dynamic.model}; ${draft.dynamic.storage}; ${metadata.images.length} images.`);
}
}

runOptionalLiveChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
