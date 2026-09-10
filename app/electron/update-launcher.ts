export function buildWindowsUpdateHandoff(installerPath: string, currentPid: number) {
  const quotedPath = String(installerPath || '').replace(/'/g, "''");
  const pid = Math.max(1, Math.trunc(Number(currentPid) || 0));
  const script = [
    `$process = Get-Process -Id ${pid} -ErrorAction SilentlyContinue`,
    `if ($process) { $process.WaitForExit() }`,
    'Start-Sleep -Milliseconds 750',
    `Start-Process -FilePath '${quotedPath}' -ArgumentList @('--updated','/S','--force-run') -WindowStyle Hidden`,
  ].join('; ');
  return {
    executable: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
  };
}
