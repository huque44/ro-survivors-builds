package com.huque44.rosurvivors;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * App "casca": a interface fica em assets/www (HTML/JS) e esta Activity
 * oferece ao JS uma ponte "Native" para:
 *  - httpGet: baixar páginas/arquivos sem bloqueio de CORS
 *  - render: abrir uma página num WebView oculto, esperar o JS dela montar
 *            o conteúdo e devolver o texto/HTML final (usado na página de talentos)
 *  - openUrl / share: abrir links no navegador e compartilhar texto
 */
public class MainActivity extends Activity {

    private static final String UA =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 ROBuilds";

    private static final String EXTRACT_JS =
            "(function(){try{" +
            "var res=[];try{res=performance.getEntriesByType('resource').map(function(e){return e.name});}catch(x){}" +
            "return JSON.stringify({title:document.title," +
            "text:document.body?document.body.innerText:''," +
            "html:document.documentElement.outerHTML.slice(0,600000)," +
            "resources:res});" +
            "}catch(e){return JSON.stringify({error:String(e)})}})()";

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    private void configure(WebView w, boolean localFiles) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(localFiles);
        s.setUserAgentString(UA);
        s.setMediaPlaybackRequiresUserGesture(true);
    }

    @SuppressLint("AddJavascriptInterface")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#14111C"));
        getWindow().setNavigationBarColor(Color.parseColor("#14111C"));

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#14111C"));

        web = new WebView(this);
        configure(web, true);
        web.setBackgroundColor(Color.parseColor("#14111C"));
        web.addJavascriptInterface(new Bridge(), "Native");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String u = request.getUrl().toString();
                if (u.startsWith("file:")) return false;
                openExternal(u);
                return true;
            }
        });

        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl("file:///android_asset/www/index.html");
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        // Deixa o JS decidir (fechar janela, voltar de aba); se não tratar, sai do app
        web.evaluateJavascript("(window.__onBack && window.__onBack()) ? 'yes' : 'no'", value -> {
            if (value == null || !value.contains("yes")) finish();
        });
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
        }
    }

    private void callbackString(String id, boolean ok, String data) {
        final String js = "window.__nativeCb(" + JSONObject.quote(id) + "," + ok + ","
                + JSONObject.quote(data == null ? "" : data) + ")";
        ui.post(() -> web.evaluateJavascript(js, null));
    }

    /** value já é um literal JSON vindo do evaluateJavascript */
    private void callbackRaw(String id, String jsonLiteral) {
        final String js = "window.__nativeCb(" + JSONObject.quote(id) + ",true,"
                + (jsonLiteral == null ? "null" : jsonLiteral) + ")";
        ui.post(() -> web.evaluateJavascript(js, null));
    }

    private static String download(String url) throws Exception {
        String current = url;
        for (int i = 0; i < 5; i++) {
            HttpURLConnection c = (HttpURLConnection) new URL(current).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Accept", "*/*");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && c.getHeaderField("Location") != null) {
                current = new URL(new URL(current), c.getHeaderField("Location")).toString();
                c.disconnect();
                continue;
            }
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            if (in != null) {
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
            }
            c.disconnect();
            if (code >= 400) throw new Exception("HTTP " + code);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
        throw new Exception("Redirecionamentos demais");
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void renderPage(final String id, final String url, final int waitMs) {
        final WebView w = new WebView(this);
        configure(w, false);
        final boolean[] finished = {false};
        final boolean[] answered = {false};

        final Runnable cleanup = () -> {
            try {
                root.removeView(w);
                w.destroy();
            } catch (Exception ignored) {
            }
        };

        w.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String u) {
                if (finished[0]) return;
                finished[0] = true;
                ui.postDelayed(() -> view.evaluateJavascript(EXTRACT_JS, value -> {
                    if (answered[0]) return;
                    answered[0] = true;
                    callbackRaw(id, value);
                    cleanup.run();
                }), Math.max(500, waitMs));
            }
        });

        // Fica atrás da interface principal (precisa de tamanho real para o layout/innerText funcionar)
        root.addView(w, 0, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        w.loadUrl(url);

        ui.postDelayed(() -> {
            if (answered[0]) return;
            answered[0] = true;
            callbackString(id, false, "Tempo esgotado ao carregar a página");
            cleanup.run();
        }, 45000);
    }

    private class Bridge {
        @JavascriptInterface
        public void httpGet(final String id, final String url) {
            new Thread(() -> {
                try {
                    callbackString(id, true, download(url));
                } catch (Exception e) {
                    callbackString(id, false, String.valueOf(e.getMessage()));
                }
            }).start();
        }

        @JavascriptInterface
        public void render(final String id, final String url, final int waitMs) {
            ui.post(() -> renderPage(id, url, waitMs));
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            ui.post(() -> openExternal(url));
        }

        @JavascriptInterface
        public void share(final String text) {
            ui.post(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Compartilhar"));
            });
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "?";
            }
        }
    }
}
