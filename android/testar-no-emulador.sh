#!/usr/bin/env bash
# Testa a trava do app "Tela do carro" num tablet virtual (roda no GitHub Actions).
# uso: bash android/testar-no-emulador.sh <apk> <pasta das fotos>
set -u
APK="$1"; SAIDA="${2:-telas}"; mkdir -p "$SAIDA"
PKG=br.com.anuncia.tela
falhas=0
ok() { if eval "$1"; then echo "  ok  $2"; else echo "  FALHOU  $2"; falhas=$((falhas+1)); fi; }
topo() { adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity'; }
trava() { adb shell dumpsys activity | grep -m1 -o 'mLockTaskModeState=[A-Z]*' | cut -d= -f2 | tr -d '\r'; }
na_frente() { topo | grep -q "$PKG/"; }
foto() { adb exec-out screencap -p > "$SAIDA/$1.png"; }
acordado() { adb shell dumpsys power | grep -q 'mWakefulness=Awake'; }
# toca no botão de um diálogo do Android cujo texto ou id bate com o padrão
tocar() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml /tmp/ui.xml >/dev/null 2>&1 || return 1
  python3 - "$1" <<'PY'
import re, subprocess, sys
padrao = re.compile(sys.argv[1], re.I)
xml = open('/tmp/ui.xml', encoding='utf-8', errors='ignore').read()
for no in re.findall(r'<node [^>]*>', xml):
    txt = (re.search(r' text="([^"]*)"', no) or [None, ''])[1]
    rid = (re.search(r' resource-id="([^"]*)"', no) or [None, ''])[1]
    b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', no)
    if b and (padrao.search(txt) or padrao.search(rid)):
        x1, y1, x2, y2 = map(int, b.groups())
        subprocess.run(['adb', 'shell', 'input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2)])
        print('    tocou em:', txt or rid)
        sys.exit(0)
print('    nenhum botão com', sys.argv[1])
sys.exit(1)
PY
}
OK_FIXAR='screen_pinning_ok|^(got it|ok|entendi|iniciar)$'
NAO_FIXAR='screen_pinning_cancel|^(no thanks|não, obrigado|cancelar)$'

echo "== preparar"
adb install -r "$APK" || exit 1
adb shell settings put system lock_to_app_enabled 1
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow
adb shell dumpsys deviceidle whitelist +$PKG >/dev/null
adb shell dumpsys battery set ac 1
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard

echo "== abrir"
adb shell am start -W -n $PKG/.MainActivity >/dev/null
sleep 15
foto 1-abriu
ok na_frente "o app abre na frente"

echo "== modo carro num tablet comum (o Android pergunta se pode fixar)"
adb shell am start -n $PKG/.MainActivity --ez travar true >/dev/null
sleep 3
foto 2-pergunta-fixar
tocar "$OK_FIXAR"
sleep 3
ok '[ "$(trava)" = PINNED ]' "fixou o app"
for k in 4:Voltar 3:Home 187:Recentes; do
  adb shell input keyevent "${k%%:*}"; sleep 2
  ok na_frente "${k#*:} não tira o app da frente"
done

echo "== botão Liga/Desliga"
adb shell input keyevent 26; sleep 5
ok acordado "no carregador, apertar Liga/Desliga: a tela acende de novo sozinha"
ok na_frente "e o app continua na frente, fixado"
foto 3-depois-do-liga-desliga
adb shell dumpsys battery set ac 0
adb shell input keyevent 26; sleep 5
ok '! acordado' "fora do carregador o Liga/Desliga apaga normal"
adb shell dumpsys battery set ac 1
adb shell input keyevent KEYCODE_WAKEUP; sleep 3

echo "== soltar com o PIN (como o Voltar + Recentes) e respeitar"
adb shell am task lock stop; sleep 6
ok '[ "$(trava)" = NONE ]' "soltou"
adb shell input keyevent 3; sleep 6
ok '! na_frente' "solto pelo PIN, o app não volta sozinho"

echo "== saiu sem fixar: volta sozinho"
adb shell am start -n $PKG/.MainActivity --ez travar true >/dev/null; sleep 3
tocar "$NAO_FIXAR" || adb shell input keyevent 4
sleep 2
adb shell input keyevent 3; sleep 8
ok na_frente "tirou o app da frente e ele voltou sozinho"
foto 4-voltou-sozinho
tocar "$NAO_FIXAR" || true

echo "== modo frota (app dono do tablet, sem perguntar nada)"
adb shell dpm set-device-owner $PKG/.Admin
adb shell am start -n $PKG/.MainActivity --ez travar true >/dev/null; sleep 5
ok '[ "$(trava)" = LOCKED ]' "travou sem perguntar"
adb shell input keyevent 3; sleep 2
ok na_frente "Home não sai"
adb shell input keyevent 187; sleep 2
ok na_frente "Recentes não sai"
foto 5-frota

echo "== reinicia o tablet"
adb reboot
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 3; done
sleep 30
adb shell dumpsys battery set ac 1
foto 6-depois-de-reiniciar
ok na_frente "depois de reiniciar, o app abre sozinho"
ok '[ "$(trava)" = LOCKED ]' "e já travado"

echo
if [ "$falhas" = 0 ]; then echo "tudo verde"; else echo "$falhas FALHA(S)"; fi
exit "$falhas"
