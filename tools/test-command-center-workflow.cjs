const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {buildCommandCenterModel}=require('../src/lib/commandCenter.ts');
const {attentionReasonsForWorkOrder}=require('../src/lib/workOrderLifecycle.ts');
const now=new Date('2026-09-10T15:00:00.000Z');
const wo=(id,workflowStage,extra={})=>({id,status:'open',workflowStage,productDescription:`Device ${id}`,activityAt:'2026-09-09T12:00:00Z',items:[],...extra});
const input={now,workOrders:[
 wo(1,'Diagnosing'),wo(2,'Approval'),wo(3,'Parts',{partEta:'2026-09-15'}),wo(4,'Parts',{partEta:'2026-09-09'}),
 wo(5,'Repair',{items:[{description:'Expedited Service Fee'}]}),wo(6,'Testing'),wo(7,'Pickup',{pickupReadyAt:'2026-08-25'}),
 wo(8,'Completed',{status:'closed'}),wo(9,'Waiting Device'),wo(10,'Parts',{partEta:'2026-09-15',workflowException:true}),
 wo(11,'Checked in',{repairStatus:'Repair Not Possible - Awaiting Pickup'}),
],customers:[],technicians:[]};
const model=buildCommandCenterModel(input);
assert.equal(model.stages.Diagnosing.length,1);
assert.equal(model.stages.Approval.length,1);
assert.equal(model.stages.Parts.length,3);
assert.equal(model.stages.Testing.length,1);
assert.equal(model.stages.Pickup.length,2);
assert.ok(!model.stages['Checked in'].some(row=>row.id===11),'Repair-not-possible tickets must override a stale Checked In stage.');
assert.ok(!model.repairQueue.some(row=>row.id===11),'Repair-not-possible tickets must leave today\'s actionable repair queue.');
assert.ok(model.readyForPickup.some(row=>row.id===11),'Repair-not-possible tickets must appear in Ready for Pickup.');
assert.ok(!model.repairQueue.some(row=>row.id===3),'Future-ETA parts must stay out of today queue.');
assert.ok(model.repairQueue.some(row=>row.id===4),'Overdue parts must return to today queue.');
assert.ok(model.repairQueue.some(row=>row.id===10),'Manually resumed exception must enter today queue.');
assert.equal(model.repairQueue[0].id,5,'Expedited ticket must sort first.');
assert.ok(!model.activeWorkOrders.some(row=>row.id===8),'Completed ticket must not be active.');
assert.ok(!model.repairQueue.some(row=>row.id===9),'Waiting-on-device ticket must not be actionable.');

const reasons=[
 ...attentionReasonsForWorkOrder({status:'open',workflowStage:'Approval',approvalRequestedAt:'2026-09-01',promisedAt:'2026-09-09',emailDeliveryStatus:'failed',unreadClientReplies:2,pendingSync:true},{now}),
 ...attentionReasonsForWorkOrder({status:'open',workflowStage:'Parts',partEta:'2026-09-08'},{now}),
];
for(const code of ['approval-overdue','promise-overdue','part-overdue','email-failed','client-reply-unread','sync-pending'])assert.ok(reasons.some(reason=>reason.code===code),`Missing ${code}`);
console.log('Command Center workflow projection checks passed.');
