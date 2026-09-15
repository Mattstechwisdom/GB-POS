const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
for(const file of ['app/electron/electron-main.ts','src/mobile/mobile-api.ts']){
  const source=fs.readFileSync(file,'utf8');
  const start=source.indexOf('function toCloudRow(');
  const end=source.indexOf('\nfunction ',start+1);
  const code=ts.transpile(source.slice(start,end),{target:ts.ScriptTarget.ES2021});
  const dateOnly=v=>v && !Number.isNaN(Date.parse(v))?new Date(v).toISOString().slice(0,10):null;
  const names=['cloudSession','requireCloudSession','toCloudIntId','toCloudTextId','toCloudString','toCloudIso','toCloudDateOnly','toCloudNumber','toCloudArray','toCloudObject','toCloudBool','toCloudNullableNumber','toCloudMoney'];
  const session={shopId:'shop'};
  const values=[session,()=>session,v=>Number(v)||null,v=>String(v||''),v=>String(v??''),v=>null,dateOnly,v=>Number(v)||0,v=>v||[],v=>v||{},v=>!!v,v=>v==null?null:Number(v),v=>Number(v)||0];
  const map=new Function(...names,`${code}; return toCloudRow;`)(...values);
  assert.equal(map('workOrders',{id:4321,partEta:''}).part_eta,null,`${file}: empty part ETA must not block receipt/QR sync with a date error`);
  assert.equal(map('workOrders',{id:4321,partEta:'2026-09-20'}).part_eta,'2026-09-20');
  assert.equal(map('workOrders',{id:4321}).part_eta,undefined);
}
console.log('Work-order ETA receipt/QR sync checks passed.');
