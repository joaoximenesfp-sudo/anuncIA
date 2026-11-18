package br.com.anuncia.tela;

import android.content.Context;
import android.content.SharedPreferences;

/** O que o app lembra entre uma abertura e outra (sobrevive a reinício do tablet). */
final class Estado {
    private Estado() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences("tela", Context.MODE_PRIVATE);
    }

    /** Modo carro: o app se fixa, volta sozinho e reacende a tela. Só o PIN do tablet desliga. */
    static boolean modoCarro(Context c) { return p(c).getBoolean("modoCarro", false); }
    static void modoCarro(Context c, boolean v) { p(c).edit().putBoolean("modoCarro", v).apply(); }

    /** Passou pela configuração (tocou em "Pronto") pelo menos uma vez. */
    static boolean configurado(Context c) { return p(c).getBoolean("configurado", false); }
    static void configurado(Context c, boolean v) { p(c).edit().putBoolean("configurado", v).apply(); }

    /** Já ficou fixado desde que o modo carro ligou: se deixar de estar, foi o PIN que soltou. */
    static boolean estavaFixado(Context c) { return p(c).getBoolean("estavaFixado", false); }
    static void estavaFixado(Context c, boolean v) { p(c).edit().putBoolean("estavaFixado", v).apply(); }
}
