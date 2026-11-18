package br.com.anuncia.tela;

import android.app.ActivityManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

/**
 * Fica de olho enquanto o modo carro está ligado:
 *  - apertaram o Liga/Desliga com o carregador ligado: acende a tela de novo, com o app por cima;
 *  - alguém tirou o app da frente (sem o PIN): traz de volta em até 3 segundos;
 *  - o app deixou de estar fixado sem ser pelo próprio app: foi o PIN do tablet, então respeita.
 */
public class Vigia extends Service {
    private static final String CANAL = "tela";
    private final Handler h = new Handler(Looper.getMainLooper());

    private final BroadcastReceiver apagou = new BroadcastReceiver() {
        @Override
        public void onReceive(Context c, Intent i) {
            boolean modo = Estado.modoCarro(c), carga = carregando();
            Log.i(MainActivity.TAG, "tela apagou: modoCarro=" + modo + " carregando=" + carga);
            if (modo && carga) {
                h.postDelayed(Vigia.this::acender, 400);
                h.postDelayed(Vigia.this::acender, 1500); // segunda tentativa, se a primeira não pegou
            }
        }
    };

    private final Runnable ronda = new Runnable() {
        @Override
        public void run() {
            verificar();
            h.postDelayed(this, 3000);
        }
    };

    static void ligar(Context c) {
        Intent i = new Intent(c, Vigia.class);
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception e) {
            // sem permissão para subir agora: o app tenta de novo na próxima abertura
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CANAL, "Tela do carro", NotificationManager.IMPORTANCE_MIN));
            b = new Notification.Builder(this, CANAL);
        } else {
            b = new Notification.Builder(this);
        }
        startForeground(1, b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Tela do carro ligada").setOngoing(true).build());
        registerReceiver(apagou, new IntentFilter(Intent.ACTION_SCREEN_OFF));
        h.post(ronda);
    }

    @Override
    public int onStartCommand(Intent i, int flags, int id) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent i) {
        return null;
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(apagou); } catch (Exception e) { /* já saiu */ }
        h.removeCallbacksAndMessages(null);
        super.onDestroy();
    }

    private boolean carregando() {
        Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        return b != null && b.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0;
    }

    @SuppressWarnings("deprecation")
    private void acender() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm.isInteractive()) return;
        PowerManager.WakeLock wl = pm.newWakeLock(PowerManager.FULL_WAKE_LOCK
            | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE, "tela:acender");
        wl.acquire(3000);
        trazer();
        Log.i(MainActivity.TAG, "acender: tela ligada agora? " + pm.isInteractive());
    }

    private void verificar() {
        ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        boolean fixado = am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE;
        if (fixado) {
            if (!Estado.estavaFixado(this)) Estado.estavaFixado(this, true);
        } else if (Estado.estavaFixado(this) && Estado.modoCarro(this) && !MainActivity.saindo) {
            // estava fixado e não está mais, sem ter sido o app: soltaram com o PIN do tablet
            Log.i(MainActivity.TAG, "soltaram com o PIN: modo carro desligado");
            Estado.modoCarro(this, false);
            Estado.estavaFixado(this, false);
        }
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (Estado.modoCarro(this) && !MainActivity.visivel && pm.isInteractive()) trazer();
    }

    private void trazer() {
        Intent i = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try {
            startActivity(i);
            Log.i(MainActivity.TAG, "trazer: app de volta para a frente");
        } catch (Exception e) {
            // sem "Exibir sobre outros apps": o Android não deixa trazer de volta
            Log.w(MainActivity.TAG, "trazer: o Android não deixou", e);
        }
    }
}
