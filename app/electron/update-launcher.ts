export function resolveDownloadedInstallerPath(downloadedFiles: unknown): string {
  const files = Array.isArray(downloadedFiles) ? downloadedFiles : [downloadedFiles];
  return files.map(value => String(value || '').trim()).find(value => /\.exe$/i.test(value)) || '';
}

export function buildWindowsUpdateHandoff(installerPath: string, currentPid: number) {
  const quotedPath = String(installerPath || '').replace(/'/g, "''");
  const pid = Math.max(1, Math.trunc(Number(currentPid) || 0));
  const script = [
    `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    'if ($process) { $process.WaitForExit() }',
    'Start-Sleep -Milliseconds 1000',
    `Start-Process -FilePath '${quotedPath}' -ArgumentList @('--updated','/S','--force-run') -WindowStyle Hidden`,
  ].join('; ');
  return {
    executable: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
  };
}
