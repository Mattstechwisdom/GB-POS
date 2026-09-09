const assert=require('node:assert/strict'); const path=require('node:path'); const esbuild=require('esbuild');
const entry=path.join(__dirname,'..','src','lib','workOrderCleanup.ts'); const build=esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false}); const mod={exports:{}}; new Function('module','exports','require',build.outputFiles[0].text)(mod,mod.exports,require);
const {previewWorkOrderCleanup,reconcileLegacyWorkOrders}=mod.exports; const now=new Date('2026-09-09T12:00:00Z');
const rows=[
 {id:1,status:'open',checkInAt:'2026-08-15T12:00:00Z',items:[{description:'Diagnostic Fee'}],payments:[{amount:50}],totals:{total:50,remaining:0}},
 {id:2,status:'open',checkInAt:'2026-08-01T12:00:00Z',items:[{description:'Screen repair'}],amountPaid:10,totals:{total:200,remaining:190}},
 {id:3,status:'open',checkInAt:'2026-09-01T12:00:00Z',items:[{description:'Diagnostic Fee'}]},
];
assert.deepEqual(previewWorkOrderCleanup(rows,{diagnosticOnlyDays:20,closeAllDays:30},now),{scanned:3,diagnosticOnly:1,universal:1,total:2});
const updates=[]; const api={dbGet:async key=>key==='workOrders'?rows:[{id:1,ticketCleanupSettings:{diagnosticOnlyDays:20,closeAllDays:30}}],dbUpdate:async(key,id,patch)=>{updates.push({key,id,patch});return patch;}};
(async()=>{const result=await reconcileLegacyWorkOrders(api,{now});assert.equal(result.updated,2);assert.equal(updates.length,2);assert.equal(updates[0].patch.payments,undefined);assert.equal(updates[1].patch.totals,undefined);console.log('Work-order cleanup reconciliation checks passed.');})().catch(error=>{console.error(error);process.exitCode=1;});
