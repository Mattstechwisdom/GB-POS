const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const feedback = read('src/components/FeedbackWindow.tsx');
expect(feedback.includes('3 * 24 * 60 * 60 * 1000'), 'Completed feedback must retain for three days.');
expect(feedback.includes("dbDelete('feedbackEntries', entry.id)"), 'Expired feedback must be removed from storage.');
expect(feedback.includes('deleteSelected'), 'Opened feedback must expose manual deletion.');

const preload = read('app/electron/preload.ts');
for (const method of ['gidgetLocalStatus', 'gidgetLocalSetup', 'gidgetLocalGenerate', 'gidgetLocalCancel', 'gidgetLocalRemove']) {
  expect(preload.includes(`${method}:`), `Electron preload is missing ${method}.`);
}
expect(preload.includes("ipcRenderer.on('gidget:model-progress'"), 'Electron model progress must reach the UI.');

const main = read('app/electron/electron-main.ts');
expect(main.includes('registerGidgetLocalIpc({ ipcMain, app })'), 'Electron must register Gidget IPC.');

const localRuntime = read('app/electron/gidget-local.ts');
expect(localRuntime.includes('if (downloadPromise) return downloadPromise'), 'Desktop Gidget setup must serialize competing model downloads.');
expect(localRuntime.includes('await cancelActiveDownload()'), 'Desktop Gidget repair must wait for an active model download to release its file.');
expect(localRuntime.includes("headers.Range = `bytes=${existingBytes}-`"), 'Desktop Gidget must resume an interrupted model download.');
expect(localRuntime.includes('return ipcFailure(error)'), 'Desktop Gidget IPC must return actionable setup errors instead of remote-method exceptions.');

const engine = read('src/lib/gidgetLocalEngine.ts');
expect(engine.includes('Array.isArray(result?.models)'), 'Android model discovery must unwrap native plugin results.');
expect(engine.includes('downloadResult?.localPath'), 'Android model download must unwrap its local path.');
expect(engine.includes("if (!result?.ok) throw new Error(result?.error"), 'The Gidget UI must surface structured desktop setup failures.');

const chat = read('src/components/GidgetChat.tsx');
expect(chat.includes('buildReadOnlyPosContext'), 'Gidget must have standalone read-only POS context.');
expect(chat.includes("from('gidget_memories')"), 'Gidget must load explicit learned memories.');
expect(!chat.includes('/api/gidget/context'), 'Gidget must not depend on the retired hosted context endpoint.');

console.log('Feedback retention and Gidget integration checks passed.');
