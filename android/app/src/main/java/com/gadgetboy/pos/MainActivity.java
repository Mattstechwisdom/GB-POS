package com.gadgetboy.pos;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

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
    }
}
