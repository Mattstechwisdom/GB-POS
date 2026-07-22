const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const MODEL = {
  id: 'qwen3-4b-q4km',
  name: 'Gidget 4B',
  filename: 'Qwen3-4B-Q4_K_M.gguf',
  url: 'https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf?download=true',
  sha256: '7485fe6f11af29433bc51cab58009521f205840f5b4ae3a32fa7f92e8534fdf5',
  sizeLabel: '2.5 GB',
};

type DownloadState = { status: string; progress: number; downloadedBytes: number; totalBytes: number; error?: string };

let state: DownloadState = { status: 'idle', progress: 0, downloadedBytes: 0, totalBytes: 0 };
let downloadRequest: any = null;
let llamaRuntime: any = null;
let loadedModel: any = null;
let activeAbort: AbortController | null = null;

function modelDir(app: any) {
  return path.join(app.getPath('userData'), 'gidget', 'models');
}

function modelPath(app: any) {
  return path.join(modelDir(app), MODEL.filename);
}

function verifiedPath(app: any) {
  return `${modelPath(app)}.verified`;
}

function emit(sender: any) {
  try { sender.send('gidget:model-progress', { ...state, model: MODEL }); } catch {}
}

function dynamicImport(specifier: string): Promise<any> {
  return Function('s', 'return import(s)')(specifier);
}

async function sha256File(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk: Buffer) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function isVerified(app: any) {
  const file = modelPath(app);
  const marker = verifiedPath(app);
  if (!fs.existsSync(file) || !fs.existsSync(marker)) return false;
  try {
    return String(fs.readFileSync(marker, 'utf8')).trim() === MODEL.sha256;
  } catch {
    return false;
  }
}

function requestDownload(url: string, destination: string, sender: any, redirects = 0): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > 6) return reject(new Error('The model download redirected too many times.'));
    const request = https.get(url, { headers: { 'User-Agent': 'GadgetBoy-POS' } }, (response: any) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        void requestDownload(next, destination, sender, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Model download failed (${response.statusCode}).`));
        return;
      }
      const total = Number(response.headers['content-length'] || 0);
      state = { status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: total };
      const output = fs.createWriteStream(destination);
      response.on('data', (chunk: Buffer) => {
        state.downloadedBytes += chunk.length;
        state.progress = total > 0 ? Math.min(99, Math.round((state.downloadedBytes / total) * 100)) : 0;
        emit(sender);
      });
      response.on('error', reject);
      output.on('error', reject);
      output.on('finish', () => output.close(resolve));
      response.pipe(output);
      downloadRequest = response;
    });
    request.on('error', reject);
    downloadRequest = request;
  });
}

async function ensureDownloaded(app: any, sender: any) {
  if (await isVerified(app)) return modelPath(app);
  fs.mkdirSync(modelDir(app), { recursive: true });
  const finalPath = modelPath(app);
  const partialPath = `${finalPath}.part`;
  try { fs.rmSync(partialPath, { force: true }); } catch {}
  state = { status: 'downloading', progress: 0, downloadedBytes: 0, totalBytes: 0 };
  emit(sender);
  try {
    await requestDownload(MODEL.url, partialPath, sender);
    state = { ...state, status: 'verifying', progress: 99 };
    emit(sender);
    const digest = await sha256File(partialPath);
    if (digest !== MODEL.sha256) throw new Error('The downloaded model failed its security check. Please retry.');
    fs.renameSync(partialPath, finalPath);
    fs.writeFileSync(verifiedPath(app), MODEL.sha256, 'utf8');
    state = { status: 'ready', progress: 100, downloadedBytes: fs.statSync(finalPath).size, totalBytes: fs.statSync(finalPath).size };
    emit(sender);
    return finalPath;
  } catch (error: any) {
    try { fs.rmSync(partialPath, { force: true }); } catch {}
    state = { ...state, status: 'error', error: error?.message || String(error) };
    emit(sender);
    throw error;
  } finally {
    downloadRequest = null;
  }
}

async function getModel(app: any) {
  if (loadedModel) return loadedModel;
  if (!(await isVerified(app))) throw new Error('Gidget needs to finish its one-time model setup.');
  state = { ...state, status: 'loading', progress: 100 };
  if (!llamaRuntime) {
    const module = await dynamicImport('node-llama-cpp');
    llamaRuntime = { module, llama: await module.getLlama({ gpu: 'auto', progressLogs: false }) };
  }
  loadedModel = await llamaRuntime.llama.loadModel({ modelPath: modelPath(app) });
  state = { ...state, status: 'ready', progress: 100 };
  return loadedModel;
}

function buildPrompt(messages: any[], records: any, memoryResult: any, webSources: any[]) {
  const history = (Array.isArray(messages) ? messages : []).slice(-12)
    .map((message) => `${message.role === 'assistant' ? 'Gidget' : 'Technician'}: ${String(message.content || '').slice(0, 5000)}`)
    .join('\n');
  const recordContext = records ? `\nAuthenticated read-only POS result:\n${JSON.stringify(records)}\n` : '';
  const memoryContext = memoryResult ? `\nMemory request result:\n${JSON.stringify(memoryResult)}\n` : '';
  const webContext = Array.isArray(webSources) && webSources.length ? `\nCurrent web research sources:\n${JSON.stringify(webSources)}\n` : '';
  return `${history}${recordContext}${memoryContext}${webContext}\nAnswer the technician's latest message. POS facts must come only from the authenticated POS result above. If no POS result was supplied, say you cannot verify shop records instead of guessing. Use web snippets only as leads, cite their source titles, and state uncertainty when the source is incomplete.`;
}

export function registerGidgetLocalIpc({ ipcMain, app }: { ipcMain: any; app: any }) {
  for (const channel of ['gidget:localStatus', 'gidget:localSetup', 'gidget:localGenerate', 'gidget:localCancel']) {
    try { ipcMain.removeHandler(channel); } catch {}
  }
  ipcMain.handle('gidget:localStatus', async () => ({
    ok: true,
    ready: await isVerified(app),
    model: MODEL,
    ...state,
  }));
  ipcMain.handle('gidget:localSetup', async (event: any) => {
    const file = await ensureDownloaded(app, event.sender);
    await getModel(app);
    return { ok: true, ready: true, path: file, model: MODEL };
  });
  ipcMain.handle('gidget:localGenerate', async (_event: any, payload: any) => {
    const model = await getModel(app);
    const context = await model.createContext({ contextSize: 4096 });
    const sequence = context.getSequence();
    const session = new llamaRuntime.module.LlamaChatSession({
      contextSequence: sequence,
      systemPrompt: String(payload?.instructions || 'You are Gidget, a private repair assistant.'),
    });
    activeAbort = new AbortController();
    try {
      const answer = await session.prompt(buildPrompt(payload?.messages, payload?.records, payload?.memory_result, payload?.web_sources), {
        maxTokens: 640,
        temperature: 0.35,
        signal: activeAbort.signal,
      });
      return { ok: true, answer: String(answer || '').trim(), model: MODEL.name };
    } finally {
      activeAbort = null;
      await context.dispose();
    }
  });
  ipcMain.handle('gidget:localCancel', async () => {
    try { downloadRequest?.destroy?.(new Error('Download canceled.')); } catch {}
    activeAbort?.abort();
    return { ok: true };
  });
}

export const _test = { MODEL, buildPrompt, sha256File };
