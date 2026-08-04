import React, { useEffect, useMemo, useState } from 'react';
import { dispatchOpenModal } from '../lib/modalBus';
import {
  openDeviceNotificationSystemSettings,
  initializeDeviceNotificationActionRouting,
  loadDeviceNotificationSettings,
  requestDeviceNotificationPermission,
} from '../lib/notifications';

const CONSENT_KEY = 'gbpos:notification-consent-version';

const NotificationConsentPrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);
  const isAndroid = useMemo(() => {
    try {
      return !!window.GBPosAndroid || /Android/i.test(navigator.userAgent);
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    void initializeDeviceNotificationActionRouting();
    let cancelled = false;
    let timer = 0;
    const forcePreview = new URLSearchParams(window.location.search).get('notificationConsentPreview') === '1';
    void (async () => {
      let seenDecision = '';
      try { seenDecision = localStorage.getItem(CONSENT_KEY) || ''; } catch {}
      if (!forcePreview && seenDecision) return;

      try {
        const settings = await loadDeviceNotificationSettings();
        if (!forcePreview && settings.permission === 'granted') {
          try { localStorage.setItem(CONSENT_KEY, 'acknowledged'); } catch {}
          return;
        }
      } catch {
        // The consent prompt remains available when device status cannot be read.
      }

      if (cancelled) return;
      timer = window.setTimeout(() => setVisible(true), 1100);
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const rememberDecision = () => {
    try { localStorage.setItem(CONSENT_KEY, 'acknowledged'); } catch {}
  };

  const allowNotifications = async () => {
    setRequesting(true);
    setError('');
    setDenied(false);
    try {
      const settings = await requestDeviceNotificationPermission();
      if (settings.permission === 'granted') {
        rememberDecision();
        setVisible(false);
        window.dispatchEvent(new CustomEvent('gbpos:notification-permission-changed', { detail: settings }));
        window.setTimeout(() => dispatchOpenModal('notificationSettings'), 100);
        return;
      }
      if (settings.permission === 'denied') {
        setDenied(true);
        setError(`${isAndroid ? 'Android' : 'Windows'} did not allow notifications for GadgetBoy POS.`);
      } else {
        setError('The operating system did not finish the notification permission request. Try again.');
      }
    } catch (requestError: any) {
      setError(requestError?.message || 'Notification permission could not be requested.');
    } finally {
      setRequesting(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="gb-notification-consent-layer" role="presentation">
      <section className="gb-notification-consent" role="dialog" aria-modal="true" aria-labelledby="gb-notification-consent-title">
        <div className="gb-notification-consent-badge" aria-hidden="true">!</div>
        <div>
          <div className="gb-notification-consent-kicker">GadgetBoy POS v{__APP_VERSION__}</div>
          <h2 id="gb-notification-consent-title">Allow notifications?</h2>
          <p>Receive consultation reminders, new ticket alerts, parts delivery updates, and technician schedule notices on this device.</p>
        </div>
        {error ? <div className="gb-notification-consent-error" role="alert">{error}</div> : null}
        <div className="gb-notification-consent-actions">
          <button type="button" className="allow" onClick={() => void allowNotifications()} disabled={requesting}>
            {requesting ? `Waiting for ${isAndroid ? 'Android' : 'Windows'}...` : 'Allow notifications'}
          </button>
          {denied ? (
            <button type="button" onClick={() => void openDeviceNotificationSystemSettings()}>Open device settings</button>
          ) : (
            <button type="button" onClick={() => { rememberDecision(); setVisible(false); }} disabled={requesting}>Not now</button>
          )}
        </div>
        <small>You can change notification categories later from Notifications.</small>
      </section>
    </div>
  );
};

export default NotificationConsentPrompt;
