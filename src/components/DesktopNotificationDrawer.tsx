import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationRecord,
  openNotificationDestination,
} from '../lib/notifications';
import { dispatchOpenModal } from '../lib/modalBus';

function formatWhen(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function kindClass(kind: NotificationRecord['kind']) {
  if (kind === 'work_order') return 'work-order';
  if (kind === 'sale') return 'sale';
  if (kind === 'consultation') return 'consultation';
  if (kind === 'parts_delivery') return 'parts';
  if (kind === 'tech_schedule') return 'technician';
  if (kind === 'daily_look') return 'daily';
  return 'event';
}

type Props = {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
};

const DesktopNotificationDrawer: React.FC<Props> = ({ open, onOpen, onClose }) => {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [openedByHover, setOpenedByHover] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listNotifications();
      setNotifications(Array.isArray(rows) ? rows : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const off = (window as any).api?.onNotificationsChanged?.(() => void load());
    return () => { try { off?.(); } catch {} };
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  const sorted = useMemo(() => notifications.filter(item => !item.readAt).sort((a, b) => {
    const aTime = new Date(a.eventAt || a.createdAt).getTime();
    const bTime = new Date(b.eventAt || b.createdAt).getTime();
    return bTime - aTime;
  }).slice(0, 40), [notifications]);

  const unreadCount = notifications.filter(item => !item.readAt).length;

  const dismissNotifications = async () => {
    if (dismissing || unreadCount === 0) return;
    setDismissing(true);
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications(current => current.map(item => item.readAt ? item : { ...item, readAt }));
    } finally {
      setDismissing(false);
    }
  };

  const openSettings = () => {
    setOpenedByHover(false);
    onClose();
    dispatchOpenModal('notificationSettings');
  };

  const openNotification = async (notification: NotificationRecord) => {
    if (notification.id != null && !notification.readAt) {
      await markNotificationRead(Number(notification.id), true);
    }
    onClose();
    await openNotificationDestination(notification);
  };

  return (
    <>
      <aside
        className="desktop-notification-rail"
        aria-label="Notification rail"
        onMouseEnter={() => {
          if (!open) {
            setOpenedByHover(true);
            onOpen();
          }
        }}
      >
        <button
          type="button"
          onClick={() => {
            if (open && !openedByHover) {
              onClose();
              return;
            }
            setOpenedByHover(false);
            onOpen();
          }}
          className={open ? 'active' : ''}
          aria-label={open ? 'Close notification drawer' : 'Open notification drawer'}
          title="Notifications"
        >
          <span aria-hidden="true">!</span>
          {unreadCount > 0 ? <small>{unreadCount > 99 ? '99+' : unreadCount}</small> : null}
        </button>
      </aside>
      {open ? (
        <div className="desktop-notification-layer">
          <button type="button" className="desktop-notification-scrim" onClick={onClose} aria-label="Close notification drawer" />
          <aside
            className="desktop-notification-drawer"
            aria-label="Notifications"
            onMouseLeave={() => {
              if (openedByHover) {
                setOpenedByHover(false);
                onClose();
              }
            }}
          >
            <header>
              <div>
                <strong>Notifications</strong>
                <span>{unreadCount} unread</span>
              </div>
              <div className="desktop-notification-actions">
                <button type="button" className="dismiss" disabled={dismissing || unreadCount === 0} onClick={() => void dismissNotifications()}>
                  {dismissing ? 'Dismissing...' : 'Dismiss'}
                </button>
                <button type="button" className="settings" onClick={openSettings}>Settings</button>
              </div>
            </header>
            <div className="desktop-notification-list">
              {loading ? <p>Loading notifications...</p> : null}
              {!loading && sorted.length === 0 ? <p>No notifications</p> : null}
              {!loading ? sorted.map(notification => (
                <button
                  type="button"
                  key={notification.id ?? notification.key}
                  className={`desktop-notification-item ${kindClass(notification.kind)}${notification.readAt ? ' read' : ''}`}
                  onClick={() => void openNotification(notification)}
                >
                  <span className="desktop-notification-kind" aria-hidden="true" />
                  <span className="desktop-notification-copy">
                    <span><strong>{notification.title}</strong><time>{formatWhen(notification.eventAt || notification.createdAt)}</time></span>
                    {notification.message ? <small>{notification.message}</small> : null}
                  </span>
                </button>
              )) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
};

export default DesktopNotificationDrawer;
