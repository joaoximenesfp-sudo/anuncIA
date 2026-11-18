package br.com.anuncia.tela;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Tablet ligou (ou o app foi atualizado): se o modo carro estava ligado, o Vigia traz a tela de volta. */
public class Inicio extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (Estado.modoCarro(c)) Vigia.ligar(c);
    }
}
