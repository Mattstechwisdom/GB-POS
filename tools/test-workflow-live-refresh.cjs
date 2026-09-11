const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {publishWorkOrderUpdate,subscribeWorkOrderUpdates}=require('../src/lib/workflowLiveRefresh.ts');

const target=new EventTarget(); let received=null;
const off=subscribeWorkOrderUpdates(record=>{received=record},target);
publishWorkOrderUpdate({id:44,workflowStage:'Testing',repairStatus:'Testing In Progress'},target);
assert.deepEqual(received,{id:44,workflowStage:'Testing',repairStatus:'Testing In Progress'});
off(); received=null;
publishWorkOrderUpdate({id:44,workflowStage:'Pickup'},target);
assert.equal(received,null,'Unsubscribed views must not receive updates.');
assert.throws(()=>publishWorkOrderUpdate(null,target),/work order/i);
console.log('Workflow live refresh checks passed.');
