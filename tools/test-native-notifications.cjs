const { app, Notification } = require('electron');

const timeoutMs = 8000;

function finish(code, message) {
  if (message) {
    const output = code === 0 ? console.log : console.error;
    output(message);
  }
  app.exit(code);
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.gadgetboy.pos');
  if (!Notification.isSupported()) {
    finish(1, 'Native Windows notifications are not supported on this computer.');
    return;
  }

  const notice = new Notification({
    title: 'GadgetBoy POS',
    body: 'Windows notification test passed.',
    silent: false,
  });
  const timeout = setTimeout(() => {
    finish(1, 'Windows did not confirm that the native notification was shown.');
  }, timeoutMs);

  notice.once('show', () => {
    clearTimeout(timeout);
    finish(0, 'Windows confirmed the native GadgetBoy POS notification.');
  });
  notice.once('failed', (_event, error) => {
    clearTimeout(timeout);
    finish(1, `Windows notification failed: ${error || 'unknown error'}`);
  });
  notice.show();
}).catch(error => finish(1, error?.message || String(error)));
