import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildCommandCenterModel, removeCommandCenterRecord, searchCommandCenterRecords, type CommandCenterRecord } from '@/lib/commandCenter';
import { reconcileLegacyWorkOrders } from '@/lib/workOrderCleanup';
import { shouldOpenAttentionPanel } from '@/lib/commandCenterPresentation';
import { attentionReasonsForWorkOrder, pickupLifecycleFor } from '@/lib/workOrderLifecycle';
import { supabase } from '@/lib/supabase';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import CommandCenterRecordHoverCard from './CommandCenterRecordHoverCard';
import { useContextMenu } from '@/lib/useContextMenu';
import '@/styles/command-center.css';

type Props = {
  keyword: string;
  onOpenInvoices: (mode?: 'all' | 'workorders' | 'sales') => void;
  onOpenModal: (type: string, payload?: any) => void;
  attentionRequest?: number;
};

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
const relativeAge = (value: string) => {
  const then = new Date(value || 0).getTime();
  if (!Number.isFinite(then) || !then) return 'No activity time';
  const hours = Math.max(0, Math.floor((Date.now() - then) / 3_600_000));
  return hours < 1 ? 'Updated recently' : hours < 24 ? `${hours}h since activity` : `${Math.floor(hours / 24)}d since activity`;
};

export default function CommandCenter(props: Props) {
  const [data, setData] = useState({ customers: [] as any[], technicians: [] as any[], workOrders: [] as any[], sales: [] as any[], calendarEvents: [] as any[], purchaseOrders: [] as any[] });
  const [loading, setLoading] = useState(true);
  const [clientResponses,setClientResponses]=useState<any[]>([]);
  const [selectedResponse,setSelectedResponse]=useState<any|null>(null);
  const [staffReply,setStaffReply]=useState('');
  const [replyBusy,setReplyBusy]=useState(false);
  const [panel, setPanel] = useState<{ title: string; records?: CommandCenterRecord[]; kind?: 'today' } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ today: false, pickup: false });
  const recordMenu = useContextMenu<CommandCenterRecord>();
  const responseMenu = useContextMenu<any>();
  const longPressTimer = useRef<number | null>(null);
  const longPressConsumed = useRef(false);
  const lastAttentionRequest = useRef(0);

  const load = useCallback(async () => {
    const api: any = (window as any).api;
    if (!api) return setLoading(false);
    try {
      const [customers, technicians, workOrders, sales, calendarEvents, purchaseOrders, settingsRows, responseResult] = await Promise.all([
        (api.getCustomers?.() ?? api.dbGet('customers')).catch(() => []),
        api.dbGet('technicians').catch(() => []),
        (api.getWorkOrders?.({ limit: 2000, sortBy: 'activityAt', sortDir: 'desc' }) ?? api.dbGet('workOrders')).catch(() => []),
        api.dbGet('sales').catch(() => []),
        api.dbGet('calendarEvents').catch(() => []),
        api.dbGet('purchaseOrders').catch(() => []),
        api.dbGet('settings').catch(() => []),
        supabase.from('client_responses').select('*').is('resolved_at',null).order('created_at',{ascending:false}).limit(100),
      ]);
      const cleanup = await reconcileLegacyWorkOrders(api, { workOrders: workOrders || [], settings: settingsRows?.[0]?.ticketCleanupSettings });
      const updatedById = new Map(cleanup.updatedRecords.map(record => [String(record.id), record]));
      const reconciledWorkOrders = (workOrders || []).map((record: any) => updatedById.get(String(record.id)) || record);
      setData({ customers: customers || [], technicians: technicians || [], workOrders: reconciledWorkOrders, sales: sales || [], calendarEvents: calendarEvents || [], purchaseOrders: purchaseOrders || [] });
      if(!responseResult.error) setClientResponses(responseResult.data||[]);
      for(const workOrder of reconciledWorkOrders){
        if(!pickupLifecycleFor(workOrder).reminderDue) continue;
        try{
          const {data:reminder}=await supabase.functions.invoke('client-updates',{body:{recordType:'repair',recordId:Number(workOrder.id),statusKey:'pickup_reminder',deliveryMode:'email'}});
          if(reminder?.ok) await api.dbUpdate('workOrders',workOrder.id,{...workOrder,pickupReminderSentAt:new Date().toISOString()});
        }catch(error){console.warn('Automatic pickup reminder is still pending',error)}
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const api: any = (window as any).api;
    const offs = [api?.onWorkOrdersChanged?.(load), api?.onSalesChanged?.(load), api?.onCustomersChanged?.(load), api?.onTechniciansChanged?.(load), api?.onCalendarEventsChanged?.(load), api?.onPurchaseOrdersChanged?.(load)];
    return () => offs.forEach(off => { try { off?.(); } catch {} });
  }, [load]);
  useEffect(()=>{const channel=supabase.channel('command-center-client-responses').on('postgres_changes',{event:'*',schema:'public',table:'client_responses'},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel)}},[load]);

  const model = useMemo(() => buildCommandCenterModel(data), [data]);
  const responseRecord=(reply:any)=>model.workOrders.find(row=>String(row.id)===String(reply.legacy_record_id));
  const resolveResponse=async(reply:any)=>{await supabase.from('client_responses').update({resolved_at:new Date().toISOString(),unread:false}).eq('id',reply.id);setClientResponses(rows=>rows.filter(row=>row.id!==reply.id));setSelectedResponse(null);};
  const unresolveResponse=async(reply:any)=>{await supabase.from('client_responses').update({resolved_at:null,unread:true}).eq('id',reply.id);await load();};
  const acknowledgeResponse=async(reply:any)=>{const action=reply.response_type==='approved'?'approval_received':reply.response_type==='declined'?'repair_declined':'';if(action){const {error}=await supabase.functions.invoke('client-updates',{body:{recordType:'repair',recordId:Number(reply.legacy_record_id),statusKey:action,notes:`Client response acknowledged: ${reply.message||reply.response_type}`,deliveryMode:'email',idempotencyKey:`client-response:${reply.id}:acknowledge`}});if(error)throw error;}await supabase.from('client_responses').update({acknowledged_at:new Date().toISOString(),unread:false}).eq('id',reply.id);await load();};
  const sendReply=async()=>{if(!selectedResponse||!staffReply.trim())return;setReplyBusy(true);try{const {data:sent,error}=await supabase.functions.invoke('client-updates',{body:{recordType:'repair',recordId:Number(selectedResponse.legacy_record_id),statusKey:'manual_update',notes:staffReply.trim(),deliveryMode:'email'}});if(error||!sent?.ok)throw error||new Error(sent?.error||'Reply failed');await supabase.from('client_responses').insert({shop_id:selectedResponse.shop_id,work_order_id:selectedResponse.work_order_id,legacy_record_id:selectedResponse.legacy_record_id,customer_id:selectedResponse.customer_id,response_type:'staff_reply',message:staffReply.trim(),unread:false,resolved_at:new Date().toISOString(),delivery_status:sent.deliveryStatus||'sent'});setStaffReply('');await resolveResponse(selectedResponse);}catch(error:any){window.alert(error?.message||'Reply could not be sent.');}finally{setReplyBusy(false)}};
  const searchResults = useMemo(() => searchCommandCenterRecords(model, props.keyword), [model, props.keyword]);
  const openRecord = async (record: CommandCenterRecord) => {
    const api: any = (window as any).api;
    if (record.kind === 'workorder') await api?.openNewWorkOrder?.({ workOrderId: record.id });
    else await api?.openNewSale?.({ id: record.id, customerId: record.customerId, customerName: record.customerName });
  };
  const showRecords = (title: string, records: CommandCenterRecord[]) => setPanel({ title, records });
  const recordLabel = (record: CommandCenterRecord) => record.kind === 'workorder' ? record.deviceLabel : record.title;
  const openRecordMenu = (event: React.MouseEvent, record: CommandCenterRecord) => recordMenu.openFromEvent(event, record);
  const cancelLongPress = () => {
    if (longPressTimer.current != null) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  };
  const longPressHandlers = (record: CommandCenterRecord) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      cancelLongPress();
      const { clientX, clientY } = event;
      longPressTimer.current = window.setTimeout(() => {
        longPressConsumed.current = true;
        recordMenu.openAt(clientX, clientY, record);
        try { navigator.vibrate?.(18); } catch {}
      }, 520);
    },
    onPointerMove: cancelLongPress,
    onPointerUp: cancelLongPress,
    onPointerCancel: cancelLongPress,
    onPointerLeave: cancelLongPress,
  });
  const responseLongPressHandlers = (reply: any) => ({
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
      cancelLongPress();
      const { clientX, clientY } = event;
      longPressTimer.current = window.setTimeout(() => {
        longPressConsumed.current = true;
        responseMenu.openAt(clientX, clientY, reply);
        try { navigator.vibrate?.(18); } catch {}
      }, 520);
    },
    onPointerMove: cancelLongPress, onPointerUp: cancelLongPress, onPointerCancel: cancelLongPress, onPointerLeave: cancelLongPress,
  });
  const activateRecord = (record: CommandCenterRecord) => {
    if (longPressConsumed.current) { longPressConsumed.current = false; return; }
    void openRecord(record);
  };
  const menuRecord = recordMenu.state.data;
  const recordMenuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menuRecord) return [];
    const api: any = (window as any).api;
    const invoice = `GB${String(menuRecord.id).padStart(7, '0')}`;
    const isWorkOrder = menuRecord.kind === 'workorder';
    return [
      { type: 'header', label: `${isWorkOrder ? 'Work Order' : menuRecord.kind === 'consultation' ? 'Consultation' : 'Sale'} ${invoice}` },
      { label: 'Edit / Open', onClick: () => openRecord(menuRecord) },
      { label: 'View Customer', disabled: !menuRecord.customerId, onClick: async () => { await api?.openCustomerOverview?.(menuRecord.customerId); } },
      { type: 'separator' },
      { label: 'Copy Invoice #', onClick: async () => { try { await navigator.clipboard.writeText(invoice); } catch {} } },
      ...(isWorkOrder ? [
        { type: 'separator' } as ContextMenuItem,
        { label: 'Close Work Order', onClick: async () => {
          const source = data.workOrders.find((record: any) => String(record.id) === String(menuRecord.id));
          if (!source || !window.confirm(`Close work order ${invoice}? No payment will be added.`)) return;
          const closed = { ...source, status: 'closed', updatedAt: new Date().toISOString() };
          setData(current => ({ ...current, workOrders: current.workOrders.map((record:any) => String(record.id) === String(menuRecord.id) ? closed : record) }));
          setPanel(current => current?.records ? { ...current, records: removeCommandCenterRecord(current.records, menuRecord) } : current);
          await api?.dbUpdate?.('workOrders', menuRecord.id, closed);
          await load();
        } } as ContextMenuItem,
        { label: 'Print Customer Receipt', onClick: async () => { await api?.openCustomerReceipt?.({ workOrderId: menuRecord.id }); } } as ContextMenuItem,
        { label: 'Print Release Form', onClick: async () => { await api?.openReleaseForm?.({ workOrderId: menuRecord.id }); } } as ContextMenuItem,
      ] : []),
      { type: 'separator' },
      { label: 'Delete…', danger: true, onClick: async () => { if (window.confirm(`Delete ${invoice}? This cannot be undone.`)) { await api?.dbDelete?.(isWorkOrder ? 'workOrders' : 'sales', menuRecord.id); setPanel(current => current?.records ? { ...current, records: removeCommandCenterRecord(current.records, menuRecord) } : current); await load(); } } },
    ];
  }, [data.workOrders, load, menuRecord]);
  const menuResponse=responseMenu.state.data;
  const responseMenuItems=useMemo<ContextMenuItem[]>(()=>{
    if(!menuResponse)return[];
    const record=responseRecord(menuResponse);
    const customer=data.customers.find((row:any)=>String(row.id)===String(record?.customerId));
    const phone=String(customer?.phone||record?.source?.customerPhone||'').trim();
    const contact=`${record?.customerName||`WO #${menuResponse.legacy_record_id}`}\n${phone}\n${customer?.email||record?.source?.customerEmail||''}`;
    return [
      {type:'header',label:`${record?.customerName||'Client'} · WO #${menuResponse.legacy_record_id}`},
      {label:'Open Work Order',onClick:()=>record&&openRecord(record)},
      {label:'Acknowledge & Advance',disabled:!!menuResponse.acknowledged_at,onClick:()=>acknowledgeResponse(menuResponse)},
      {label:'Respond by Email',onClick:()=>setSelectedResponse(menuResponse)},
      {label:'Call Client',disabled:!phone,onClick:()=>{window.location.href=`tel:${phone.replace(/[^\d+]/g,'')}`;}},
      {type:'separator'},
      menuResponse.resolved_at?{label:'Mark Unresolved',onClick:()=>unresolveResponse(menuResponse)}:{label:'Mark Resolved',onClick:()=>resolveResponse(menuResponse)},
      {label:'Reopen Conversation',onClick:async()=>{await unresolveResponse(menuResponse);setSelectedResponse(menuResponse);}},
      {label:'Copy Contact Information',onClick:async()=>{try{await navigator.clipboard.writeText(contact)}catch{}}},
    ];
  },[data.customers,menuResponse,model.workOrders]);
  const toggle = (key: string) => setCollapsed(current => ({ ...current, [key]: !current[key] }));
  useEffect(() => {
    const currentRequest = Number(props.attentionRequest || 0);
    const shouldOpen = shouldOpenAttentionPanel(lastAttentionRequest.current, currentRequest);
    lastAttentionRequest.current = currentRequest;
    if (shouldOpen) setPanel({ title: 'Needs Attention', records: model.activeWorkOrders.filter(row => row.customerName.startsWith('Client #') || row.technician === 'Unassigned' || row.technician === 'Unknown technician' || clientResponses.some(reply=>String(reply.legacy_record_id)===String(row.id)&&(reply.unread||!reply.resolved_at)) || attentionReasonsForWorkOrder(row.source).length>0) });
  }, [model, props.attentionRequest,clientResponses]);

  return <div className="command-center">
    <div className="command-center-heading"><div><h1>Command Center</h1><span>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span></div><div><button onClick={() => void load()}>Refresh</button></div></div>
    {loading ? <div className="command-center-loading">Loading current shop activity…</div> : null}
    {props.keyword.trim() ? <div className="command-center-search-results"><header><strong>Search results</strong><span>{searchResults.length} matches · Command Center remains open</span></header>{searchResults.length ? searchResults.map(record => <button key={`${record.kind}-${record.id}`} onClick={() => activateRecord(record)} onContextMenu={event => openRecordMenu(event, record)} {...longPressHandlers(record)}><strong>{record.customerName}</strong><span>{recordLabel(record)}</span><em>{record.kind === 'workorder' ? `WO #${record.id}` : `Invoice #${record.id}`}</em></button>) : <p>No matching clients, work orders, sales, consultations, devices, or invoices.</p>}</div> : null}
    <div className="command-center-metrics">
      <button onClick={() => showRecords('Active Work Orders', model.activeWorkOrders)}><span>Active work orders</span><strong>{model.activeWorkOrders.length}</strong><small>{model.activeWorkOrders.filter(r => r.technician === 'Unassigned').length} unassigned</small></button>
      <button className="parts" onClick={() => showRecords('Awaiting Parts', model.awaitingParts)}><span>Awaiting parts</span><strong>{model.awaitingParts.length}</strong><small>{model.today.deliveries.length} arriving today</small></button>
      <button className="ready" onClick={() => showRecords('Ready for Pickup', model.readyForPickup)}><span>Ready for pickup</span><strong>{model.readyForPickup.length}</strong><small>{money(model.readyForPickup.reduce((sum, row) => sum + row.remaining, 0))} outstanding</small></button>
      <button onClick={() => showRecords('Collected Today', model.records.filter(row => new Date(row.activityAt).toDateString() === new Date().toDateString()))}><span>Collected today</span><strong>{money(model.collectedToday)}</strong><small>{model.paymentsToday} payments</small></button>
    </div>
    <div className="command-center-stages">{['Checked in', 'Diagnosing', 'Approval', 'Parts', 'Repair', 'Testing', 'Pickup'].map(stage => <button key={stage} onClick={() => showRecords(`${stage} Repairs`, model.stages[stage] || [])}><span>{stage}</span><strong>{model.stages[stage]?.length || 0}</strong></button>)}</div>
    <div className="command-center-grid">
      <section className="command-center-section queue"><header><strong>Today’s Repair Queue</strong><div><button onClick={() => showRecords('Today’s Repair Queue', model.repairQueue)}>Open Full Queue</button><button className="command-center-section-toggle" onClick={() => toggle('queue')} aria-expanded={!collapsed.queue}>{collapsed.queue ? '›' : '⌄'}</button></div></header>{!collapsed.queue ? model.repairQueue.slice(0, 6).map(record => <button className={record.expedited ? 'command-center-row expedited' : 'command-center-row'} key={record.id} onClick={() => activateRecord(record)} onContextMenu={event => openRecordMenu(event, record)} {...longPressHandlers(record)}><i className={record.expedited ? 'expedited' : record.stage === 'Checked in' ? 'urgent' : record.stage === 'Pickup' ? 'good' : ''} /><CommandCenterRecordHoverCard record={record} className="command-center-row-copy"><strong>{record.deviceLabel}{record.expedited ? <b className="command-center-expedited-badge">Expedited</b> : null}</strong><small>{record.customerName} · {record.problem}</small><small className="command-center-row-meta">WO #{record.id} · {relativeAge(record.activityAt)}</small></CommandCenterRecordHoverCard><em>{record.stage}</em></button>) : null}{!collapsed.queue && !model.repairQueue.length ? <p className="command-center-empty">No actionable repairs right now.</p> : null}</section>
      <section className="command-center-section client-replies"><header><strong>Client Replies</strong><div><button onClick={()=>setPanel({title:'Client Replies',records:clientResponses.map(responseRecord).filter(Boolean) as CommandCenterRecord[]})}>View All ({clientResponses.length})</button><button className="command-center-section-toggle" onClick={()=>toggle('replies')}>{collapsed.replies?'›':'⌄'}</button></div></header>{!collapsed.replies?clientResponses.slice(0,5).map(reply=>{const record=responseRecord(reply);const preview=`${record?.customerName||'Client'} · WO #${reply.legacy_record_id}\n${record?.deviceLabel||'Device'}\n${record?.problem||''}\n${reply.message||`Client ${reply.response_type}`}`;return <button className="command-center-row" key={reply.id} title={preview} onClick={()=>setSelectedResponse(reply)} onContextMenu={event=>responseMenu.openFromEvent(event,reply)} {...responseLongPressHandlers(reply)}><i className={reply.response_type==='question'||reply.response_type==='pickup_change_requested'?'urgent':'good'}/><span><strong>{record?.customerName||`WO #${reply.legacy_record_id}`} · {String(reply.response_type).replaceAll('_',' ').toUpperCase()}</strong><small>{record?.deviceLabel||'Device'} · WO #{reply.legacy_record_id}</small><small>{reply.message||'No message included'}</small></span><em>{reply.unread?'New':'Open'}</em></button>}):null}</section>
      <section className="command-center-section"><header><strong>Today</strong><div><button onClick={() => props.onOpenModal('calendar')}>Open Full Calendar</button><button className="command-center-section-toggle" onClick={() => toggle('today')} aria-expanded={!collapsed.today}>{collapsed.today ? '›' : '⌄'}</button></div></header>{!collapsed.today ? <div className="command-center-today">{[['Tasks', model.today.tasks.length], ['Events', model.today.events.length], ['Consultations', model.today.consultations.length], ['Deliveries', model.today.deliveries.length]].map(([label, count]) => <button key={String(label)} onClick={() => props.onOpenModal('calendar')}><span>{label}</span><strong>{count}</strong></button>)}</div> : null}</section>
      <section className="command-center-section"><header><strong>Ready for Pickup</strong><div><button onClick={() => showRecords('Ready for Pickup', model.readyForPickup)}>View All</button><button className="command-center-section-toggle" onClick={() => toggle('pickup')} aria-expanded={!collapsed.pickup}>{collapsed.pickup ? '›' : '⌄'}</button></div></header>{!collapsed.pickup ? model.readyForPickup.slice(0, 5).map(record => <button className="command-center-row" key={record.id} onClick={() => activateRecord(record)} onContextMenu={event => openRecordMenu(event, record)} {...longPressHandlers(record)}><i className="good" /><span><strong>{record.title}</strong><small>{record.customerName} · {record.remaining ? `${money(record.remaining)} due` : 'Paid'}</small></span><em>Open</em></button>) : null}</section>
    </div>
    {panel ? <div className="command-center-panel-layer" onMouseDown={event => { if (event.target === event.currentTarget) setPanel(null); }}><section className="command-center-panel"><header><h2>{panel.title}</h2><div><button title="Open in separate window" onClick={() => window.open(window.location.href, '_blank', 'width=1100,height=800')}>↗</button><button aria-label="Close" onClick={() => setPanel(null)}>×</button></div></header><div className="command-center-panel-table"><table><thead><tr><th>Record</th><th>Device / Client</th><th>Status</th><th>Technician</th><th>Balance</th><th>Activity</th></tr></thead><tbody>{(panel.records || []).map(record => <tr className={record.expedited ? 'expedited' : ''} key={`${record.kind}-${record.id}`} onDoubleClick={() => activateRecord(record)} onContextMenu={event => openRecordMenu(event, record)} {...longPressHandlers(record)}><td>{record.kind === 'workorder' ? `WO #${record.id}` : `Invoice #${record.id}`}</td><td><CommandCenterRecordHoverCard record={record} className="command-center-panel-record"><strong>{recordLabel(record)}{record.expedited ? <b className="command-center-expedited-badge">Expedited</b> : null}</strong><small>{record.kind === 'workorder' ? `${record.customerName} · ${record.problem}` : record.customerName}</small></CommandCenterRecordHoverCard></td><td>{record.stage || record.status}</td><td>{record.technician}</td><td>{money(record.remaining)}</td><td>{relativeAge(record.activityAt)}</td></tr>)}</tbody></table></div>{!(panel.records || []).length ? <p className="command-center-empty">No matching records.</p> : null}</section></div> : null}
    <ContextMenu id="command-center-record-menu" open={recordMenu.state.open} x={recordMenu.state.x} y={recordMenu.state.y} items={recordMenuItems} onClose={recordMenu.close} zIndex={240} />
    <ContextMenu id="command-center-response-menu" open={responseMenu.state.open} x={responseMenu.state.x} y={responseMenu.state.y} items={responseMenuItems} onClose={responseMenu.close} zIndex={245} />
    {selectedResponse ? <div className="command-center-panel-layer" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedResponse(null)}}><section className="command-center-panel command-center-reply"><header><h2>Client Reply · WO #{selectedResponse.legacy_record_id}</h2><button aria-label="Close" onClick={()=>setSelectedResponse(null)}>×</button></header><div className="command-center-reply-body"><strong>{responseRecord(selectedResponse)?.customerName||'Client'} · {responseRecord(selectedResponse)?.deviceLabel||'Device'}</strong><p>{selectedResponse.message||`Client ${selectedResponse.response_type} the repair.`}</p><label>Send Reply<textarea value={staffReply} onChange={event=>setStaffReply(event.target.value)} placeholder="Type a response to the client…" /></label><div><button onClick={()=>{const record=responseRecord(selectedResponse);if(record)void openRecord(record)}}>Open Work Order</button><button onClick={()=>void resolveResponse(selectedResponse)}>Mark Resolved</button><button className="send" disabled={replyBusy||!staffReply.trim()} onClick={()=>void sendReply()}>{replyBusy?'Sending…':'Send Reply'}</button></div></div></section></div>:null}
  </div>;
}
