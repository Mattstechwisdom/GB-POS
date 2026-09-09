import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { buildCommandCenterModel, searchCommandCenterRecords, type CommandCenterRecord } from '@/lib/commandCenter';
import '@/styles/command-center.css';

type Props = {
  keyword: string;
  onOpenInvoices: (mode?: 'all' | 'workorders' | 'sales') => void;
  onOpenModal: (type: string, payload?: any) => void;
  onOpenFilters: () => void;
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
  const [panel, setPanel] = useState<{ title: string; records?: CommandCenterRecord[]; kind?: 'today' } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ today: false, pickup: false });

  const load = useCallback(async () => {
    const api: any = (window as any).api;
    if (!api) return setLoading(false);
    try {
      const [customers, technicians, workOrders, sales, calendarEvents, purchaseOrders] = await Promise.all([
        (api.getCustomers?.() ?? api.dbGet('customers')).catch(() => []),
        api.dbGet('technicians').catch(() => []),
        (api.getWorkOrders?.({ limit: 2000, sortBy: 'activityAt', sortDir: 'desc' }) ?? api.dbGet('workOrders')).catch(() => []),
        api.dbGet('sales').catch(() => []),
        api.dbGet('calendarEvents').catch(() => []),
        api.dbGet('purchaseOrders').catch(() => []),
      ]);
      setData({ customers: customers || [], technicians: technicians || [], workOrders: workOrders || [], sales: sales || [], calendarEvents: calendarEvents || [], purchaseOrders: purchaseOrders || [] });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    const api: any = (window as any).api;
    const offs = [api?.onWorkOrdersChanged?.(load), api?.onSalesChanged?.(load), api?.onCustomersChanged?.(load), api?.onTechniciansChanged?.(load), api?.onCalendarEventsChanged?.(load), api?.onPurchaseOrdersChanged?.(load)];
    return () => offs.forEach(off => { try { off?.(); } catch {} });
  }, [load]);

  const model = useMemo(() => buildCommandCenterModel(data), [data]);
  const searchResults = useMemo(() => searchCommandCenterRecords(model, props.keyword), [model, props.keyword]);
  const openRecord = async (record: CommandCenterRecord) => {
    const api: any = (window as any).api;
    if (record.kind === 'workorder') await api?.openNewWorkOrder?.({ workOrderId: record.id });
    else await api?.openNewSale?.({ id: record.id, customerId: record.customerId, customerName: record.customerName });
  };
  const showRecords = (title: string, records: CommandCenterRecord[]) => setPanel({ title, records });
  const toggle = (key: string) => setCollapsed(current => ({ ...current, [key]: !current[key] }));
  useEffect(() => {
    if (!props.attentionRequest) return;
    setPanel({ title: 'Needs Attention', records: model.activeWorkOrders.filter(row => row.customerName.startsWith('Client #') || row.technician === 'Unassigned' || row.technician === 'Unknown technician') });
  }, [model, props.attentionRequest]);

  return <div className="command-center">
    <div className="command-center-heading"><div><h1>Command Center</h1><span>{new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span></div><div><button onClick={props.onOpenFilters}>Filters</button><button onClick={() => void load()}>Refresh</button></div></div>
    {loading ? <div className="command-center-loading">Loading current shop activity…</div> : null}
    {props.keyword.trim() ? <div className="command-center-search-results"><header><strong>Search results</strong><span>{searchResults.length} matches · Command Center remains open</span></header>{searchResults.length ? searchResults.map(record => <button key={`${record.kind}-${record.id}`} onClick={() => void openRecord(record)}><strong>{record.customerName}</strong><span>{record.title}</span><em>{record.kind === 'workorder' ? `WO #${record.id}` : `Invoice #${record.id}`}</em></button>) : <p>No matching clients, work orders, sales, consultations, devices, or invoices.</p>}</div> : null}
    <div className="command-center-metrics">
      <button onClick={() => showRecords('Active Work Orders', model.activeWorkOrders)}><span>Active work orders</span><strong>{model.activeWorkOrders.length}</strong><small>{model.activeWorkOrders.filter(r => r.technician === 'Unassigned').length} unassigned</small></button>
      <button className="parts" onClick={() => showRecords('Awaiting Parts', model.awaitingParts)}><span>Awaiting parts</span><strong>{model.awaitingParts.length}</strong><small>{model.today.deliveries.length} arriving today</small></button>
      <button className="ready" onClick={() => showRecords('Ready for Pickup', model.readyForPickup)}><span>Ready for pickup</span><strong>{model.readyForPickup.length}</strong><small>{money(model.readyForPickup.reduce((sum, row) => sum + row.remaining, 0))} outstanding</small></button>
      <button onClick={() => showRecords('Collected Today', model.records.filter(row => new Date(row.activityAt).toDateString() === new Date().toDateString()))}><span>Collected today</span><strong>{money(model.collectedToday)}</strong><small>{model.paymentsToday} payments</small></button>
    </div>
    <div className="command-center-stages">{['Checked in', 'Diagnosing', 'Approval', 'Parts', 'Repair', 'Testing', 'Pickup'].map(stage => <button key={stage} onClick={() => showRecords(`${stage} Repairs`, model.stages[stage] || [])}><span>{stage}</span><strong>{model.stages[stage]?.length || 0}</strong></button>)}</div>
    <div className="command-center-grid">
      <section className="command-center-section queue"><header><strong>Today’s Repair Queue</strong><div><button onClick={() => showRecords('Today’s Repair Queue', model.repairQueue)}>Open Full Queue</button><button className="command-center-section-toggle" onClick={() => toggle('queue')} aria-expanded={!collapsed.queue}>{collapsed.queue ? '›' : '⌄'}</button></div></header>{!collapsed.queue ? model.repairQueue.slice(0, 6).map(record => <button className="command-center-row" key={record.id} onClick={() => void openRecord(record)}><i className={record.stage === 'Checked in' ? 'urgent' : record.stage === 'Pickup' ? 'good' : ''} /><span><strong>{record.title}</strong><small>WO #{record.id} · {record.customerName} · {relativeAge(record.activityAt)}</small></span><em>{record.stage}</em></button>) : null}{!collapsed.queue && !model.repairQueue.length ? <p className="command-center-empty">No actionable repairs right now.</p> : null}</section>
      <section className="command-center-section"><header><strong>Today</strong><div><button onClick={() => props.onOpenModal('calendar')}>Open Full Calendar</button><button className="command-center-section-toggle" onClick={() => toggle('today')} aria-expanded={!collapsed.today}>{collapsed.today ? '›' : '⌄'}</button></div></header>{!collapsed.today ? <div className="command-center-today">{[['Tasks', model.today.tasks.length], ['Events', model.today.events.length], ['Consultations', model.today.consultations.length], ['Deliveries', model.today.deliveries.length]].map(([label, count]) => <button key={String(label)} onClick={() => props.onOpenModal('calendar')}><span>{label}</span><strong>{count}</strong></button>)}</div> : null}</section>
      <section className="command-center-section"><header><strong>Ready for Pickup</strong><div><button onClick={() => showRecords('Ready for Pickup', model.readyForPickup)}>View All</button><button className="command-center-section-toggle" onClick={() => toggle('pickup')} aria-expanded={!collapsed.pickup}>{collapsed.pickup ? '›' : '⌄'}</button></div></header>{!collapsed.pickup ? model.readyForPickup.slice(0, 5).map(record => <button className="command-center-row" key={record.id} onClick={() => void openRecord(record)}><i className="good" /><span><strong>{record.title}</strong><small>{record.customerName} · {record.remaining ? `${money(record.remaining)} due` : 'Paid'}</small></span><em>Open</em></button>) : null}</section>
    </div>
    {panel ? <div className="command-center-panel-layer" onMouseDown={event => { if (event.target === event.currentTarget) setPanel(null); }}><section className="command-center-panel"><header><h2>{panel.title}</h2><div><button title="Open in separate window" onClick={() => window.open(window.location.href, '_blank', 'width=1100,height=800')}>↗</button><button aria-label="Close" onClick={() => setPanel(null)}>×</button></div></header><div className="command-center-panel-table"><table><thead><tr><th>Record</th><th>Client / Device</th><th>Status</th><th>Technician</th><th>Balance</th><th>Activity</th></tr></thead><tbody>{(panel.records || []).map(record => <tr key={`${record.kind}-${record.id}`} onDoubleClick={() => void openRecord(record)}><td>{record.kind === 'workorder' ? `WO #${record.id}` : `Invoice #${record.id}`}</td><td><strong>{record.customerName}</strong><small>{record.title}</small></td><td>{record.stage || record.status}</td><td>{record.technician}</td><td>{money(record.remaining)}</td><td>{relativeAge(record.activityAt)}</td></tr>)}</tbody></table></div>{!(panel.records || []).length ? <p className="command-center-empty">No matching records.</p> : null}</section></div> : null}
  </div>;
}
