import { Capacitor } from '@capacitor/core';

export type GidgetModelProgress = {
  status: 'idle' | 'downloading' | 'verifying' | 'loading' | 'ready' | 'error';
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  error?: string;
  model?: { name: string; sizeLabel: string };
};

const ANDROID_MODEL = {
  id: 'qwen3-1.7b-q4km',
  name: 'Gidget Mobile 1.7B',
  filename: 'Qwen3-1.7B-Q4_K_M.gguf',
  url: 'https://huggingface.co/ggml-org/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf?download=true',
  sha256: 'd2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5',
  sizeLabel: '1.3 GB',
};
const ANDROID_VERIFIED_KEY = `gbpos:gidget:model:${ANDROID_MODEL.sha256}`;

let nativeModule: any = null;
let nativeContext: any = null;
let nativeModelPath = '';
let progressTimer: number | null = null;

function isDesktopBridge() {
  return typeof window !== 'undefined' && typeof window.api?.gidgetLocalStatus === 'function';
}

async function nativeApi() {
  if (!nativeModule) nativeModule = await import('llama-cpp-pro');
  return nativeModule;
}

async function findNativeModel() {
  const api = await nativeApi();
  const models = await api.getAvailableModels();
  const match = (models || []).find((model: any) =>
    String(model.name || '').toLowerCase() === ANDROID_MODEL.filename.toLowerCase()
    || String(model.path || '').toLowerCase().endsWith(ANDROID_MODEL.filename.toLowerCase()));
  return match?.path || '';
}

async function loadNativeModel(onProgress?: (value: GidgetModelProgress) => void) {
  if (nativeContext) return nativeContext;
  const api = await nativeApi();
  nativeModelPath = nativeModelPath || await findNativeModel();
  if (!nativeModelPath) throw new Error('Gidget needs to finish its one-time model setup.');
  onProgress?.({ status: 'loading', progress: 100, model: ANDROID_MODEL });
  nativeContext = await api.initLlama({
    model: nativeModelPath,
    n_ctx: 4096,
    n_batch: 256,
    n_threads: 4,
    n_gpu_layers: 0,
    use_mmap: true,
  });
  onProgress?.({ status: 'ready', progress: 100, model: ANDROID_MODEL });
  return nativeContext;
}

