const assert = require('node:assert/strict'); const path = require('node:path'); const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..'); const result = esbuild.buildSync({ entryPoints:[path.join(root,'src/lib/vendorCatalog.ts')], bundle:true, platform:'node', format:'cjs', write:false });
const mod={exports:{}}; new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,require);
const { vendorKey, resolveCanonicalVendor, groupVendorLinks, renameVendorLinks }=mod.exports;
assert.equal(vendorKey('  Mobile   Sentrix '), 'mobile sentrix');
assert.equal(resolveCanonicalVendor('mobile sentrix',[{id:1,name:'Mobile Sentrix'}]).name,'Mobile Sentrix');
const products=[
  {id:10,distributor:'Mobile Sentrix',itemType:'Part'},
  {id:11,distributor:'Other',itemType:'Part'},
  {id:12,distributor:'Mobile Sentrix',itemType:'Product'},
];
const repairs=[{id:'r1',inventoryProductId:10},{id:'r2',partSource:'Mobile Sentrix'}];
const grouped=groupVendorLinks({id:1,name:'mobile sentrix'},products,repairs); assert.deepEqual(grouped.parts.map(x=>x.id),[10]); assert.deepEqual(grouped.repairs.map(x=>x.id),['r1','r2']);
const productGrouped=groupVendorLinks({id:1,name:'mobile sentrix'},products,repairs,'Product');
assert.deepEqual(productGrouped.products.map(x=>x.id),[12], 'Products mode must include only retail products.');
assert.deepEqual(productGrouped.parts, [], 'Products mode must not expose repair parts.');
assert.deepEqual(productGrouped.repairs, [], 'Products mode must never expose repairs.');
const partGrouped=groupVendorLinks({id:1,name:'mobile sentrix'},products,repairs,'Part');
assert.deepEqual(partGrouped.parts.map(x=>x.id),[10], 'Parts mode must exclude retail products.');
assert.deepEqual(partGrouped.repairs.map(x=>x.id),['r1','r2'], 'Parts mode keeps repairs linked to the distributor or its parts.');
const renamed=renameVendorLinks('Mobile Sentrix','MobileSentrix',products,repairs); assert.equal(renamed.products[0].distributor,'MobileSentrix'); assert.equal(renamed.repairs[1].partSource,'MobileSentrix');
console.log('Vendor catalog checks passed.');
