const { app } = require('electron');
const path = require('path');

const modelPath = process.argv[2] ? path.resolve(process.argv[2]) : '';

app.whenReady().then(async () => {
  try {
    const module = await import('node-llama-cpp');
    const llama = await module.getLlama({ gpu: false, progressLogs: !!modelPath, skipDownload: true });
    if (!llama) throw new Error('node-llama-cpp did not initialize.');
    if (modelPath) {
      const model = await llama.loadModel({ modelPath, onLoadProgress: (progress) => console.log(`Gidget model load ${Math.round(progress * 100)}%`) });
      if (!model) throw new Error('node-llama-cpp did not load the Gidget model.');
      console.log('Gidget desktop model loaded successfully.');
      const context = await model.createContext({ contextSize: 2048 });
      const session = new module.LlamaChatSession({ contextSequence: context.getSequence() });
      const startedAt = Date.now();
      let firstTokenAt = 0;
      let streamed = '';
      const answer = await session.prompt('Reply with the words Gidget is ready.', {
        maxTokens: 32,
        temperature: 0,
        onTextChunk: (text) => {
          firstTokenAt ||= Date.now();
          streamed += text;
        },
      });
      if (!String(answer || '').trim()) throw new Error('Gidget loaded but did not generate a response.');
      if (!streamed.trim()) throw new Error('Gidget generated an answer without streaming visible text.');
      console.log(`Gidget generated: ${String(answer).trim()}`);
      console.log(`Gidget first token: ${firstTokenAt - startedAt}ms; completed: ${Date.now() - startedAt}ms`);
      await context.dispose();
      await model.dispose();
    }
    console.log('Gidget desktop native runtime initialized.');
    await llama.dispose();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
