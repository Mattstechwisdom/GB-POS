import { useEffect } from 'react';
import { requestMicrophonePermission } from '../lib/platformPermissions';

export default function PlatformPermissionHandshake() {
  useEffect(() => {
    const retryMicrophone = () => { void requestMicrophonePermission(); };
    window.addEventListener('gbpos:request-microphone-permission', retryMicrophone);
    return () => {
      window.removeEventListener('gbpos:request-microphone-permission', retryMicrophone);
    };
  }, []);

  return null;
}
