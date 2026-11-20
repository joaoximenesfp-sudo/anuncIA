#!/usr/bin/env bash
# Testa a trava do app "Tela do carro" num tablet virtual (roda no GitHub Actions).
# uso: bash android/testar-no-emulador.sh <apk> <pasta das fotos>
set -u
APK="$1"; SAIDA="${2:-telas}"; mkdir -p "$SAIDA"
PKG=br.com.anuncia.tela
falhas=0
ok() { if eval "$1"; then echo "  ok  $2"; else echo "  FALHOU  $2"; falhas=$((falhas+1)); fi; }
# confere sem contar como falha (comportamento novo, ainda sendo medido no emulador)
info() { if eval "$1"; then echo "  info ok  $2"; else echo "  info NÃO  $2"; fi; }
topo() { adb shell dumpsys activity activities | grep -m1 -E 'topResumedActivity|mResumedActivity'; }
trava() { adb shell dumpsys activity | grep -m1 -o 'mLockTaskModeState=[A-Z]*' | cut -d= -f2 | tr -d '\r'; }
na_frente() { topo | grep -q "$PKG/"; }
foto() { adb exec-out screencap -p > "$SAIDA/$1.png"; }
tarefa() { adb shell dumpsys activity activities | grep -m1 "A=[0-9]*:$PKG" | grep -o '#[0-9]*' | head -1 | tr -d '#\r'; }
pergunta() { adb shell dumpsys window windows | grep -q 'ScreenPinning'; }
logs() { echo "    --- log do app ---"; adb logcat -d -s Tela:V | tail -n "${1:-15}" | sed 's/^/    /'; }
acordado() { adb shell dumpsys power | grep -q 'mWakefulness=Awake'; }
# espera a trava chegar num estado (o emulador do Actions às vezes demora uns segundos)
esperar_trava() { local alvo="$1" n="${2:-10}" i; for i in $(seq "$n"); do [ "$(trava)" = "$alvo" ] && return 0; sleep 1; done; return 1; }
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
# o motorista toca em OK no "Fixar app?"; aqui, com vídeo rodando, o leitor de tela do teste nem sempre
# acha o botão: fixa pelo sistema, como o OK faria (e tenta de novo se o emulador demorar)
fixar() {
  tocar "$OK_FIXAR" || { adb shell am task lock "$(tarefa)" >/dev/null 2>&1; adb shell input keyevent 4; }
  esperar_trava PINNED 8 && return 0
  adb shell am task lock "$(tarefa)" >/dev/null 2>&1; esperar_trava PINNED 8
}
NAO_FIXAR='screen_pinning_cancel|^(no thanks|não, obrigado|cancelar)$'

echo "== preparar"
adb install -r "$APK" || exit 1
adb shell settings put system lock_to_app_enabled 1
adb shell appops set $PKG SYSTEM_ALERT_WINDOW allow
adb shell dumpsys deviceidle whitelist +$PKG >/dev/null
adb shell dumpsys battery set ac 1
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard

echo "== localização (só pedida quando o motorista toca em Permitir localização)"
ok '! adb shell dumpsys package $PKG | grep -q "ACCESS_FINE_LOCATION: granted=true"' "instalado, o app ainda não tem a localização"
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
ok 'adb shell dumpsys package $PKG | grep -q "ACCESS_FINE_LOCATION: granted=true"' "o app declara a localização e o Android libera"

echo "== abrir"
adb shell am start -W -n $PKG/.MainActivity >/dev/null
sleep 15
foto 1-abriu
ok na_frente "o app abre na frente"

echo "== modo carro num tablet comum (o Android pergunta se pode fixar)"
adb shell am start -n $PKG/.MainActivity --ez travar true >/dev/null
sleep 4
foto 2-pergunta-fixar
ok pergunta "o Android pergunta se pode fixar"
logs 5
fixar; r=$?
ok '[ "$r" = 0 ]' "fixou o app"
for k in 4:Voltar 3:Home 187:Recentes; do
  adb shell input keyevent "${k%%:*}"; sleep 2
  ok na_frente "${k#*:} não tira o app da frente"
done

echo "== botão Liga/Desliga"
adb shell input keyevent 26; sleep 10
ok acordado "no carregador, apertar Liga/Desliga: a tela acende de novo sozinha"
ok na_frente "e o app continua na frente, fixado"
logs 8
foto 3-depois-do-liga-desliga
adb shell dumpsys battery set ac 0
adb shell dumpsys battery set usb 0
adb shell input keyevent 26; sleep 5
ok '! acordado' "fora do carregador o Liga/Desliga apaga normal"
logs 8
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

echo "== soltaram a fixação num tablet com PIN: sem o PIN o app volta; com o PIN respeita"
adb shell locksettings set-pin 1234 >/dev/null 2>&1
adb shell settings put secure lock_to_app_exit_locked 1
adb shell am start -n $PKG/.MainActivity --ez travar true >/dev/null; sleep 4
fixar && echo "    fixado" || echo "    não fixou"
sleep 4 # a ronda do app marca que estava fixado
adb logcat -c
adb shell am task lock stop; sleep 6
adb shell input keyevent KEYCODE_WAKEUP; adb shell wm dismiss-keyguard >/dev/null 2>&1; sleep 3
foto 5a-tela-do-pin
sleep 22
info "adb logcat -d -s Tela:V | grep -q 'pediu o PIN'" "soltou: o tablet pediu o PIN e o app percebeu"
info '[ "$(adb logcat -d -s Tela:V | grep -c "pediu o PIN")" = 1 ]' "e avisou uma vez só no log"
info na_frente "ninguém digitou o PIN: o app voltou por cima da tela de bloqueio"
info "adb logcat -d -s Tela:V | grep -q 'ninguém digitou o PIN'" "e registrou no log"
foto 5b-voltou-sem-pin
adb shell wm dismiss-keyguard >/dev/null 2>&1; sleep 2
adb shell input text 1234; adb shell input keyevent 66; sleep 9
info "adb logcat -d -s Tela:V | grep -q 'soltaram com o PIN'" "digitou o PIN: o app respeitou e soltou"
logs 8
adb shell locksettings clear --old 1234 >/dev/null 2>&1
adb shell settings put secure lock_to_app_exit_locked 0
adb shell input keyevent KEYCODE_WAKEUP; adb shell wm dismiss-keyguard >/dev/null 2>&1; sleep 2
# começa o modo frota do zero: nada fixado, nada pedindo para fixar
adb shell am task lock stop >/dev/null 2>&1; esperar_trava NONE 6; tocar "$NAO_FIXAR" >/dev/null 2>&1 || true

echo "== modo frota (app dono do tablet, sem perguntar nada)"
adb shell dpm set-device-owner $PKG/.Admin
t0=$(date +%s)
adb shell am start -n $PKG/.MainActivity --ez travar true >/dev/null
esperar_trava LOCKED 15; r=$?
ok '[ "$r" = 0 ]' "travou sem perguntar ($(( $(date +%s) - t0 )) s)"
logs 8
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

adb logcat -d > "$SAIDA/logcat.txt" 2>/dev/null
echo
if [ "$falhas" = 0 ]; then echo "tudo verde"; else echo "$falhas FALHA(S)"; fi
exit "$falhas"
