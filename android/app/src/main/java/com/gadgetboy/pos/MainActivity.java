package com.gadgetboy.pos;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private File pendingUpdateApk;
    private final ExecutorService backgroundExecutor = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new GBPosAndroidBridge(), "GBPosAndroid");
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (pendingUpdateApk != null && canInstallPackages()) {
            File apkFile = pendingUpdateApk;
            pendingUpdateApk = null;
            installDownloadedApk(apkFile);
        }
    }

    public class GBPosAndroidBridge {
        @JavascriptInterface
        public void openExternalUrl(String rawUrl) {
            MainActivity.this.runOnUiThread(() -> {
                try {
                    Uri uri = Uri.parse(rawUrl);
                    Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception ignored) {
                    // The React update prompt keeps fallback links available.
                }
            });
        }

        @JavascriptInterface
        public void downloadAndInstallApk(String rawUrl, String rawFileName) {
            MainActivity.this.runOnUiThread(() -> {
                try {
                    String safeUrl = rawUrl == null ? "" : rawUrl.trim();
                    if (!safeUrl.toLowerCase(Locale.US).startsWith("https://")) return;

                    String fileName = sanitizeApkFileName(rawFileName);
                    File downloadDir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                    if (downloadDir == null) {
                        openExternalUrl(safeUrl);
                        return;
                    }
                    if (!downloadDir.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        downloadDir.mkdirs();
                    }
                    File apkFile = new File(downloadDir, fileName);
                    if (apkFile.exists()) {
                        //noinspection ResultOfMethodCallIgnored
                        apkFile.delete();
                    }

                    DownloadManager.Request request = new DownloadManager.Request(Uri.parse(safeUrl));
                    request.setTitle("GadgetBoy POS update");
                    request.setDescription(fileName);
                    request.setMimeType("application/vnd.android.package-archive");
                    request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    request.setDestinationUri(Uri.fromFile(apkFile));

                    DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                    if (manager == null) {
                        openExternalUrl(safeUrl);
                        return;
                    }

                    long downloadId = manager.enqueue(request);
                    Toast.makeText(MainActivity.this, "Downloading GadgetBoy POS update...", Toast.LENGTH_LONG).show();

                    BroadcastReceiver receiver = new BroadcastReceiver() {
                        @Override
                        public void onReceive(Context context, Intent intent) {
                            long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                            if (completedId != downloadId) return;
                            try {
                                unregisterReceiver(this);
                            } catch (Exception ignored) {}
                            if (canInstallPackages()) {
                                installDownloadedApk(apkFile);
                            } else {
                                pendingUpdateApk = apkFile;
                                requestInstallPermission();
                            }
                        }
                    };

                    IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
                    } else {
                        registerReceiver(receiver, filter);
                    }
                } catch (Exception ignored) {
                    openExternalUrl(rawUrl);
                }
            });
        }

        @JavascriptInterface
        public void verifyModelSha256(String rawPath, String expectedHash, String callbackId) {
            backgroundExecutor.execute(() -> {
                String filePath = rawPath == null ? "" : rawPath.replaceFirst("^file://", "");
                File file = new File(filePath);
                boolean valid = false;
                String error = "";
                try (FileInputStream input = new FileInputStream(file)) {
                    MessageDigest digest = MessageDigest.getInstance("SHA-256");
                    byte[] buffer = new byte[1024 * 1024];
                    int count;
                    while ((count = input.read(buffer)) > 0) digest.update(buffer, 0, count);
                    StringBuilder actual = new StringBuilder();
                    for (byte value : digest.digest()) actual.append(String.format(Locale.US, "%02x", value));
                    valid = actual.toString().equalsIgnoreCase(expectedHash == null ? "" : expectedHash.trim());
                    if (!valid) {
                        error = "The downloaded model failed its security check.";
                        //noinspection ResultOfMethodCallIgnored
                        file.delete();
                    }
                } catch (Exception exception) {
                    error = exception.getMessage() == null ? "Model verification failed." : exception.getMessage();
                }
                final String script = "window.dispatchEvent(new CustomEvent('gbpos-gidget-model-verified',{detail:{id:"
                    + JSONObject.quote(callbackId == null ? "" : callbackId) + ",valid:" + valid + ",error:"
                    + JSONObject.quote(error) + "}}));";
                MainActivity.this.runOnUiThread(() -> {
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(script, null);
                    }
                });
            });
        }
    }

    private boolean canInstallPackages() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getPackageManager().canRequestPackageInstalls();
    }

    private void requestInstallPermission() {
        try {
            Toast.makeText(this, "Allow GadgetBoy POS to install updates, then return to the app.", Toast.LENGTH_LONG).show();
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getPackageName()));
            startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(this, "Enable Install unknown apps for GadgetBoy POS in Android Settings.", Toast.LENGTH_LONG).show();
        }
    }

    private String sanitizeApkFileName(String rawFileName) {
        String fallback = "GadgetBoy-POS-Update.apk";
        String value = rawFileName == null ? fallback : rawFileName.trim();
        value = value.replaceAll("[^A-Za-z0-9._-]", "-");
        if (!value.toLowerCase(Locale.US).endsWith(".apk")) {
            value = fallback;
        }
        return value.isEmpty() ? fallback : value;
    }

    private void installDownloadedApk(File apkFile) {
        try {
            if (apkFile == null || !apkFile.exists()) {
                Toast.makeText(this, "Update download did not finish.", Toast.LENGTH_LONG).show();
                return;
            }
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", apkFile);
            Intent installIntent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
            installIntent.setData(apkUri);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true);
            startActivity(installIntent);
        } catch (Exception e) {
            Toast.makeText(this, "Open the downloaded APK to finish updating.", Toast.LENGTH_LONG).show();
        }
    }
}
