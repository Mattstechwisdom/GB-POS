import React, { useEffect, useMemo, useRef, useState } from 'react';
import { classifyRepairTutorialUrl, shiftedTutorialTime, tutorialEmbedUrl, type RepairTutorialSource } from '../lib/repairTutorial';

type Props = { source: RepairTutorialSource | string; onClose?: () => void };

export default function RepairTutorialPlayer({ source, onClose }: Props) {
  const tutorial = useMemo(() => typeof source === 'string' ? classifyRepairTutorialUrl(source) : source, [source]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (tutorial?.mediaType !== 'youtube') return;
    const receive = (event: MessageEvent) => {
      if (!String(event.origin || '').endsWith('youtube-nocookie.com')) return;
      let data: any = event.data;
      try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
      const info = data?.info;
      if (Number.isFinite(info?.currentTime)) setCurrentTime(info.currentTime);
      if (Number.isFinite(info?.duration)) setDuration(info.duration);
      if (Number.isFinite(info?.playerState)) setPlaying(info.playerState === 1);
    };
    window.addEventListener('message', receive);
    const timer = window.setInterval(() => {
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'gbpos-tutorial' }), '*');
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'getCurrentTime', args: [] }), '*');
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'getDuration', args: [] }), '*');
    }, 750);
    return () => { window.removeEventListener('message', receive); window.clearInterval(timer); };
  }, [tutorial?.mediaType]);

  if (!tutorial) return <div className="flex min-h-full items-center justify-center bg-zinc-950 p-6 text-zinc-200">Invalid tutorial URL.</div>;

  const youtubeCommand = (func: string, args: any[] = []) => frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  const seek = (delta: number) => {
    const target = shiftedTutorialTime(videoRef.current?.currentTime ?? currentTime, delta, videoRef.current?.duration ?? duration);
    if (videoRef.current) videoRef.current.currentTime = target;
    else youtubeCommand('seekTo', [target, true]);
    setCurrentTime(target);
  };
  const togglePlayback = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) void videoRef.current.play(); else videoRef.current.pause();
      return;
    }
    youtubeCommand(playing ? 'pauseVideo' : 'playVideo');
    setPlaying(!playing);
  };
  const changeVolume = (next: number) => {
    setVolume(next);
    if (videoRef.current) videoRef.current.volume = next;
    else youtubeCommand('setVolume', [Math.round(next * 100)]);
  };
  const changeRate = (next: number) => {
    setRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
    else youtubeCommand('setPlaybackRate', [next]);
  };
  const openExternal = () => {
    const api = (window as any).api;
    if (api?.openUrl) void api.openUrl(tutorial.normalizedUrl);
    else window.open(tutorial.normalizedUrl, '_blank', 'noopener,noreferrer');
  };

  return <div ref={shellRef} className="flex min-h-full flex-col bg-zinc-950 text-zinc-100">
    <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
      <div><div className="font-bold text-[#39FF14]">Repair Tutorial</div><div className="max-w-[70vw] truncate text-xs text-zinc-500">{tutorial.normalizedUrl}</div></div>
      {onClose ? <button type="button" aria-label="Close" onClick={onClose} className="rounded border border-zinc-700 px-3 py-1.5">Close</button> : null}
    </header>
    <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
      {tutorial.mediaType === 'youtube' ? <iframe ref={frameRef} id="gbpos-tutorial" src={tutorialEmbedUrl(tutorial)} title="Repair tutorial video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="aspect-video h-auto max-h-full w-full border-0" /> : null}
      {tutorial.mediaType === 'direct-video' ? <video ref={videoRef} src={tutorial.normalizedUrl} playsInline controls className="max-h-full w-full" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} onDurationChange={(event) => setDuration(event.currentTarget.duration)} /> : null}
      {tutorial.mediaType === 'webpage' ? <div className="max-w-md p-6 text-center"><p className="mb-4 text-zinc-300">This tutorial page must be opened in your browser.</p><button type="button" onClick={openExternal} className="rounded bg-[#39FF14] px-4 py-2 font-bold text-black">Open in browser</button></div> : null}
    </div>
    {tutorial.mediaType !== 'webpage' ? <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-zinc-800 p-3">
      <button type="button" aria-label="Rewind 10 seconds" onClick={() => seek(-10)} className="rounded bg-zinc-800 px-3 py-2">−10s</button>
      <button type="button" aria-label="Play or pause" onClick={togglePlayback} className="rounded bg-[#39FF14] px-4 py-2 font-bold text-black">{playing ? 'Pause' : 'Play'}</button>
      <button type="button" aria-label="Skip 10 seconds" onClick={() => seek(10)} className="rounded bg-zinc-800 px-3 py-2">+10s</button>
      <label className="flex items-center gap-2 text-xs">Volume<input aria-label="Volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => changeVolume(Number(event.target.value))} /></label>
      <select aria-label="Playback speed" value={rate} onChange={(event) => changeRate(Number(event.target.value))} className="rounded bg-zinc-800 px-2 py-2 text-sm">{[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => <option key={value} value={value}>{value}×</option>)}</select>
      <button type="button" aria-label="Full screen" onClick={() => void shellRef.current?.requestFullscreen?.()} className="rounded bg-zinc-800 px-3 py-2">Full screen</button>
      <button type="button" aria-label="Open in browser" onClick={openExternal} className="rounded border border-zinc-700 px-3 py-2">Open in browser</button>
    </footer> : null}
  </div>;
}
