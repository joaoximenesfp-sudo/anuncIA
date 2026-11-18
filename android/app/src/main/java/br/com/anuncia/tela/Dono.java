package br.com.anuncia.tela;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.BatteryManager;
import android.os.Build;
import android.provider.Settings;

/**
 * Modo frota: quando o app é o dono do tablet (provisionado na configuração de fábrica),
 * trava sem perguntar nada: sem barra de notificação, sem Home, sem Recentes, sem menu do
 * botão Liga/Desliga, tela sempre acesa no carregador e o app vira a tela inicial.
 */
final class Dono {
    private Dono() {}

    static boolean eh(Context c) {
        DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
        return dpm != null && dpm.isDeviceOwnerApp(c.getPackageName());
    }

    static void travar(Context c) {
        DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
        ComponentName admin = new ComponentName(c, Admin.class);
        dpm.setLockTaskPackages(admin, new String[]{c.getPackageName()});
        if (Build.VERSION.SDK_INT >= 28) dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE);
        dpm.setStatusBarDisabled(admin, true);
        dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, String.valueOf(
            BatteryManager.BATTERY_PLUGGED_AC | BatteryManager.BATTERY_PLUGGED_USB | BatteryManager.BATTERY_PLUGGED_WIRELESS));
        ComponentName inicial = new ComponentName(c.getPackageName(), c.getPackageName() + ".Inicial");
        c.getPackageManager().setComponentEnabledSetting(inicial, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
        IntentFilter f = new IntentFilter(Intent.ACTION_MAIN);
        f.addCategory(Intent.CATEGORY_HOME);
        f.addCategory(Intent.CATEGORY_DEFAULT);
        dpm.addPersistentPreferredActivity(admin, f, inicial);
    }

    /** Deixa o app de tela do PIN do Android abrir por cima da trava, só enquanto pede o PIN. */
    static void permitirTambem(Context c, String pacote) {
        DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
        dpm.setLockTaskPackages(new ComponentName(c, Admin.class), new String[]{c.getPackageName(), pacote});
    }

    static void liberar(Context c) {
        DevicePolicyManager dpm = (DevicePolicyManager) c.getSystemService(Context.DEVICE_POLICY_SERVICE);
        ComponentName admin = new ComponentName(c, Admin.class);
        dpm.clearPackagePersistentPreferredActivities(admin, c.getPackageName());
        c.getPackageManager().setComponentEnabledSetting(new ComponentName(c.getPackageName(), c.getPackageName() + ".Inicial"),
            PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        dpm.setStatusBarDisabled(admin, false);
        dpm.setGlobalSetting(admin, Settings.Global.STAY_ON_WHILE_PLUGGED_IN, "0");
    }
}
