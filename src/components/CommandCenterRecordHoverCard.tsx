import React from 'react';
import { createPortal } from 'react-dom';
import type { CommandCenterRecord } from '@/lib/commandCenter';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export default function CommandCenterRecordHoverCard({ record, children, className }: { record: CommandCenterRecord; children: React.ReactNode; className?: string }) {
  const [point, setPoint] = React.useState({ x: 0, y: 0 });
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<number>();
  const close = () => { timer.current = window.setTimeout(() => setOpen(false), 70); };
  const keepOpen = () => { if (timer.current) window.clearTimeout(timer.current); setOpen(true); };
  React.useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const card = open && record.kind === 'workorder' ? createPortal(
    <div
      className="command-center-record-hover"
      style={{ left: clamp(point.x + 14, 8, window.innerWidth - 398), top: clamp(point.y + 14, 8, window.innerHeight - 330) }}
      onMouseEnter={keepOpen}
      onMouseLeave={close}
    >
      <header><strong>{record.deviceLabel}</strong><span>WO #{record.id}</span></header>
      <dl>
        <div><dt>Client</dt><dd>{record.customerName}</dd></div>
        <div><dt>Problem</dt><dd>{record.problem}</dd></div>
        {record.deviceCategory ? <div><dt>Category</dt><dd>{record.deviceCategory}</dd></div> : null}
        {record.model ? <div><dt>Model</dt><dd>{record.model}</dd></div> : null}
        {record.serial ? <div><dt>Serial</dt><dd>{record.serial}</dd></div> : null}
        <div><dt>Status</dt><dd>{record.stage || record.status}</dd></div>
        <div><dt>Technician</dt><dd>{record.technician}</dd></div>
      </dl>
    </div>,
    document.body,
  ) : null;

  return <div className={className} onMouseEnter={keepOpen} onMouseMove={event => setPoint({ x: event.clientX, y: event.clientY })} onMouseLeave={close}>{children}{card}</div>;
}

