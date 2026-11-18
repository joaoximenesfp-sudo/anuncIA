package br.com.anuncia.tela;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.KeyguardManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/**
 * O player da web (anunc-ia.vercel.app/tela/) em tela cheia, com a trava do carro:
 * Voltar não faz nada, o app se fixa (só o PIN do tablet solta), aparece por cima da
 * tela de bloqueio e o Vigia traz de volta se alguém tirar da frente.
 */
public class MainActivity extends Activity {
    static final String SITE = "https://anunc-ia.vercel.app/tela/";
    static final String HOST = "anunc-ia.vercel.app";
    private static final int PEDIR_PIN = 7;

    /** Lido pelo Vigia: modo carro ligado e app fora da frente = trazer de volta. */
    static volatile boolean visivel = false;
    /** Saindo de propósito, depois do PIN: o Vigia não traz de volta. */
    static volatile boolean saindo = false;

    private final Handler h = new Handler(Looper.getMainLooper());
    private WebView web;
    private long ultimoPedido = 0;

    @Override
    protected void onCreate(Bundle salvo) {
        super.onCreate(salvo);
        if (Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        criarWeb();
        web.loadUrl(endereco(getIntent()));
        Vigia.ligar(this);
        tratar(getIntent());
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void criarWeb() {
        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                // só o nosso site abre aqui dentro; qualquer outro endereço é ignorado
                return !HOST.equals(r.getUrl().getHost());
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                // primeira vez sem internet (nada guardado ainda): tenta de novo daqui a pouco
                if (r.isForMainFrame()) h.postDelayed(() -> { if (web != null) web.reload(); }, 15000);
            }

            @Override
            public boolean onRenderProcessGone(WebView v, RenderProcessGoneDetail d) {
                // o motor da página caiu: recria a tela e segue tocando
                ViewGroup pai = (ViewGroup) v.getParent();
                if (pai != null) pai.removeView(v);
                v.destroy();
                criarWeb();
                web.loadUrl(SITE);
                return true;
            }
        });
        web.addJavascriptInterface(new Ponte(), "TelaAndroid");
        setContentView(web);
    }

    /** Link de pareamento do painel (…/tela/#parear=…) ou a tela normal. */
    private String endereco(Intent i) {
        Uri u = i != null ? i.getData() : null;
        if (u != null && "https".equals(u.getScheme()) && HOST.equals(u.getHost()) && "/tela/".equals(u.getPath())) return u.toString();
        return SITE;
    }

    /** Abrir pelo ícone (depois de configurado) ou pedir a trava liga o modo carro. */
    private void tratar(Intent i) {
        boolean pediuTrava = i != null && i.getBooleanExtra("travar", false);
        boolean peloIcone = i != null && Intent.ACTION_MAIN.equals(i.getAction());
        if (pediuTrava || (peloIcone && Estado.configurado(this))) {
            Estado.configurado(this, true);
            Estado.modoCarro(this, true);
            ultimoPedido = 0;
        }
        if (Estado.modoCarro(this)) travar();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        if (i.getData() != null) web.loadUrl(endereco(i));
        tratar(i);
    }

    /** Fixa o app. No modo frota é na hora; no tablet comum o Android pergunta uma vez ("Fixar app?"). */
    void travar() {
        saindo = false;
        if (Dono.eh(this)) Dono.travar(this);
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) return;
        long agora = System.currentTimeMillis();
        if (agora - ultimoPedido < 4000) return; // não empilha pedido em cima do aviso do Android
        ultimoPedido = agora;
        try {
            startLockTask();
        } catch (Exception e) {
            // fixação de aplicativos desligada nas configurações: o Vigia ainda traz o app de volta
        }
    }

    /** Sair do modo carro: só com o PIN do próprio tablet. */
    void pedirPin() {
        KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        @SuppressWarnings("deprecation")
        Intent i = km.createConfirmDeviceCredentialIntent("Sair do modo carro", "Digite o PIN do tablet");
        if (i == null) { // tablet sem PIN: não tem o que pedir
            liberar();
            return;
        }
        if (Dono.eh(this)) {
            ComponentName alvo = i.resolveActivity(getPackageManager());
            if (alvo != null) Dono.permitirTambem(this, alvo.getPackageName());
        }
        try {
            startActivityForResult(i, PEDIR_PIN);
        } catch (Exception e) {
            if (Dono.eh(this)) Dono.travar(this);
        }
    }

    @Override
    protected void onActivityResult(int pedido, int resultado, Intent dados) {
        super.onActivityResult(pedido, resultado, dados);
        if (pedido != PEDIR_PIN) return;
        if (resultado == RESULT_OK) liberar();
        else if (Dono.eh(this)) Dono.travar(this); // volta a deixar só o app
    }

    private void liberar() {
        saindo = true;
        Estado.modoCarro(this, false);
        Estado.estavaFixado(this, false);
        if (Dono.eh(this)) Dono.liberar(this);
        try {
            stopLockTask();
        } catch (Exception e) {
            // já estava solto
        }
        moveTaskToBack(true);
    }

    @Override
    protected void onResume() {
        super.onResume();
        visivel = true;
        esconderBarras();
        if (Estado.modoCarro(this)) travar();
    }

    @Override
    protected void onPause() {
        visivel = false;
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        visivel = false;
        if (web != null) web.destroy();
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean foco) {
        super.onWindowFocusChanged(foco);
        if (foco) esconderBarras();
    }

    @SuppressWarnings("deprecation")
    private void esconderBarras() {
        View d = getWindow().getDecorView();
        d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    /** Voltar e volume não fazem nada aqui dentro. */
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        switch (e.getKeyCode()) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_VOLUME_UP:
            case KeyEvent.KEYCODE_VOLUME_DOWN:
            case KeyEvent.KEYCODE_VOLUME_MUTE:
                return true;
            default:
                return super.dispatchKeyEvent(e);
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        // Voltar não sai da tela
    }

    private void abrirAjuste(String qual) {
        Intent i;
        switch (qual) {
            case "sobreposicao":
                i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
                break;
            case "bateria":
                i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()));
                break;
            case "seguranca":
                i = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                break;
            case "wifi":
                i = new Intent(Settings.ACTION_WIFI_SETTINGS);
                break;
            default:
                return;
        }
        try {
            startActivity(i);
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_SETTINGS)); } catch (Exception ignorado) { /* sem ajustes */ }
        }
    }

    /** O que a página (tela.js) enxerga como window.TelaAndroid. */
    private class Ponte {
        @JavascriptInterface
        public String estado() {
            try {
                ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                JSONObject j = new JSONObject();
                j.put("app", getPackageManager().getPackageInfo(getPackageName(), 0).versionName);
                j.put("fixado", am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE);
                j.put("frota", Dono.eh(MainActivity.this));
                j.put("modoCarro", Estado.modoCarro(MainActivity.this));
                j.put("sobreposicao", Settings.canDrawOverlays(MainActivity.this));
                j.put("bateria", pm.isIgnoringBatteryOptimizations(getPackageName()));
                j.put("pin", km.isDeviceSecure());
                return j.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void travar() {
            runOnUiThread(() -> {
                Estado.configurado(MainActivity.this, true);
                Estado.modoCarro(MainActivity.this, true);
                ultimoPedido = 0;
                MainActivity.this.travar();
            });
        }

        @JavascriptInterface
        public void sair() {
            runOnUiThread(MainActivity.this::pedirPin);
        }

        @JavascriptInterface
        public void abrir(String qual) {
            runOnUiThread(() -> abrirAjuste(qual == null ? "" : qual));
        }
    }
}
