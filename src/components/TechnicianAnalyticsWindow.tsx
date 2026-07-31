import React, { useEffect, useMemo, useState } from 'react';
import { computeTotals } from '../lib/calc';
import '../styles/technician-analytics.css';

type PeriodKey = '7' | '30' | '90' | 'all';

type AnalyticsData = {
  workOrders: any[];
  sales: any[];
  timeEntries: any[];
};

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: '7', label: '7 days' },
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: 'all', label: 'All time' },
];

function numberValue(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return numberValue(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function percent(value: number) {
  return `${Math.max(0, numberValue(value)).toFixed(1)}%`;
}

function normalize(value: any) {
  return String(value ?? '').trim().toLowerCase();
}

function technicianKeys(tech: any) {
  return new Set([
    tech?.id,
    tech?.legacyId,
    tech?.cloudId,
    tech?.nickname,
    tech?.firstName,
    tech?.first_name,
    [tech?.firstName, tech?.lastName].filter(Boolean).join(' '),
    [tech?.first_name, tech?.last_name].filter(Boolean).join(' '),
  ].map(normalize).filter(Boolean));
}

function assignedToTechnician(record: any, keys: Set<string>) {
  const values = [
    record?.assignedTo,
    record?.technician,
    record?.technicianName,
    record?.techName,
    record?.technicianId,
  ].map(normalize).filter(Boolean);
  return values.some(value => keys.has(value));
}

function recordDate(record: any) {
  const raw = record?.checkoutDate
    || record?.saleDate
    || record?.transactionDate
    || record?.invoiceDate
    || record?.checkInAt
    || record?.createdAt
    || record?.updatedAt
    || record?.date;
  const date = new Date(raw || 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function periodStart(period: PeriodKey) {
  if (period === 'all') return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (Number(period) - 1));
  return start;
}

function inPeriod(record: any, period: PeriodKey) {
  const date = recordDate(record);
  if (!date) return false;
  const start = periodStart(period);
  return !start || date >= start;
}

function saleItems(sale: any) {
  if (Array.isArray(sale?.items) && sale.items.length) return sale.items;
  if (sale?.itemDescription || sale?.price || sale?.quantity) {
    return [{
      description: sale.itemDescription || 'Sale Item',
      qty: sale.quantity || 1,
      price: sale.price || 0,
      category: sale.category,
      consultationHours: sale.consultationHours,
    }];
  }
  return [];
}

function isConsultationItem(item: any, sale?: any) {
  const category = normalize(item?.category || sale?.category);
  const description = normalize(item?.description || item?.name || item?.title || sale?.itemDescription);
  return category.startsWith('consult') || description.includes('consultation');
}

function isConsultationSale(sale: any) {
  if (normalize(sale?.category).startsWith('consult') || sale?.consultationType) return true;
  const items = saleItems(sale);
  return items.length > 0 && items.every((item: any) => isConsultationItem(item, sale));
}

function workOrderBilled(workOrder: any) {
  const saved = numberValue(workOrder?.totals?.total ?? workOrder?.total);
  if (saved > 0) return saved;
  return computeTotals({
    laborCost: numberValue(workOrder?.laborCost),
    partCosts: numberValue(workOrder?.partCosts),
    discount: numberValue(workOrder?.discount),
    taxRate: numberValue(workOrder?.taxRate),
    amountPaid: numberValue(workOrder?.amountPaid),
  }).total;
}

function saleBilled(sale: any) {
  const saved = numberValue(sale?.totals?.total ?? sale?.total);
  if (saved > 0) return saved;
  const gross = saleItems(sale).reduce((sum: number, item: any) => {
    const qty = Math.max(1, numberValue(item?.qty ?? item?.quantity) || 1);
    return sum + qty * numberValue(item?.price);
  }, 0);
  const subtotal = Math.max(0, gross - numberValue(sale?.discount));
  return subtotal + numberValue(sale?.tax);
}

function collected(record: any) {
  const direct = numberValue(record?.amountPaid);
  if (direct > 0) return direct;
  if (!Array.isArray(record?.payments)) return 0;
  return record.payments.reduce((sum: number, payment: any) => sum + numberValue(payment?.amount), 0);
}

function consultationHours(sale: any) {
  const saved = numberValue(sale?.consultationHours);
  if (saved > 0) return saved;
  return saleItems(sale)
    .filter((item: any) => isConsultationItem(item, sale))
    .reduce((sum: number, item: any) => {
      const hours = numberValue(item?.consultationHours ?? item?.qty ?? item?.quantity);
      return sum + Math.max(0, hours);
    }, 0);
}

function isClosed(record: any) {
  return normalize(record?.status) === 'closed' || !!record?.checkoutDate;
}

function turnaroundHours(workOrder: any) {
  const start = new Date(workOrder?.checkInAt || workOrder?.createdAt || 0);
  const end = new Date(workOrder?.checkoutDate || workOrder?.repairCompletionDate || 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
  return (end.getTime() - start.getTime()) / 3_600_000;
}

function timeEntryHours(entry: any) {
  const start = new Date(entry?.clockIn || 0);
  const end = new Date(entry?.clockOut || 0);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  return (end.getTime() - start.getTime()) / 3_600_000;
}

function average(total: number, count: number) {
  return count > 0 ? total / count : 0;
}

function formatHours(hours: number) {
  const safe = Math.max(0, numberValue(hours));
  return `${safe.toFixed(safe >= 100 ? 0 : 1)} hrs`;
}

function formatTurnaround(hours: number) {
  if (!(hours > 0)) return '-';
  if (hours < 24) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function displayName(tech: any) {
  return tech?.nickname
    || [tech?.firstName, tech?.lastName].filter(Boolean).join(' ')
    || `Technician ${tech?.id || ''}`;
}

const Metric: React.FC<{ label: string; value: string; detail?: string; tone?: string }> = ({ label, value, detail, tone = '' }) => (
  <div className={`gb-tech-analytics-metric ${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    {detail ? <small>{detail}</small> : null}
  </div>
);

const TechnicianAnalyticsWindow: React.FC<{ tech: any; onClose: () => void }> = ({ tech, onClose }) => {
  const [period, setPeriod] = useState<PeriodKey>('30');
  const [data, setData] = useState<AnalyticsData>({ workOrders: [], sales: [], timeEntries: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const api: any = (window as any).api;
      const [workOrders, sales, timeEntries] = await Promise.all([
        (typeof api?.getWorkOrders === 'function' ? api.getWorkOrders() : api?.dbGet?.('workOrders')).catch(() => []),
        api?.dbGet?.('sales').catch(() => []),
        api?.dbGet?.('timeEntries').catch(() => []),
      ]);
      setData({
        workOrders: Array.isArray(workOrders) ? workOrders : [],
        sales: Array.isArray(sales) ? sales : [],
        timeEntries: Array.isArray(timeEntries) ? timeEntries : [],
      });
    } catch (loadError: any) {
      setError(loadError?.message || 'Technician analytics could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [tech?.id]);

  const report = useMemo(() => {
    const keys = technicianKeys(tech);
    const workOrders = data.workOrders.filter(record => assignedToTechnician(record, keys) && inPeriod(record, period));
    const assignedSales = data.sales.filter(record => assignedToTechnician(record, keys) && inPeriod(record, period));
    const consultations = assignedSales.filter(isConsultationSale);
    const sales = assignedSales.filter(record => !isConsultationSale(record));
    const timeEntries = data.timeEntries.filter(entry =>
      keys.has(normalize(entry?.technicianId)) && inPeriod(entry, period));

    const workOrderBilledTotal = workOrders.reduce((sum, record) => sum + workOrderBilled(record), 0);
    const workOrderCollected = workOrders.reduce((sum, record) => sum + collected(record), 0);
    const completedWorkOrders = workOrders.filter(isClosed);
    const openWorkOrders = workOrders.length - completedWorkOrders.length;
    const turnaroundValues = completedWorkOrders.map(turnaroundHours).filter((value): value is number => value !== null);
    const avgTurnaround = average(turnaroundValues.reduce((sum, value) => sum + value, 0), turnaroundValues.length);

    const salesBilledTotal = sales.reduce((sum, record) => sum + saleBilled(record), 0);
    const salesCollected = sales.reduce((sum, record) => sum + collected(record), 0);
    const closedSales = sales.filter(isClosed).length;

    const consultationBilled = consultations.reduce((sum, record) => sum + saleBilled(record), 0);
    const consultationCollected = consultations.reduce((sum, record) => sum + collected(record), 0);
    const totalConsultationHours = consultations.reduce((sum, record) => sum + consultationHours(record), 0);

    const completedShifts = timeEntries.filter(entry => timeEntryHours(entry) > 0);
    const loggedHours = completedShifts.reduce((sum, entry) => sum + timeEntryHours(entry), 0);
    const verifiedShifts = completedShifts.filter(entry => !!entry?.verifiedAt).length;

    const allRecords = workOrders.length + sales.length + consultations.length;
    const totalBilled = workOrderBilledTotal + salesBilledTotal + consultationBilled;
    const totalCollected = workOrderCollected + salesCollected + consultationCollected;

    const serviceCounts = new Map<string, number>();
    workOrders.forEach(record => {
      const label = String(
        record?.productDescription
        || record?.summary
        || record?.items?.[0]?.description
        || 'Uncategorized repair',
      ).trim();
      serviceCounts.set(label, (serviceCounts.get(label) || 0) + 1);
    });
    const topServices = Array.from(serviceCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 5);

    const recent = [
      ...workOrders.map(record => ({
        kind: 'Work Order',
        date: recordDate(record),
        title: record?.productDescription || record?.summary || `Work Order #${record?.id || ''}`,
        status: record?.status || 'open',
        value: workOrderBilled(record),
      })),
      ...sales.map(record => ({
        kind: 'Sale',
        date: recordDate(record),
        title: record?.productDescription || record?.itemDescription || saleItems(record)[0]?.description || `Sale #${record?.id || ''}`,
        status: record?.status || 'open',
        value: saleBilled(record),
      })),
      ...consultations.map(record => ({
        kind: 'Consultation',
        date: recordDate(record),
        title: record?.itemDescription || saleItems(record)[0]?.description || 'Consultation',
        status: record?.status || 'open',
        value: saleBilled(record),
      })),
    ]
      .filter(row => row.date)
      .sort((a, b) => (b.date?.getTime() || 0) - (a.date?.getTime() || 0))
      .slice(0, 10);

    return {
      workOrders,
      completedWorkOrders,
      openWorkOrders,
      workOrderBilledTotal,
      workOrderCollected,
      avgTurnaround,
      sales,
      closedSales,
      salesBilledTotal,
      salesCollected,
      consultations,
      consultationBilled,
      consultationCollected,
      totalConsultationHours,
      consultationPayout: totalConsultationHours * 25,
      completedShifts,
      loggedHours,
      verifiedShifts,
      allRecords,
      totalBilled,
      totalCollected,
      topServices,
      recent,
    };
  }, [data, period, tech]);

  const periodLabel = PERIODS.find(option => option.key === period)?.label || 'Selected period';
  const maxServiceCount = Math.max(1, ...report.topServices.map(row => row.count));

  return (
    <div className="gb-tech-analytics-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/75">
      <section className="gb-tech-analytics-window bg-zinc-950 border border-zinc-700 rounded w-[1120px] max-w-[96vw] max-h-[94vh] overflow-auto text-zinc-100">
        <header className="gb-tech-analytics-header">
          <div>
            <div className="gb-tech-analytics-eyebrow">Technician Analytics</div>
            <h2>{displayName(tech)}</h2>
            <p>Performance from saved, technician-assigned POS records.</p>
          </div>
          <button type="button" className="gb-panel-x-button" onClick={onClose} aria-label="Close technician analytics">x</button>
        </header>

        <div className="gb-tech-analytics-controls">
          <div className="gb-tech-analytics-periods" role="group" aria-label="Analytics period">
            {PERIODS.map(option => (
              <button
                type="button"
                key={option.key}
                className={period === option.key ? 'active' : ''}
                onClick={() => setPeriod(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button type="button" className="gb-tech-analytics-refresh" onClick={() => void load()}>Refresh</button>
        </div>

        {loading ? <div className="gb-tech-analytics-state">Building report...</div> : null}
        {error ? <div className="gb-tech-analytics-error">{error}</div> : null}

        {!loading && !error ? (
          <div className="gb-tech-analytics-body">
            <div className="gb-tech-analytics-overview">
              <Metric label="Assigned records" value={String(report.allRecords)} detail={periodLabel} tone="purple" />
              <Metric label="Saved billed total" value={money(report.totalBilled)} detail="Includes saved tax" tone="green" />
              <Metric label="Saved collected" value={money(report.totalCollected)} detail="Payments recorded" tone="blue" />
              <Metric label="Average record" value={money(average(report.totalBilled, report.allRecords))} detail="Billed total / records" />
            </div>

            <div className="gb-tech-analytics-sections">
              <section className="gb-tech-analytics-section">
                <div className="gb-tech-analytics-section-title">
                  <div>
                    <span className="green-dot" />
                    <h3>Work Orders</h3>
                  </div>
                  <strong>{report.workOrders.length}</strong>
                </div>
                <div className="gb-tech-analytics-grid">
                  <Metric label="Completed" value={String(report.completedWorkOrders.length)} />
                  <Metric label="Open" value={String(report.openWorkOrders)} />
                  <Metric label="Completion rate" value={percent(average(report.completedWorkOrders.length * 100, report.workOrders.length))} />
                  <Metric label="Average ticket" value={money(average(report.workOrderBilledTotal, report.workOrders.length))} />
                  <Metric label="Billed" value={money(report.workOrderBilledTotal)} />
                  <Metric label="Collected" value={money(report.workOrderCollected)} />
                  <Metric label="Avg. turnaround" value={formatTurnaround(report.avgTurnaround)} detail="Completed orders with dates" />
                </div>
              </section>

              <section className="gb-tech-analytics-section">
                <div className="gb-tech-analytics-section-title">
                  <div>
                    <span className="purple-dot" />
                    <h3>Sales</h3>
                  </div>
                  <strong>{report.sales.length}</strong>
                </div>
                <div className="gb-tech-analytics-grid">
                  <Metric label="Closed sales" value={String(report.closedSales)} />
                  <Metric label="Close rate" value={percent(average(report.closedSales * 100, report.sales.length))} />
                  <Metric label="Average sale" value={money(average(report.salesBilledTotal, report.sales.length))} />
                  <Metric label="Billed" value={money(report.salesBilledTotal)} />
                  <Metric label="Collected" value={money(report.salesCollected)} />
                </div>
              </section>

              <section className="gb-tech-analytics-section">
                <div className="gb-tech-analytics-section-title">
                  <div>
                    <span className="yellow-dot" />
                    <h3>Consultations</h3>
                  </div>
                  <strong>{report.consultations.length}</strong>
                </div>
                <div className="gb-tech-analytics-grid">
                  <Metric label="Logged hours" value={formatHours(report.totalConsultationHours)} />
                  <Metric label="Average length" value={formatHours(average(report.totalConsultationHours, report.consultations.length))} />
                  <Metric label="Billed" value={money(report.consultationBilled)} />
                  <Metric label="Collected" value={money(report.consultationCollected)} />
                  <Metric label="Consultation payout" value={money(report.consultationPayout)} detail="$25 per saved hour" />
                </div>
              </section>

              <section className="gb-tech-analytics-section">
                <div className="gb-tech-analytics-section-title">
                  <div>
                    <span className="blue-dot" />
                    <h3>Logged Time</h3>
                  </div>
                  <strong>{formatHours(report.loggedHours)}</strong>
                </div>
                <div className="gb-tech-analytics-grid">
                  <Metric label="Completed shifts" value={String(report.completedShifts.length)} />
                  <Metric label="Average shift" value={formatHours(average(report.loggedHours, report.completedShifts.length))} />
                  <Metric label="Verified shifts" value={String(report.verifiedShifts)} />
                  <Metric label="Verification rate" value={percent(average(report.verifiedShifts * 100, report.completedShifts.length))} />
                </div>
              </section>
            </div>

            <div className="gb-tech-analytics-lower">
              <section className="gb-tech-analytics-section">
                <div className="gb-tech-analytics-section-title">
                  <h3>Most Common Devices</h3>
                </div>
                <div className="gb-tech-service-list">
                  {report.topServices.map(row => (
                    <div className="gb-tech-service-row" key={row.label}>
                      <div>
                        <span>{row.label}</span>
                        <strong>{row.count}</strong>
                      </div>
                      <div className="gb-tech-service-track">
                        <i style={{ width: `${(row.count / maxServiceCount) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                  {!report.topServices.length ? <p>No assigned work orders in this period.</p> : null}
                </div>
              </section>

              <section className="gb-tech-analytics-section">
                <div className="gb-tech-analytics-section-title">
                  <h3>Recent Activity</h3>
                </div>
                <div className="gb-tech-activity-list">
                  {report.recent.map((row, index) => (
                    <div className="gb-tech-activity-row" key={`${row.kind}-${row.date?.toISOString()}-${index}`}>
                      <div>
                        <span>{row.kind}</span>
                        <strong>{row.title}</strong>
                        <small>{row.date?.toLocaleDateString()} - {String(row.status)}</small>
                      </div>
                      <b>{money(row.value)}</b>
                    </div>
                  ))}
                  {!report.recent.length ? <p>No assigned activity in this period.</p> : null}
                </div>
              </section>
            </div>

            <footer className="gb-tech-analytics-note">
              This report is read-only. It uses saved technician assignment, payment, total, consultation-hour, status, and time-entry fields. Missing values remain zero and are not estimated.
            </footer>
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default TechnicianAnalyticsWindow;
