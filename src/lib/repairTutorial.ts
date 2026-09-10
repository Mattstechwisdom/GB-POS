export type RepairTutorialMediaType = 'youtube' | 'direct-video' | 'webpage';

export type RepairTutorialSource = {
  normalizedUrl: string;
  mediaType: RepairTutorialMediaType;
  youtubeId?: string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DIRECT_VIDEO_PATH = /\.(?:mp4|webm|m4v|ogv|ogg|mov)$/i;

function youtubeVideoId(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') return url.pathname.split('/').filter(Boolean)[0] || '';
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'music.youtube.com') return '';
  if (url.pathname === '/watch') return url.searchParams.get('v') || '';
  const [kind, id] = url.pathname.split('/').filter(Boolean);
  return kind === 'embed' || kind === 'shorts' || kind === 'live' ? id || '' : '';
}

export function classifyRepairTutorialUrl(value: unknown): RepairTutorialSource | null {
  const input = String(value || '').trim();
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;

  const youtubeId = youtubeVideoId(url);
  if (YOUTUBE_ID.test(youtubeId)) {
    return {
      normalizedUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
      mediaType: 'youtube',
      youtubeId,
    };
  }

  return {
    normalizedUrl: url.toString(),
    mediaType: DIRECT_VIDEO_PATH.test(url.pathname) ? 'direct-video' : 'webpage',
  };
}

export function repairTutorialControlState(value: unknown):
  | { kind: 'input'; label: 'Tutorial URL' }
  | { kind: 'button'; label: 'Repair Tutorial'; mediaType: RepairTutorialMediaType; url: string } {
  const tutorial = classifyRepairTutorialUrl(value);
  if (!tutorial) return { kind: 'input', label: 'Tutorial URL' };
  return { kind: 'button', label: 'Repair Tutorial', mediaType: tutorial.mediaType, url: tutorial.normalizedUrl };
}

export function tutorialEmbedUrl(source: Pick<RepairTutorialSource, 'mediaType' | 'youtubeId'>): string {
  if (source.mediaType !== 'youtube' || !source.youtubeId || !YOUTUBE_ID.test(source.youtubeId)) return '';
  return `https://www.youtube-nocookie.com/embed/${source.youtubeId}?enablejsapi=1&rel=0&playsinline=1`;
}

export function shiftedTutorialTime(current: number, delta: number, duration: number): number {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(safeDuration, safeCurrent + delta));
}
