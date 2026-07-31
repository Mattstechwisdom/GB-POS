import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { canDispatchOpenModal, dispatchOpenModal } from '@/lib/modalBus';
import {
  DeviceNotificationSettings,
  listNotifications,
  loadDeviceNotificationSettings,
  markAllNotificationsRead,
  markNotificationRead,
  purgeReadNotifications,
  NotificationRecord,
  requestDeviceNotificationPermission,
} from '@/lib/notifications';
import NotificationSettingsWindow from './NotificationSettingsWindow';

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
  if (kind === 'work_order') return 'Work Orders';
  if (kind === 'sale') return 'Sales';
  return 'Event';
}

function kindColor(kind: NotificationRecord['kind']) {
  if (kind === 'consultation') return 'bg-yellow-500';
  if (kind === 'parts_delivery') return 'bg-blue-500';
  if (kind === 'tech_schedule') return 'bg-[#39FF14]';
  if (kind === 'daily_look') return 'bg-purple-500';
  if (kind === 'work_order') return 'bg-emerald-500';
  if (kind === 'sale') return 'bg-[#BC13FE]';
  return 'bg-red-500';
}

const NotificationsWindow: React.FC<{ hideCloseButton?: boolean }> = ({ hideCloseButton = false }) => {
  const [list, setList] = useState<NotificationRecord[]>([]);
  const [showUnreadOnly, setShowUnreadOnly] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const [mobileView, setMobileView] = useState<'notifications' | 'settings'>('notifications');
  const [devicePermission, setDevicePermission] = useState<DeviceNotificationSettings['permission']>('default');
  const [permissionChecking, setPermissionChecking] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const isNativeAndroid = Capacitor.getPlatform() === 'android' || !!window.GBPosAndroid;
  const isMobileSurface = isNativeAndroid
    || /mobile\.html$/i.test(window.location.pathname)
    || !!document.querySelector('.gbpos-mobile');

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

  useEffect(() => {
    let active = true;
    setPermissionChecking(true);
    setPermissionError('');
    const stopChecking = window.setTimeout(() => {
      if (!active) return;
      setPermissionChecking(false);
      setPermissionError('Notification access could not be confirmed. Tap Settings to try again.');
    }, 12_000);
    void (async () => {
      try {
        const current = await loadDeviceNotificationSettings();
        if (!active) return;
        setDevicePermission(current.permission);
        if (
          !isMobileSurface
          && current.permission === 'prompt'
          && typeof (window as any).api?.notificationRequestNativePermission === 'function'
        ) {
          const requested = await requestDeviceNotificationPermission();
          if (!active) return;
          setDevicePermission(requested.permission);
        }
        if (isMobileSurface && current.permission === 'granted') setMobileView('settings');
      } catch (error: any) {
        if (active) setPermissionError(error?.message || 'Notification permission could not be checked.');
      } finally {
        window.clearTimeout(stopChecking);
        if (active) setPermissionChecking(false);
      }
    })();
    return () => {
      active = false;
      window.clearTimeout(stopChecking);
    };
  }, [isMobileSurface]);

  useEffect(() => {
    const onPermissionChanged = (event: Event) => {
      const next = (event as CustomEvent<DeviceNotificationSettings>).detail;
      if (!next?.permission) return;
      setPermissionChecking(false);
      setPermissionError('');
      setDevicePermission(next.permission);
      if (next.permission === 'granted') setMobileView('settings');
    };
    const onPermissionError = (event: Event) => {
      setPermissionChecking(false);
      setPermissionError(String((event as CustomEvent<string>).detail || 'Notification permission could not be requested.'));
    };
    window.addEventListener('gbpos:notification-permission-changed', onPermissionChanged);
    window.addEventListener('gbpos:notification-permission-error', onPermissionError);
    return () => {
      window.removeEventListener('gbpos:notification-permission-changed', onPermissionChanged);
      window.removeEventListener('gbpos:notification-permission-error', onPermissionError);
    };
  }, []);

  useEffect(() => {
    if (!isNativeAndroid) return;
    let active = true;
    const refreshPermission = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const current = await loadDeviceNotificationSettings();
        if (!active) return;
        setDevicePermission(current.permission);
        setMobileView(current.permission === 'granted' ? 'settings' : 'notifications');
      } catch {
        // Keep the current screen; the next open will perform another full check.
      }
    };
    window.addEventListener('focus', refreshPermission);
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshPermission);
      document.removeEventListener('visibilitychange', refreshPermission);
    };
  }, [isNativeAndroid]);

  const unreadCount = useMemo(() => list.filter(n => !n.readAt).length, [list]);

  const filtered = useMemo(() => {
    const base = showUnreadOnly ? list.filter(n => !n.readAt) : list;
    return [...base].sort((a, b) => {
      const ta = new Date(a.eventAt || a.createdAt).getTime();
      const tb = new Date(b.eventAt || b.createdAt).getTime();
      return tb - ta;
    });
  }, [list, showUnreadOnly]);

  const openMobileNotificationSettings = () => {
    try {
      const bridge = (window as any).GBPosAndroid;
      if (typeof bridge?.openNotificationSettings === 'function') {
        bridge.openNotificationSettings();
      }
    } catch {
      // Android settings remain available from the operating system.
    }
  };

  if (isMobileSurface && mobileView === 'settings' && devicePermission === 'granted') {
    return (
      <div className="h-screen bg-zinc-900 text-zinc-100 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between gap-3 p-3 border-b border-zinc-800">
          <div>
            <div className="text-lg font-semibold">Notification Preferences</div>
            <div className="text-xs text-[#39FF14]">Allowed on this device</div>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 rounded border text-sm bg-zinc-800 border-zinc-700 text-zinc-200"
            onClick={() => setMobileView('notifications')}
          >
            View alerts
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <NotificationSettingsWindow embedded hideCloseButton />
        </div>
      </div>
    );
  }

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
            className="px-3 py-1.5 rounded border text-sm bg-zinc-800 border-zinc-700 text-zinc-200"
            onClick={async () => {
              if (isMobileSurface) {
                if (devicePermission === 'granted') {
                  setMobileView('settings');
                } else if (isNativeAndroid && (devicePermission === 'default' || devicePermission === 'prompt')) {
                  setPermissionChecking(true);
                  setPermissionError('');
                  const stopChecking = window.setTimeout(() => {
                    setPermissionChecking(false);
                    setPermissionError('Android did not finish the permission request. Tap Settings to retry.');
                  }, 22_000);
                  try {
                    const next = await requestDeviceNotificationPermission();
                    setDevicePermission(next.permission);
                    if (next.permission === 'granted') setMobileView('settings');
                    else if (next.permission === 'prompt') {
                      setPermissionError('Android did not show the permission request. Tap Settings to try again.');
                    }
                  } catch (error: any) {
                    setPermissionError(error?.message || 'Notification permission could not be requested.');
                  } finally {
                    window.clearTimeout(stopChecking);
                    setPermissionChecking(false);
                  }
                } else if (isNativeAndroid && devicePermission === 'denied') {
                  openMobileNotificationSettings();
                } else {
                  dispatchOpenModal('notificationSettings');
                }
                return;
              }
              if (canDispatchOpenModal()) {
                dispatchOpenModal('notificationSettings');
                return;
              }
              const api: any = (window as any).api;
              if (typeof api?.openNotificationSettings === 'function') {
                await api.openNotificationSettings();
                return;
              }
              dispatchOpenModal('notificationSettings');
            }}
          >
            {permissionChecking ? 'Checking...' : 'Settings'}
          </button>
          {!hideCloseButton ? (
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
          ) : null}
        </div>
      </div>

      {isMobileSurface && devicePermission === 'denied' ? (
        <div className="mb-3 rounded border border-red-500/50 bg-red-950/30 p-3 text-sm">
          <div className="font-semibold text-red-200">Notifications are disabled for GadgetBoy POS.</div>
          <div className="mt-1 text-xs text-zinc-300">Turn them back on in Android settings to restore notification preferences.</div>
          {Capacitor.isNativePlatform() ? (
            <button type="button" className="mt-2 px-3 py-1.5 rounded bg-[#BC13FE] text-white font-semibold" onClick={openMobileNotificationSettings}>
              Open phone settings
            </button>
          ) : null}
        </div>
      ) : null}
      {permissionError ? <div className="mb-3 rounded border border-amber-500/50 bg-amber-950/20 p-2 text-xs text-amber-100">{permissionError}</div> : null}

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
                        try { dispatchOpenModal('calendar'); } catch {}
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
