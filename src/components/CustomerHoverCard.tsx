import React from 'react';
import { createPortal } from 'react-dom';
import { formatPhone } from '../lib/format';

type CustomerLite = {
  id?: number;
  name?: string;
  phone?: string;
  phoneAlt?: string;
  email?: string;
};

const countsCache = new Map<number, { workOrders: number; sales: number }>();

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function CustomerHoverCard(props: {
  customerId?: number;
  customer?: CustomerLite | null;
  children: React.ReactNode;
  className?: string;
}) {
  const { customerId, customer, children, className } = props;

  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [counts, setCounts] = React.useState<{ workOrders?: number; sales?: number }>({});

  const api = (window as any).api as undefined | { dbCount?: (key: string, q: any) => Promise<number> };

  const canShow = !!customerId && !!customer;

  React.useEffect(() => {
    if (!open) return;
    if (!customerId) return;
    if (!api?.dbCount) return;

    const cached = countsCache.get(customerId);
    if (cached) {
      setCounts({ workOrders: cached.workOrders, sales: cached.sales });
      return;
    }

    let cancelled = false;
    setCounts({});

    (async () => {
      try {
        const [workOrders, sales] = await Promise.all([
          api.dbCount!('workOrders', { customerId }),
          api.dbCount!('sales', { customerId }),
        ]);
        if (cancelled) return;
        countsCache.set(customerId, { workOrders, sales });
        setCounts({ workOrders, sales });
      } catch {
        if (cancelled) return;
        setCounts({ workOrders: 0, sales: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, customerId]);

  const onMouseEnter = (e: React.MouseEvent) => {
    if (!canShow) return;
    setOpen(true);
    setPos({ x: e.clientX, y: e.clientY });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!open) return;
    setPos({ x: e.clientX, y: e.clientY });
  };

  const onMouseLeave = () => {
    setOpen(false);
  };

  const card = (() => {
    if (!open) return null;
    if (!canShow) return null;

    const cardWidth = 320;
    const cardHeight = 170;
    const left = clamp(pos.x + 12, 8, window.innerWidth - cardWidth - 8);
    const top = clamp(pos.y + 12, 8, window.innerHeight - cardHeight - 8);

    const name = (customer?.name || '').toString().trim();
    const phone = (formatPhone((customer?.phone || '').toString()) || (customer?.phone || '')).toString().trim();
    const phoneAlt = (formatPhone((customer?.phoneAlt || '').toString()) || (customer?.phoneAlt || '')).toString().trim();
    const email = (customer?.email || '').toString().trim();

    return createPortal(
      <div
        className="fixed z-[9999] pointer-events-none"
        style={{ left, top, width: cardWidth }}
      >
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-3">
          <div className="font-semibold text-zinc-100 truncate">{name || `Customer #${customerId}`}</div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-[12px] text-zinc-300">
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Phone</span><span className="truncate">{phone || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Alt</span><span className="truncate">{phoneAlt || '—'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Email</span><span className="truncate">{email || '—'}</span></div>
            <div className="h-px bg-zinc-800 my-1" />
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Work orders</span><span>{typeof counts.workOrders === 'number' ? counts.workOrders : '…'}</span></div>
            <div className="flex justify-between gap-3"><span className="text-zinc-400">Sales</span><span>{typeof counts.sales === 'number' ? counts.sales : '…'}</span></div>
          </div>
        </div>
      </div>,
      document.body
    );
  })();

  return (
    <div
      className={className}
      onMouseEnter={onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {children}
      {card}
    </div>
  );
}
