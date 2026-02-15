import React, { useEffect, useMemo, useState } from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  purgeReadNotifications,
  NotificationRecord,
} from '@/lib/notifications';

function fmtWhen(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function kindLabel(kind: NotificationRecord['kind']) {
  if (kind === 'consultation') return 'Consultation';
  if (kind === 'parts_delivery') return 'Parts';
  if (kind === 'tech_schedule') return 'Technicians';
  if (kind === 'daily_look') return 'Daily Look';
  return 'Event';
}

function kindColor(kind: NotificationRecord['kind']) {
  if (kind === 'consultation') return 'bg-yellow-500';
  if (kind === 'parts_delivery') return 'bg-blue-500';
  if (kind === 'tech_schedule') return 'bg-[#39FF14]';
  if (kind === 'daily_look') return 'bg-purple-500';
  return 'bg-red-500';
}

const NotificationsWindow: React.FC = () => {
  const [list, setList] = useState<NotificationRecord[]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);

  const load = async () => {
    setLoading(true);
    try {
      const l = await listNotifications();
      setList(Array.isArray(l) ? l : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const api: any = (window as any).api;
    const off = api?.onNotificationsChanged?.(() => load());
    return () => {
      try { off && off(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unreadCount = useMemo(() => list.filter(n => !n.readAt).length, [list]);

  const filtered = useMemo(() => {
    const base = showUnreadOnly ? list.filter(n => !n.readAt) : list;
    return [...base].sort((a, b) => {
      const ta = new Date(a.eventAt || a.createdAt).getTime();
      const tb = new Date(b.eventAt || b.createdAt).getTime();
      return tb - ta;
    });
  }, [list, showUnreadOnly]);

  return (
    <div className="h-screen bg-zinc-900 text-zinc-100 p-4 overflow-hidden flex flex-col">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-xl font-semibold">Notifications</div>
          <div className="text-xs text-zinc-400">Unread: {unreadCount}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1.5 rounded border text-sm ${showUnreadOnly ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 border-zinc-700 text-zinc-200'}`}
            onClick={() => setShowUnreadOnly(v => !v)}
          >
            {showUnreadOnly ? 'Showing unread' : 'Showing all'}
          </button>
          <button
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
            onClick={async () => {
              await markAllNotificationsRead();
              await load();
            }}
            disabled={unreadCount === 0}
          >
            Mark all read
          </button>
          <button
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
            onClick={async () => {
              await purgeReadNotifications(14);
              await load();
            }}
          >
            Clear read
          </button>
          <button
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
            onClick={async () => {
              try {
                const api: any = (window as any).api;
                if (api?.closeSelfWindow) await api.closeSelfWindow({ focusMain: true });
                else window.close();
              } catch {
                try { window.close(); } catch {}
              }
            }}
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto border border-zinc-800 rounded">
        {loading && (
          <div className="p-6 text-center text-zinc-400">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-6 text-center text-zinc-500">No notifications</div>
        )}

        {!loading && filtered.map(n => {
          const when = fmtWhen(n.eventAt || n.createdAt);
          const isUnread = !n.readAt;
          return (
            <div
              key={n.id || n.key}
              className={`px-3 py-3 border-b border-zinc-800 flex items-start gap-3 ${isUnread ? 'bg-zinc-900' : 'bg-zinc-900/50 opacity-80'}`}
            >
              <div className={`w-2.5 h-2.5 rounded-full mt-1 ${kindColor(n.kind)}`} title={kindLabel(n.kind)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold truncate">{n.title}</div>
                  <div className="text-xs text-zinc-400 whitespace-nowrap">{when}</div>
                </div>
                {n.message ? <div className="text-sm text-zinc-300 mt-0.5 break-words">{n.message}</div> : null}
                <div className="flex items-center gap-2 mt-2">
                  {n.orderUrl ? (
                    <button
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={async () => {
                        try { await (window as any).api.openUrl(n.orderUrl); } catch {}
                      }}
                    >
                      Open order link
                    </button>
                  ) : null}
                  {n.trackingUrl ? (
                    <button
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={async () => {
                        try { await (window as any).api.openUrl(n.trackingUrl); } catch {}
                      }}
                    >
                      Open tracking
                    </button>
                  ) : null}
                  {n.workOrderId != null ? (
                    <button
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={async () => {
                        try { await (window as any).api.openNewWorkOrder?.({ workOrderId: Number(n.workOrderId) }); } catch {}
                      }}
                    >
                      Open work order
                    </button>
                  ) : null}
                  {n.saleId != null ? (
                    <button
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={async () => {
                        try { await (window as any).api.openNewSale?.({ id: Number(n.saleId) }); } catch {}
                      }}
                    >
                      Open sale
                    </button>
                  ) : null}
                  {n.customerId != null ? (
                    <button
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={async () => {
                        try { await (window as any).api.openCustomerOverview?.(Number(n.customerId)); } catch {}
                      }}
                    >
                      Open customer
                    </button>
                  ) : null}
                  {n.calendarEventId ? (
                    <button
                      className="text-xs px-2 py-1 bg-zinc-800 border border-zinc-700 rounded hover:bg-zinc-700"
                      onClick={async () => {
                        try { await (window as any).api.openCalendar?.(); } catch {}
                      }}
                    >
                      Open calendar
                    </button>
                  ) : null}

                  <div className="flex-1" />

                  {n.id != null && (
                    <button
                      className={`text-xs px-2 py-1 border rounded ${isUnread ? 'bg-[#39FF14] text-black border-[#39FF14]' : 'bg-zinc-800 text-zinc-200 border-zinc-700'}`}
                      onClick={async () => {
                        await markNotificationRead(Number(n.id), isUnread);
                        await load();
                      }}
                    >
                      {isUnread ? 'Mark read' : 'Mark unread'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationsWindow;
