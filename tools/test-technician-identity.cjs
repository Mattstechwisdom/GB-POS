const assert=require('node:assert/strict'); const path=require('node:path'); const esbuild=require('esbuild');
const entry=path.join(__dirname,'..','src','lib','technicianIdentity.ts');
const build=esbuild.buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',write:false}); const mod={exports:{}}; new Function('module','exports','require',build.outputFiles[0].text)(mod,mod.exports,require);
const {buildTechnicianIndex,resolveTechnician}=mod.exports;
const tech={id:'local-7',legacyId:'7',cloudId:'f970a829-e07f-4184',firstName:'Matthew',lastName:'Stone',nickname:'Matt'}; const index=buildTechnicianIndex([tech]);
for(const key of ['local-7','7','f970a829-e07f-4184','Matthew Stone','Matt','Matthew']) assert.equal(resolveTechnician(key,index).name,'Matt');
assert.equal(resolveTechnician('',index).state,'unassigned');
assert.deepEqual(resolveTechnician('random-opaque-value',index),{state:'unknown',name:'Unknown technician'});
console.log('Technician identity checks passed.');
