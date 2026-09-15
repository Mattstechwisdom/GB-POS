const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const source = fs.readFileSync('app/electron/electron-main.ts','utf8');
const start = source.indexOf('async function ensureCloudQrStatusUrl(');
const end = source.indexOf('\nasync function resolveCloudQrStatusToken',start);
const compiled = ts.transpile(source.slice(start,end),{module:ts.ModuleKind.CommonJS});
let writes=0;
const query = {select(){return this},eq(){return this},is(){return this},order(){return this},limit(){return this},async maybeSingle(){return {data:{token:'existing-valid-token',id:'saved-cloud-id'},error:null}}};
const getUrl = new Function('getCloudClient','cloudSession','cloudRecordKeyForQrType','readDb','cloudDbUpsert','cloudQrUrl','CLOUD_TABLE_BY_KEY', `${compiled}; return ensureCloudQrStatusUrl;`)(()=>({from:()=>query}),{shopId:'shop'},()=> 'workOrders',()=>({workOrders:[{id:4321}]}),async()=>{writes++;throw new Error('Unrelated work-order sync write failed')},(_type,token)=>`https://example.test/?clientUpdateToken=${token}`,{workOrders:'work_orders'});
(async()=>{
  assert.equal(await getUrl('repair',4321),'https://example.test/?clientUpdateToken=existing-valid-token');
  assert.equal(writes,0,'Printing an existing QR must not upload the whole work order.');
  const savedRecordClient = {from(table) {
    const result = table === 'qr_status_tokens' ? {data:null,error:null} : {data:{id:'saved-cloud-id'},error:null};
    return {select(){return this},eq(){return this},is(){return this},order(){return this},limit(){return this},async maybeSingle(){return result},insert(){return {select(){return this},async single(){return {data:{token:'new-valid-token'},error:null}}}}};
  }};
  const newQr = new Function('getCloudClient','cloudSession','cloudRecordKeyForQrType','readDb','cloudDbUpsert','cloudQrUrl','CLOUD_TABLE_BY_KEY','makeQrToken',`${compiled}; return ensureCloudQrStatusUrl;`)(()=>savedRecordClient,{shopId:'shop'},()=> 'workOrders',()=>({workOrders:[{id:4321}]}),async()=>{writes++;throw new Error('Unrelated sync failure')},(_type,token)=>`https://example.test/?clientUpdateToken=${token}`,{workOrders:'work_orders'},()=> 'new-valid-token');
  assert.equal(await newQr('repair',4321),'https://example.test/?clientUpdateToken=new-valid-token');
  assert.equal(writes,0,'A saved cloud work order must receive its first QR without re-uploading the ticket.');
  console.log('Existing-record print QR lookup checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
