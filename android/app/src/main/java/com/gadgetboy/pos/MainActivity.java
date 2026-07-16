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
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import com.getcapacitor.BridgeActivity;

import androidx.core.content.FileProvider;

import java.io.File;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new GBPosAndroidBridge(), "GBPosAndroid");
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
                            installDownloadedApk(apkFile);
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
            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(installIntent);
        } catch (Exception e) {
            Toast.makeText(this, "Open the downloaded APK to finish updating.", Toast.LENGTH_LONG).show();
        }
    }
}
