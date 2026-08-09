import { useEffect } from 'react';
import { requestMicrophonePermission, requestStartupPermissions } from '../lib/platformPermissions';

export default function PlatformPermissionHandshake() {
  useEffect(() => {
    const timer = window.setTimeout(() => { void requestStartupPermissions(); }, 800);
    const retryMicrophone = () => { void requestMicrophonePermission(); };
    window.addEventListener('gbpos:request-microphone-permission', retryMicrophone);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('gbpos:request-microphone-permission', retryMicrophone);
    };
  }, []);

  return null;
}
