const { app } = require('electron');

app.whenReady().then(async () => {
  try {
    const module = await import('node-llama-cpp');
    const llama = await module.getLlama({ gpu: false, progressLogs: false, skipDownload: true });
    if (!llama) throw new Error('node-llama-cpp did not initialize.');
    console.log('Gidget desktop native runtime initialized.');
    await llama.dispose();
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
