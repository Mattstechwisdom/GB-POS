const assert=require('node:assert/strict'); const path=require('node:path'); const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'); const result=esbuild.buildSync({entryPoints:[path.join(root,'src/lib/catalogDefaults.ts')],bundle:true,platform:'node',format:'cjs',write:false});
const mod={exports:{}}; new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,require);
const { normalizeInventoryDefaults, applyInventoryDefaults, normalizeRepairDefaults, applyRepairDefaults }=mod.exports;
const inv=normalizeInventoryDefaults({markupPct:25,lowStockThreshold:3,reorderQty:5,conditions:['New',' Used ','New']}); assert.deepEqual(inv.conditions,['New','Used']);
assert.deepEqual(applyInventoryDefaults({price:99},inv),{price:99,markupPct:25,lowStockThreshold:3,reorderQty:5,condition:'New'});
const rep=normalizeRepairDefaults({laborCost:50,repairCategory:'Screen Repair'}); assert.equal(applyRepairDefaults({laborCost:20},rep).laborCost,20); assert.equal(applyRepairDefaults({},rep).repairCategory,'Screen Repair');
console.log('Catalog defaults checks passed.');
