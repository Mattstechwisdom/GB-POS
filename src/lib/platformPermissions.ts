import {
  loadDeviceNotificationSettings,
  requestDeviceNotificationPermission,
} from './notifications';

export type PlatformPermission = 'granted' | 'denied' | 'prompt' | 'unsupported';

function normalizePermission(value: unknown): PlatformPermission {
  return value === 'granted' || value === 'denied' || value === 'unsupported' ? value : 'prompt';
}

function androidBridge() {
  return window.GBPosAndroid;
}

function waitForAndroidMicrophoneResult(): Promise<PlatformPermission> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => finish('prompt'), 20_000);
    const finish = (permission: PlatformPermission) => {
      window.clearTimeout(timeout);
      window.removeEventListener('gbpos:android-microphone-permission-result', onResult as EventListener);
      resolve(permission);
    };
    const onResult = (event: Event) => {
      const value = String((event as CustomEvent)?.detail?.permission || '').toLowerCase();
      if (value === 'granted' || value === 'denied') finish(value);
    };
    window.addEventListener('gbpos:android-microphone-permission-result', onResult as EventListener);
  });
}

export async function getMicrophonePermission(): Promise<PlatformPermission> {
  const bridge = androidBridge();
  if (typeof bridge?.getMicrophonePermissionStatus === 'function') {
    const value = String(bridge.getMicrophonePermissionStatus() || '').toLowerCase();
    if (value === 'granted' || value === 'denied' || value === 'prompt') return value;
  }
  if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
  try {
    const result = await navigator.permissions?.query?.({ name: 'microphone' as PermissionName });
    if (result?.state === 'granted' || result?.state === 'denied' || result?.state === 'prompt') return result.state;
  } catch {
    // Chromium does not expose Permissions API support consistently in Electron.
  }
  return 'prompt';
}

export async function requestMicrophonePermission(): Promise<PlatformPermission> {
  const current = await getMicrophonePermission();
  if (current !== 'prompt') return current;
  const bridge = androidBridge();
  if (typeof bridge?.requestMicrophonePermission === 'function') {
    const pending = waitForAndroidMicrophoneResult();
    const requested = String(bridge.requestMicrophonePermission() || '').toLowerCase();
    const result = requested === 'granted' || requested === 'denied' ? requested : await pending;
    window.dispatchEvent(new CustomEvent('gbpos:microphone-permission-changed', { detail: { permission: result } }));
    return result;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    stream.getTracks().forEach((track) => track.stop());
    window.dispatchEvent(new CustomEvent('gbpos:microphone-permission-changed', { detail: { permission: 'granted' } }));
    return 'granted';
  } catch (error: any) {
    const permission: PlatformPermission = error?.name === 'NotAllowedError' || error?.name === 'SecurityError' ? 'denied' : 'prompt';
    window.dispatchEvent(new CustomEvent('gbpos:microphone-permission-changed', { detail: { permission } }));
    return permission;
  }
}

export async function requestStartupPermissions() {
  let notifications: PlatformPermission = 'prompt';
  try {
    const current = await loadDeviceNotificationSettings();
    const currentPermission = normalizePermission(current.permission);
    notifications = currentPermission === 'prompt'
      ? normalizePermission((await requestDeviceNotificationPermission()).permission)
      : currentPermission;
  } catch {
    // Leave the state as prompt so Settings can retry the platform request.
  }
  let microphone: PlatformPermission = 'prompt';
  try {
    microphone = await requestMicrophonePermission();
  } catch {
    // Leave the state as prompt so Settings can retry the platform request.
  }
  return {
    microphone,
    notifications,
  };
}
