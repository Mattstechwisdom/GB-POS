const assert=require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'CommonJS',moduleResolution:'Node'}});
const {buildRepairWorkflowTiming}=require('../src/lib/repairWorkflowReporting.ts');
const events=[
 {legacy_record_id:1,action:'diagnosis',occurred_at:'2026-09-01T10:00:00Z'},
 {legacy_record_id:1,action:'repair_approval',occurred_at:'2026-09-01T11:00:00Z'},
 {legacy_record_id:1,action:'approval_received',occurred_at:'2026-09-01T13:00:00Z'},
 {legacy_record_id:1,action:'part_ordered',occurred_at:'2026-09-01T14:00:00Z'},
 {legacy_record_id:1,action:'part_delivered',occurred_at:'2026-09-03T14:00:00Z'},
 {legacy_record_id:1,action:'testing_in_progress',occurred_at:'2026-09-03T15:00:00Z'},
 {legacy_record_id:1,action:'repair_complete',occurred_at:'2026-09-03T16:00:00Z'},
 {legacy_record_id:1,action:'picked_up',occurred_at:'2026-09-04T16:00:00Z'},
];
const result=buildRepairWorkflowTiming(events);
assert.equal(result.jobs,1);
assert.equal(result.averages.approvalHours,2);
assert.equal(result.averages.partWaitHours,48);
assert.equal(result.averages.testingHours,1);
assert.equal(result.averages.pickupHours,24);
assert.equal('revenue' in result,false,'Workflow timing must not invent financial reporting.');
console.log('Repair workflow reporting checks passed.');