async function verifyAndroidModel(path: string) {
  const bridge = (window as any).GBPosAndroid;
  if (!bridge?.verifyModelSha256) throw new Error('This app build cannot verify the local model. Update GadgetBoy POS and retry.');
  const id = `gidget-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('gbpos-gidget-model-verified', listener as EventListener);
      reject(new Error('Model verification timed out.'));
    }, 10 * 60 * 1000);
    const listener = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (detail.id !== id) return;
      window.clearTimeout(timeout);
      window.removeEventListener('gbpos-gidget-model-verified', listener as EventListener);
      detail.valid ? resolve() : reject(new Error(detail.error || 'The downloaded model failed its security check.'));
    };
    window.addEventListener('gbpos-gidget-model-verified', listener as EventListener);
    bridge.verifyModelSha256(path, ANDROID_MODEL.sha256, id);
  });
}

export async function gidgetLocalStatus(): Promise<GidgetModelProgress & { ready: boolean; supported: boolean }> {
  if (isDesktopBridge()) {
    const result = await window.api.gidgetLocalStatus!();
    return { ...result, supported: true, ready: !!result.ready, status: result.ready ? 'ready' : result.status || 'idle', progress: result.progress || 0 };
  }
  if (Capacitor.getPlatform() === 'android') {
    const path = await findNativeModel();
    nativeModelPath = path;
    const verified = !!path && localStorage.getItem(ANDROID_VERIFIED_KEY) === path;
    return { supported: true, ready: verified, status: verified ? 'ready' : 'idle', progress: verified ? 100 : 0, model: ANDROID_MODEL };
  }
  return { supported: false, ready: false, status: 'idle', progress: 0, model: ANDROID_MODEL };
}

export function subscribeGidgetProgress(callback: (value: GidgetModelProgress) => void) {
  return window.api?.onGidgetModelProgress?.(callback) || (() => undefined);
}

export async function setupGidgetModel(onProgress: (value: GidgetModelProgress) => void) {
  if (isDesktopBridge()) return window.api.gidgetLocalSetup!();
  if (Capacitor.getPlatform() !== 'android') throw new Error('Local Gidget inference is available in the installed Windows and Android apps.');
  const api = await nativeApi();
  const existing = await findNativeModel();
  if (existing) {
    nativeModelPath = existing;
    onProgress({ status: 'verifying', progress: 99, model: ANDROID_MODEL });
    await verifyAndroidModel(existing);
    localStorage.setItem(ANDROID_VERIFIED_KEY, existing);
    await loadNativeModel(onProgress);
    return { ok: true, ready: true };
  }
  onProgress({ status: 'downloading', progress: 0, model: ANDROID_MODEL });
  progressTimer = window.setInterval(() => {
    void api.getDownloadProgress(ANDROID_MODEL.url).then((item: any) => onProgress({
      status: item.failed ? 'error' : item.completed ? 'loading' : 'downloading',
      progress: Math.max(0, Math.min(100, Math.round(Number(item.progress || 0)))),
      downloadedBytes: item.downloadedBytes,
      totalBytes: item.totalBytes,
      error: item.errorMessage,
      model: ANDROID_MODEL,
    })).catch(() => undefined);
  }, 500);
  try {
    nativeModelPath = await api.downloadModel(ANDROID_MODEL.url, ANDROID_MODEL.filename);
    onProgress({ status: 'verifying', progress: 99, model: ANDROID_MODEL });
    await verifyAndroidModel(nativeModelPath);
    localStorage.setItem(ANDROID_VERIFIED_KEY, nativeModelPath);
    await loadNativeModel(onProgress);
    return { ok: true, ready: true };
  } finally {
    if (progressTimer !== null) window.clearInterval(progressTimer);
    progressTimer = null;
  }
}

export async function generateWithGidget(payload: any) {
  if (isDesktopBridge()) return window.api.gidgetLocalGenerate!(payload);
  const context = await loadNativeModel();
  const history = (Array.isArray(payload?.messages) ? payload.messages : []).slice(-12)
    .map((message: any) => `${message.role === 'assistant' ? 'Gidget' : 'Technician'}: ${String(message.content || '').slice(0, 5000)}`)
    .join('\n');
  const records = payload?.records ? `\nAuthenticated read-only POS result:\n${JSON.stringify(payload.records)}\n` : '';
  const memory = payload?.memory_result ? `\nMemory request result:\n${JSON.stringify(payload.memory_result)}\n` : '';
  const web = Array.isArray(payload?.web_sources) && payload.web_sources.length ? `\nCurrent web research sources:\n${JSON.stringify(payload.web_sources)}\n` : '';
  const result = await context.completion({
    messages: [
      { role: 'system', content: String(payload?.instructions || 'You are Gidget, a private repair assistant.') },
      { role: 'user', content: `${history}${records}${memory}${web}\nAnswer the latest technician message. POS facts must come only from the authenticated POS result. Never guess shop facts. Treat web snippets as leads and cite their source titles.` },
    ],
    n_predict: 640,
    temperature: 0.35,
    top_p: 0.9,
    penalty_repeat: 1.08,
    enable_thinking: false,
  });
  return { ok: true, answer: String(result.content || result.text || '').trim(), model: ANDROID_MODEL.name };
}

export async function cancelGidgetWork() {
  if (isDesktopBridge()) return window.api.gidgetLocalCancel!();
  if (progressTimer !== null && nativeModule) await nativeModule.cancelDownload(ANDROID_MODEL.url).catch(() => undefined);
  await nativeContext?.stopCompletion?.().catch(() => undefined);
  return { ok: true };
}

export const GIDGET_ANDROID_MODEL = ANDROID_MODEL;
