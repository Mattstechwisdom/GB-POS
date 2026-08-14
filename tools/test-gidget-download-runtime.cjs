const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const payload = Buffer.from('Gidget model download resume test payload.');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gbpos-gidget-download-'));
const destination = path.join(tempDir, 'model.gguf.part');
fs.writeFileSync(destination, payload.subarray(0, 9));

let receivedRange = '';
const server = http.createServer((request, response) => {
  receivedRange = String(request.headers.range || '');
  const start = Number(receivedRange.match(/^bytes=(\d+)-$/)?.[1] || 0);
  response.writeHead(start ? 206 : 200, {
    'Content-Length': payload.length - start,
    ...(start ? { 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` } : {}),
  });
  response.end(payload.subarray(start));
});

server.listen(0, '127.0.0.1', async () => {
  try {
    const { _test } = require('../dist-main/app/electron/gidget-local.js');
    const address = server.address();
    await _test.requestDownload(`http://127.0.0.1:${address.port}/model`, destination, { send() {} });
    assert.equal(receivedRange, 'bytes=9-', 'Gidget did not request the remaining bytes.');
    assert.deepEqual(fs.readFileSync(destination), payload, 'The resumed model file does not match its source.');
    console.log('Gidget resumable model download check passed.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
