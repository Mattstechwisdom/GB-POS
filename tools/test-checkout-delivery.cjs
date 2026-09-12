const assert = require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {deliverCheckoutResult}=require('../src/lib/checkoutDelivery.ts');
const {createCheckoutSessionRegistry}=require('../app/electron/checkout-session.ts');

(async()=>{
  const delivered=[];
  await deliverCheckoutResult({completeCheckout:async result=>{delivered.push(result);return{ok:true}}},{amountPaid:75});
  assert.deepEqual(delivered,[{amountPaid:75}],'Complete Checkout must await an acknowledged delivery.');
  await assert.rejects(deliverCheckoutResult({completeCheckout:async()=>({ok:false,error:'Checkout session expired.'})},{amountPaid:75}),/expired/i,'A rejected handoff must be visible to the checkout window.');
  await assert.rejects(deliverCheckoutResult({},{}),/bridge/i,'A missing desktop bridge must never fail silently.');

  const registry=createCheckoutSessionRegistry();
  let result=null;
  registry.register(19,value=>{result=value});
  assert.equal(registry.complete(19,{amountPaid:25}),true);
  assert.deepEqual(result,{amountPaid:25});
  assert.equal(registry.complete(19,{amountPaid:30}),false,'A checkout session must complete only once.');
  console.log('Acknowledged checkout delivery checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
