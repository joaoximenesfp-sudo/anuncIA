package br.com.anuncia.tela;

import android.app.admin.DeviceAdminReceiver;

/** Só existe para o app poder ser o "dono" do tablet no modo frota (provisionado de fábrica). */
public class Admin extends DeviceAdminReceiver {
}
