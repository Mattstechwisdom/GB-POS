const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {buildCommandCenterModel,liveCommandCenterPanelRecords}=require('../src/lib/commandCenter.ts');
const {attentionReasonsForWorkOrder}=require('../src/lib/workOrderLifecycle.ts');
const now=new Date('2026-09-10T15:00:00.000Z');
const wo=(id,workflowStage,extra={})=>({id,status:'open',workflowStage,productDescription:`Device ${id}`,activityAt:'2026-09-09T12:00:00Z',items:[],...extra});
const input={now,workOrders:[
 wo(1,'Diagnosing'),wo(2,'Approval'),wo(3,'Parts',{partEta:'2026-09-15',items:[{description:'HDMI port',requiresOrder:true,orderStatus:'ordered'}]}),wo(4,'Parts',{partEta:'2026-09-09',items:[{description:'Fan',requiresOrder:true,orderStatus:'ordered'}]}),
 wo(5,'Repair',{items:[{description:'Expedited Service Fee'}]}),wo(6,'Testing'),wo(7,'Pickup',{pickupReadyAt:'2026-08-25'}),
 wo(8,'Completed',{status:'closed'}),wo(9,'Waiting Device'),wo(10,'Parts',{partEta:'2026-09-15',workflowException:true,items:[{description:'Power supply',requiresOrder:true,orderStatus:'ordered'}]}),
 wo(11,'Checked in',{repairStatus:'Repair Not Possible - Awaiting Pickup'}),
 wo(12,'Parts',{items:[{description:'USB-C port',requiresOrder:true,orderStatus:'delivered'}]}),
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
assert.ok(!model.activeWorkOrders.some(row=>row.id===11),'Repair-not-possible tickets must leave Active Work Orders while awaiting pickup.');
assert.ok(!model.activeWorkOrders.some(row=>row.id===7),'Repair-complete pickup tickets must leave Active Work Orders.');
assert.ok(!model.repairQueue.some(row=>row.id===3),'Future-ETA parts must stay out of today queue.');
assert.ok(!model.repairQueue.some(row=>row.id===4),'An overdue ETA must not return a work order until its required part is marked delivered.');
assert.ok(!model.repairQueue.some(row=>row.id===10),'A workflow exception must not bypass an undelivered required part.');
assert.ok(model.repairQueue.some(row=>row.id===12),'A work order whose required parts arrived must return to today queue.');
assert.equal(model.repairQueue[0].id,5,'Expedited ticket must sort first.');
assert.ok(!model.activeWorkOrders.some(row=>row.id===8),'Completed ticket must not be active.');
assert.ok(!model.repairQueue.some(row=>row.id===9),'Waiting-on-device ticket must not be actionable.');

const quickHistory=(id)=>wo(id,'Completed',{
 status:'closed',productCategory:'Game Console',items:[{repair:'HDMI Port Repair'}],
 diagnosisStartedAt:`2026-09-${id-7}T09:00:00Z`,repairCompletionDate:`2026-09-${id-7}T13:00:00Z`,
});
const ranked=buildCommandCenterModel({now,customers:[],technicians:[],workOrders:[
 quickHistory(20),quickHistory(21),
 wo(30,'Repair',{items:[{description:'Expedited Service Fee'}]}),
 wo(36,'Parts',{items:[{description:'Charging Port',requiresOrder:true,orderStatus:'delivered'}]}),
 wo(31,'Checked in',{productCategory:'Game Console',items:[{repair:'HDMI Port Repair'}]}),
 wo(32,'Checked in',{checkInAt:'2026-09-10T12:00:00Z'}),
 wo(33,'Diagnosing',{activityAt:'2026-09-10T11:00:00Z'}),
 wo(34,'Testing',{activityAt:'2026-09-10T10:00:00Z'}),
 wo(35,'Checked in',{checkInAt:'2026-09-05T12:00:00Z'}),
 ...Array.from({length:11},(_,index)=>wo(40+index,'Checked in',{activityAt:`2026-09-${String(index+1).padStart(2,'0')}T12:00:00Z`})),
]});
assert.deepEqual(ranked.repairQueue.slice(0,7).map(row=>row.id),[30,36,34,33,31,35,40],'Queue order must be expedited, parts-arrived, testing/diagnosing, historically quick, stagnant, then ordinary work.');
assert.equal(ranked.repairQueuePreview.length,7,'Command Center queue preview must show at most seven work orders.');
assert.equal(ranked.repairQueue.length,18,'Open Full Queue must retain every eligible work order.');

const attentionModel=buildCommandCenterModel({now,customers:[{id:1,firstName:'Ada',lastName:'Lovelace',email:'ada@example.com'}],technicians:[{id:'tech-1',name:'Tech One'}],attentionSettings:{notStartedAttentionDays:2,staleAttentionDays:3,clientResponseAttentionDays:2},workOrders:[
 wo(60,'Checked in',{customerId:1,assignedTo:'tech-1',checkInAt:'2026-09-06T12:00:00Z'}),
],sales:[
 {id:70,status:'open',type:'sale',customerId:1,items:[],createdAt:'2026-09-09T12:00:00Z'},
 {id:71,status:'open',type:'consultation',customerId:1,items:[{description:'Consultation'}],createdAt:'2026-09-09T12:00:00Z'},
 {id:72,status:'open',type:'sale',customerId:1,items:[{description:'Phone Case',requiresOrder:true,orderStatus:'ordered',orderDate:'2026-09-10'}],createdAt:'2026-09-09T12:00:00Z'},
],calendarNotes:[{id:'n1',date:'2026-09-10',subject:'Call supplier',body:'Confirm shipment'}]});
assert.ok(attentionModel.needsAttention.some(row=>row.id===60&&row.attentionReasons.some(reason=>reason.code==='not-started')),'Stalled check-ins must enter Needs Attention with a reason.');
assert.ok(attentionModel.needsAttention.some(row=>row.id===70&&row.attentionReasons.some(reason=>reason.code==='missing-line-items')),'Empty sales must enter Needs Attention.');
assert.ok(attentionModel.needsAttention.some(row=>row.id===71&&row.attentionReasons.some(reason=>reason.code==='consultation-unscheduled')),'Unscheduled consultations must enter Needs Attention.');
assert.deepEqual(attentionModel.productDeliveries.map(row=>row.id),[72],'Ordered sale products must appear in Product Delivery.');
assert.deepEqual(attentionModel.today.notes.map(row=>row.id),['n1'],'Today notes must be projected into the Command Center agenda.');
const stalePanelRecord={...attentionModel.needsAttention.find(row=>row.id===60)};
const cleanModel=buildCommandCenterModel({now,customers:[{id:1,firstName:'Ada',lastName:'Lovelace'}],technicians:[{id:'tech-1',name:'Tech One'}],workOrders:[wo(60,'Repair',{customerId:1,assignedTo:'tech-1',items:[{repair:'HDMI Port Repair'}],lastTechnicianActivityAt:'2026-09-10T14:00:00Z'})]});
assert.equal(liveCommandCenterPanelRecords('Needs Attention',cleanModel,[stalePanelRecord]).length,0,'Resolved alerts must disappear from an already-open Needs Attention panel.');

const reasons=[
 ...attentionReasonsForWorkOrder({status:'open',workflowStage:'Approval',approvalRequestedAt:'2026-09-01',promisedAt:'2026-09-09',emailDeliveryStatus:'failed',unreadClientReplies:2,pendingSync:true},{now}),
 ...attentionReasonsForWorkOrder({status:'open',workflowStage:'Parts',partEta:'2026-09-08'},{now}),
];
for(const code of ['approval-overdue','promise-overdue','part-overdue','email-failed','client-reply-unread','sync-pending'])assert.ok(reasons.some(reason=>reason.code===code),`Missing ${code}`);
console.log('Command Center workflow projection checks passed.');
