import React, { useEffect, useState } from 'react';
import {
  DeviceNotificationSettings,
  loadDeviceNotificationSettings,
  loadNotificationSettings,
  NotificationSettings,
  requestDeviceNotificationPermission,
  saveDeviceNotificationSettings,
  saveNotificationSettings,
  scheduleDeviceConsultationReminders,
  sendTestDeviceNotification,
  syncNotificationsFromCalendar,
  syncNotificationsFromRecords,
} from '@/lib/notifications';
import { publicAsset } from '@/lib/publicAsset';

const consultationLeadHourOptions = [1, 2, 3, 4, 6, 12, 24];

const permissionLabel: Record<DeviceNotificationSettings['permission'], string> = {
  default: 'Not requested',
  prompt: 'Not requested',
  granted: 'Allowed',
  denied: 'Blocked',
  unsupported: 'Not supported',
};

const Section: React.FC<{ title: string; children: React.ReactNode; detail?: string; accent?: boolean }> = ({ title, detail, children, accent }) => (
  <div className={`border rounded p-3 ${accent ? 'border-[#BC13FE]/40 bg-[#BC13FE]/10' : 'border-zinc-800'}`}>
    <div className="font-semibold mb-1">{title}</div>
    {detail ? <div className="text-xs text-zinc-400 mb-3">{detail}</div> : null}
    {children}
  </div>
);

const DeviceToggle: React.FC<{
  checked: boolean;
  disabled?: boolean;
  title: string;
  detail: string;
  onChange: (checked: boolean) => void;
}> = ({ checked, disabled, title, detail, onChange }) => (
  <label className="flex items-start gap-2 text-sm rounded border border-zinc-800 bg-zinc-950/40 p-2">
    <input
      type="checkbox"
      className="mt-1"
      checked={checked}
      disabled={disabled}
      onChange={e => onChange(e.target.checked)}
    />
    <span>
      <span className="block font-medium">{title}</span>
      <span className="text-xs text-zinc-400">{detail}</span>
    </span>
  </label>
);

