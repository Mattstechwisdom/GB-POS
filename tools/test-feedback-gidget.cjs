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
const chat = read('src/components/GidgetChat.tsx');
expect(localRuntime.includes('if (downloadPromise) return downloadPromise'), 'Desktop Gidget setup must serialize competing model downloads.');
expect(localRuntime.includes('await cancelActiveDownload()'), 'Desktop Gidget repair must wait for an active model download to release its file.');
expect(localRuntime.includes("headers.Range = `bytes=${existingBytes}-`"), 'Desktop Gidget must resume an interrupted model download.');
expect(localRuntime.includes('return ipcFailure(error)'), 'Desktop Gidget IPC must return actionable setup errors instead of remote-method exceptions.');
expect(localRuntime.includes('if (modelLoadPromise) return modelLoadPromise'), 'Desktop Gidget must serialize model startup.');
expect(localRuntime.includes('void getModel(app, event.sender).catch'), 'Desktop status checks must start model loading without blocking the UI.');
expect(localRuntime.includes('Gidget took too long to answer'), 'Desktop generation must not leave Gidget checking forever.');
expect(chat.includes("setRequestStage('Preparing shop context')"), 'Gidget must expose its request preparation stage.');
expect(chat.includes("setRequestStage('Generating answer')"), 'Gidget must expose its local generation stage.');
expect(chat.includes('optionalWithin(ensureConversation(content), 6000, null)'), 'Gidget history persistence must not block a response forever.');
expect(localRuntime.includes('/no_think'), 'Desktop Gidget must request a direct answer instead of spending its response budget on hidden reasoning.');
expect(localRuntime.includes('maxTokens: 320'), 'Desktop Gidget must use a CPU-appropriate response budget.');
expect(localRuntime.includes(".slice(-4)"), 'Desktop Gidget must keep prompts within its local context window.');

const engine = read('src/lib/gidgetLocalEngine.ts');
expect(engine.includes('Array.isArray(result?.models)'), 'Android model discovery must unwrap native plugin results.');
expect(engine.includes('downloadResult?.localPath'), 'Android model download must unwrap its local path.');
expect(engine.includes("if (!result?.ok) throw new Error(result?.error"), 'The Gidget UI must surface structured desktop setup failures.');

const packageJson = JSON.parse(read('package.json'));
expect(packageJson.dependencies['node-llama-cpp'] === '3.8.1', 'Desktop Gidget must use the Qwen3-capable Electron 29 runtime.');

expect(chat.includes('buildReadOnlyPosContext'), 'Gidget must have standalone read-only POS context.');
expect(chat.includes("from('gidget_memories')"), 'Gidget must load explicit learned memories.');
expect(!chat.includes('/api/gidget/context'), 'Gidget must not depend on the retired hosted context endpoint.');
expect(chat.includes('if (open && !wasOpenRef.current) newConversation()'), 'Opening Gidget must start a fresh chat.');
expect(chat.includes('onContextMenu='), 'Desktop chat history must expose right-click actions.');
expect(chat.includes('startHistoryHold'), 'Mobile chat history must expose touch-and-hold actions.');
expect(chat.includes('const deleteConversation = useCallback') && chat.includes(".eq('id', conversation.id)"), 'Chat history must support deleting a selected conversation.');
expect(chat.includes('await withTimeout(generateWithGidget'), 'The Gidget UI must recover if the native model never returns.');

console.log('Feedback retention and Gidget integration checks passed.');
