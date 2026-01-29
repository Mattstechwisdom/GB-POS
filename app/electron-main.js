// Packaged entrypoint shim.
// This exists to ensure the installed app always starts from JavaScript,
// even if a stale build or misconfiguration points Electron at /app/*.
// It forwards to the compiled main process bundle.

const path = require('path');

// In production, app.getAppPath() points at the app.asar root.
// This shim sits at /app/electron-main.js inside the asar.
require(path.join(__dirname, '..', 'dist-main', 'app', 'electron', 'electron-main.js'));