const NotificationSettingsWindow: React.FC<{ embedded?: boolean; hideCloseButton?: boolean }> = ({ embedded = false, hideCloseButton = false }) => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [deviceSettings, setDeviceSettings] = useState<DeviceNotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [permissionMessage, setPermissionMessage] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  const load = async () => {
    setLoadError('');
    try {
      const [notificationSettings, nextDeviceSettings] = await Promise.all([
        loadNotificationSettings(),
        loadDeviceNotificationSettings(),
      ]);
      setSettings(notificationSettings);
      setDeviceSettings(nextDeviceSettings);
    } catch (error: any) {
      setLoadError(error?.message || 'Notification settings could not be loaded.');
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const updateDevice = (patch: Partial<DeviceNotificationSettings>) => {
    setDeviceSettings(current => current ? { ...current, ...patch } : current);
  };

  const save = async () => {
    if (!settings || !deviceSettings) return;
    setSaving(true);
    try {
      const [, savedDevice] = await Promise.all([
        saveNotificationSettings(settings),
        saveDeviceNotificationSettings(deviceSettings),
      ]);
      setDeviceSettings(savedDevice);
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));
      try { await syncNotificationsFromCalendar(); } catch {}
      try { await syncNotificationsFromRecords(); } catch {}
      try { await scheduleDeviceConsultationReminders(undefined, savedDevice); } catch {}
    } finally {
      setSaving(false);
    }
  };

  const askForPermission = async () => {
    setRequestingPermission(true);
    setPermissionMessage('');
    try {
      const next = await requestDeviceNotificationPermission();
      setDeviceSettings(next);
      if (next.permission === 'granted') {
        setPermissionMessage('Notifications are allowed. Choose the alerts this device should receive, then save.');
        try { await syncNotificationsFromCalendar(); } catch {}
        try { await syncNotificationsFromRecords(); } catch {}
      } else if (next.permission === 'denied') {
        setPermissionMessage('Notifications are blocked in this device\'s operating-system settings.');
      } else if (next.permission === 'unsupported') {
        setPermissionMessage('This device does not expose system notifications to the app.');
      }
    } catch (error: any) {
      setPermissionMessage(error?.message || 'The operating-system permission request could not be opened.');
    } finally {
      setRequestingPermission(false);
    }
  };

  if (!settings || !deviceSettings) {
    return (
      <div className="p-4 text-zinc-200 bg-zinc-900 h-screen flex items-center justify-center">
        <div className="text-center">
          <img src={publicAsset('logo.png')} alt="GadgetBoy POS" className="w-16 h-16 object-contain mx-auto mb-3" />
          <div>{loadError || 'Loading notification settings...'}</div>
          {loadError ? <button type="button" className="mt-3 px-3 py-1.5 rounded bg-[#BC13FE] text-white" onClick={() => void load()}>Retry</button> : null}
        </div>
      </div>
    );
  }

  const deviceAllowed = deviceSettings.permission === 'granted';
  const deviceBlocked = deviceSettings.permission === 'denied';
  const deviceUnsupported = deviceSettings.permission === 'unsupported';
  const deviceDisabled = !deviceSettings.enabled;

  return (
    <div className="h-screen bg-zinc-900 text-zinc-100 p-4 overflow-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <img src={publicAsset('logo.png')} alt="GadgetBoy POS" className="w-12 h-12 object-contain flex-none" />
          <div>
            <div className="text-xl font-semibold text-[#BC13FE]">Notification Settings</div>
            <div className="text-xs text-zinc-400">Choose what to track and which alerts this device should receive.</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <div className="text-xs text-neon-green">Saved {savedAt}</div> : null}
          {!embedded && !hideCloseButton ? (
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
          <button
            className={`px-3 py-1.5 rounded text-sm font-semibold ${saving ? 'bg-zinc-700 text-zinc-300' : 'bg-[#39FF14] text-black hover:brightness-110'}`}
            disabled={saving}
            onClick={save}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Section title="Device Notifications" detail="Authorize this device first, then choose the alerts this technician wants to receive." accent>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-xs text-zinc-400">
              Permission: <span className={deviceAllowed ? 'text-[#39FF14]' : deviceBlocked ? 'text-red-300' : 'text-zinc-200'}>{permissionLabel[deviceSettings.permission]}</span>
            </div>
            {!deviceAllowed ? (
              <button
                type="button"
                className="px-3 py-1.5 rounded bg-[#BC13FE] text-white text-sm font-semibold disabled:opacity-60"
                disabled={requestingPermission || deviceUnsupported}
                onClick={askForPermission}
              >
                {requestingPermission ? 'Waiting for device...' : 'Allow notifications'}
              </button>
            ) : (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={deviceSettings.enabled}
                  onChange={e => updateDevice({ enabled: e.target.checked })}
                />
                Send alerts on this device
              </label>
            )}
          </div>

          {deviceUnsupported ? (
            <div className="mt-3 text-xs text-zinc-400">This platform does not expose device notifications. The in-app Notifications list will still work.</div>
          ) : null}
          {deviceBlocked ? (
            <div className="mt-3 text-xs text-red-200">Notifications are blocked by the operating system. Turn them back on in this device's app settings, then return here.</div>
          ) : null}
          {permissionMessage ? <div className={`mt-3 text-xs ${deviceAllowed ? 'text-[#39FF14]' : 'text-zinc-300'}`}>{permissionMessage}</div> : null}

          {deviceAllowed ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-start gap-2 text-sm rounded border border-zinc-800 bg-zinc-950/40 p-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={deviceSettings.consultationReminders}
                  disabled={deviceDisabled}
                  onChange={e => updateDevice({ consultationReminders: e.target.checked })}
                />
                <span className="flex-1">
                  <span className="block font-medium">Consultation reminders</span>
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    Remind me
                    <select
                      className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-100"
                      value={deviceSettings.consultationLeadHours}
                      disabled={deviceDisabled || !deviceSettings.consultationReminders}
                      onChange={e => updateDevice({ consultationLeadHours: Number(e.target.value || 1) })}
                    >
                      {consultationLeadHourOptions.map(hour => (
                        <option key={hour} value={hour}>{hour} hour{hour === 1 ? '' : 's'} before</option>
                      ))}
                    </select>
                  </span>
                </span>
              </label>
              <DeviceToggle checked={deviceSettings.newWorkOrders} disabled={deviceDisabled} title="New work order created" detail="Alert when another device adds a work order." onChange={checked => updateDevice({ newWorkOrders: checked })} />
              <DeviceToggle checked={deviceSettings.newSales} disabled={deviceDisabled} title="New sale created" detail="Alert when a sale is entered from another device." onChange={checked => updateDevice({ newSales: checked })} />
              <DeviceToggle checked={deviceSettings.partsDelivery} disabled={deviceDisabled} title="Parts expected delivery" detail="Alert for upcoming and overdue part deliveries." onChange={checked => updateDevice({ partsDelivery: checked })} />
              <DeviceToggle checked={deviceSettings.calendarEvents} disabled={deviceDisabled} title="Calendar event reminders" detail="Use for non-consultation calendar reminders." onChange={checked => updateDevice({ calendarEvents: checked })} />
              <DeviceToggle checked={deviceSettings.technicianSchedules} disabled={deviceDisabled} title="Technician schedule changes" detail="Alert when availability is edited." onChange={checked => updateDevice({ technicianSchedules: checked })} />
              <DeviceToggle checked={deviceSettings.dailyLook} disabled={deviceDisabled} title="Daily Look digest" detail="Send the daily shop rundown to this device." onChange={checked => updateDevice({ dailyLook: checked })} />
              <button
                type="button"
                className="md:col-span-2 px-3 py-2 rounded border border-[#BC13FE]/60 bg-[#BC13FE]/15 text-[#f3c4ff] text-sm font-semibold disabled:opacity-50"
                disabled={deviceDisabled || sendingTest}
                onClick={async () => {
                  setSendingTest(true);
                  try {
                    const sent = await sendTestDeviceNotification();
                    setPermissionMessage(sent ? 'Test notification sent to this device.' : 'Enable alerts on this device before sending a test.');
                  } finally {
                    setSendingTest(false);
                  }
                }}
              >{sendingTest ? 'Sending...' : 'Send test notification'}</button>
            </div>
          ) : (
            <div className="mt-3 text-xs text-zinc-400">Choose Allow notifications and accept the operating-system request. Your alert checklist will appear here after access is allowed.</div>
          )}
        </Section>

        <Section title="Consultations">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledConsultations} onChange={e => setSettings(s => ({ ...(s as any), enabledConsultations: e.target.checked }))} />
            Enable in-app consultation reminders
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Lead time (minutes)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.consultationLeadMinutes}
                min={0}
                max={1440}
                onChange={e => setSettings(s => ({ ...(s as any), consultationLeadMinutes: Number(e.target.value || 0) }))}
              />
              <div className="text-[11px] text-zinc-500 mt-1">Example: 60 means notify within the next hour.</div>
            </div>
          </div>
        </Section>

        <Section title="Parts expected delivery">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledPartsDelivery} onChange={e => setSettings(s => ({ ...(s as any), enabledPartsDelivery: e.target.checked }))} />
            Enable expected delivery notifications
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Lookahead (days)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.partsDeliveryLookaheadDays}
                min={0}
                max={365}
                onChange={e => setSettings(s => ({ ...(s as any), partsDeliveryLookaheadDays: Number(e.target.value || 0) }))}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400">Overdue</label>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={settings.includeOverduePartsDelivery} onChange={e => setSettings(s => ({ ...(s as any), includeOverduePartsDelivery: e.target.checked }))} />
                Include overdue deliveries
              </label>
            </div>
          </div>
        </Section>

        <Section title="Calendar events">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledEvents} onChange={e => setSettings(s => ({ ...(s as any), enabledEvents: e.target.checked }))} />
            Enable event reminders
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Lead time (minutes)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.eventLeadMinutes}
                min={0}
                max={1440}
                onChange={e => setSettings(s => ({ ...(s as any), eventLeadMinutes: Number(e.target.value || 0) }))}
              />
            </div>
          </div>
        </Section>

        <Section title="Technicians">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledTechScheduleChanges} onChange={e => setSettings(s => ({ ...(s as any), enabledTechScheduleChanges: e.target.checked }))} />
            Notify when a technician schedule changes
          </label>
          <div className="text-[11px] text-zinc-500 mt-1">Detected on this device when Admin updates schedules.</div>
        </Section>

        <Section title="Daily Look" detail="Send a daily digest of today's calendar items into Notifications.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledDailyLook} onChange={e => setSettings(s => ({ ...(s as any), enabledDailyLook: e.target.checked }))} />
            Enable Daily Look digest
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Time of day</label>
              <input
                type="time"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.dailyLookTimeLocal || '10:00'}
                onChange={e => setSettings(s => ({ ...(s as any), dailyLookTimeLocal: e.target.value }))}
                disabled={!settings.enabledDailyLook}
              />
              <div className="text-[11px] text-zinc-500 mt-1">Example: 10:00 sends today's list at 10 AM.</div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400">On open</label>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input
                  type="checkbox"
                  checked={settings.dailyLookOnOpen !== false}
                  onChange={e => setSettings(s => ({ ...(s as any), dailyLookOnOpen: e.target.checked }))}
                  disabled={!settings.enabledDailyLook}
                />
                Also send when app opens
              </label>
              <div className="text-[11px] text-zinc-500 mt-1">If the time already passed, it will send on open automatically.</div>
            </div>
          </div>
        </Section>

        <Section title="Rules" detail="Control when reminders can be generated.">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.quietHoursEnabled} onChange={e => setSettings(s => ({ ...(s as any), quietHoursEnabled: e.target.checked }))} />
            Enable quiet hours
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Quiet starts</label>
              <input
                type="time"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.quietHoursStartLocal || '20:00'}
                onChange={e => setSettings(s => ({ ...(s as any), quietHoursStartLocal: e.target.value }))}
                disabled={!settings.quietHoursEnabled}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400">Quiet ends</label>
              <input
                type="time"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.quietHoursEndLocal || '08:00'}
                onChange={e => setSettings(s => ({ ...(s as any), quietHoursEndLocal: e.target.value }))}
                disabled={!settings.quietHoursEnabled}
              />
            </div>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">During quiet hours, the app will not generate new notifications.</div>
        </Section>

        <Section title="Cleanup">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Keep unread (days)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.keepUnreadDays}
                min={1}
                max={365}
                onChange={e => setSettings(s => ({ ...(s as any), keepUnreadDays: Number(e.target.value || 30) }))}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400">Purge read after (days)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.purgeReadAfterDays}
                min={0}
                max={365}
                onChange={e => setSettings(s => ({ ...(s as any), purgeReadAfterDays: Number(e.target.value || 14) }))}
              />
              <div className="text-[11px] text-zinc-500 mt-1">0 disables auto-purge.</div>
            </div>
          </div>
        </Section>

        <Section title="Test" detail="Regenerate notifications right now from Calendar, Work Orders, and Sales.">
          <button
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
            onClick={async () => {
              try { await syncNotificationsFromCalendar(); } catch {}
              try { await syncNotificationsFromRecords(); } catch {}
            }}
          >
            Run sync now
          </button>
        </Section>
      </div>
    </div>
  );
};

export default NotificationSettingsWindow;
