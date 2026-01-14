export const iosVersions = [
  'iOS 10','iOS 11','iOS 12','iOS 13','iOS 14','iOS 15','iOS 16','iOS 17','iOS 18'
];

export const iPadOsVersions = [
  'iPadOS 13','iPadOS 14','iPadOS 15','iPadOS 16','iPadOS 17','iPadOS 18'
];

export const macOsVersions = [
  'OS X 10.11 El Capitan',
  'macOS 10.12 Sierra',
  'macOS 10.13 High Sierra',
  'macOS 10.14 Mojave',
  'macOS 10.15 Catalina',
  'macOS 11 Big Sur',
  'macOS 12 Monterey',
  'macOS 13 Ventura',
  'macOS 14 Sonoma',
  'macOS 15 Sequoia'
];

export const watchOsVersions = [
  'watchOS 6','watchOS 7','watchOS 8','watchOS 9','watchOS 10','watchOS 11'
];

export const tvOsVersions = [
  'tvOS 12','tvOS 13','tvOS 14','tvOS 15','tvOS 16','tvOS 17'
];

export const homePodVersions = [
  'HomePod Software 12','HomePod Software 13','HomePod Software 14','HomePod Software 15','HomePod Software 16'
];

export const androidVersions = [
  'Android 8 (Oreo)','Android 9 (Pie)','Android 10','Android 11','Android 12','Android 13','Android 14','Android 15','Android 16'
];

export const windowsVersions = [
  'Windows 7','Windows 8.1','Windows 10','Windows 11','Other'
];

export const linuxOptions = ['Ubuntu 18.04','Ubuntu 20.04','Ubuntu 22.04','Ubuntu 24.04','Other'];

export function getOsOptions(deviceType?: string, deviceFamily?: string) {
  const fam = (deviceFamily || '').toLowerCase();
  // Prefer explicit family heuristics when available (so Apple family like iPhone -> iOS, iPad -> iPadOS)
  if (fam) {
    if (fam.includes('iphone')) return iosVersions;
    if (fam.includes('ipad')) return iPadOsVersions;
    if (fam.includes('mac') || fam.includes('macbook') || fam.includes('imac') || fam.includes('mac mini') || fam.includes('mac studio') || fam.includes('mac pro')) return macOsVersions;
    if (fam.includes('watch')) return watchOsVersions;
    if (fam.includes('apple tv') || fam.includes('appletv')) return tvOsVersions;
    if (fam.includes('homepod')) return homePodVersions;
  }

  switch ((deviceType || '').toLowerCase()) {
    case 'apple devices':
      // Fallback to a combined list if family not provided
      return [...iosVersions, ...iPadOsVersions, ...macOsVersions, ...watchOsVersions].slice(0, 12);
    case 'phone':
      return [...androidVersions, ...iosVersions].slice(0, 12);
    case 'tablet':
      return [...iPadOsVersions, ...androidVersions].slice(0, 12);
    case 'laptop':
    case 'gaming laptop':
      return [...windowsVersions, ...macOsVersions, ...linuxOptions].slice(0, 12);
    case 'custom pc':
    case 'custom build':
      return ['Windows 10','Windows 11','Linux (Ubuntu)','Other'];
    case 'console':
      return ['Console OS / Firmware (varies)','Other'];
    case 'audio':
      return ['Firmware (varies)','Other'];
    default:
      return ['Other'];
  }
}

export default getOsOptions;
