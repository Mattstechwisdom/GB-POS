type WorkflowEvent = { legacy_record_id?: string|number; legacyRecordId?: string|number; action: string; occurred_at?: string; occurredAt?: string };
type Metrics = { diagnosisHours:number[]; approvalHours:number[]; partWaitHours:number[]; repairHours:number[]; testingHours:number[]; pickupHours:number[] };
const hours=(start:number,end:number)=>Math.round(Math.max(0,end-start)/36000)/100;
const average=(values:number[])=>values.length?Math.round(values.reduce((sum,value)=>sum+value,0)/values.length*100)/100:0;

export function buildRepairWorkflowTiming(events: WorkflowEvent[]) {
  const groups=new Map<string,WorkflowEvent[]>();
  for(const event of events||[]){const id=String(event.legacy_record_id??event.legacyRecordId??'');if(!id)continue;groups.set(id,[...(groups.get(id)||[]),event]);}
  const metrics:Metrics={diagnosisHours:[],approvalHours:[],partWaitHours:[],repairHours:[],testingHours:[],pickupHours:[]};
  const time=(event?:WorkflowEvent)=>new Date(event?.occurred_at||event?.occurredAt||0).getTime();
  for(const rows of groups.values()){
    rows.sort((a,b)=>time(a)-time(b));
    const find=(action:string)=>rows.find(row=>row.action===action);
    const pair=(from:string,to:string,target:keyof Metrics)=>{const start=time(find(from)),end=time(find(to));if(start&&end&&end>=start)metrics[target].push(hours(start,end));};
    pair('diagnosis','repair_approval','diagnosisHours');
    pair('repair_approval','approval_received','approvalHours');
    pair('part_ordered','part_delivered','partWaitHours');
    pair('approval_received','testing_in_progress','repairHours');
    pair('testing_in_progress','repair_complete','testingHours');
    pair('repair_complete','picked_up','pickupHours');
  }
  return {jobs:groups.size,averages:{diagnosisHours:average(metrics.diagnosisHours),approvalHours:average(metrics.approvalHours),partWaitHours:average(metrics.partWaitHours),repairHours:average(metrics.repairHours),testingHours:average(metrics.testingHours),pickupHours:average(metrics.pickupHours)}};
}
