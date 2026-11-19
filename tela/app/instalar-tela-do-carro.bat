@echo off
rem Instala o app "Tela do carro" no tablet pelo cabo USB.
rem O Google bloqueia instalar app nao verificado pelo link, mas nao pelo computador.
rem Antes: no tablet, ligue Opcoes do desenvolvedor > Depuracao USB.
setlocal
cd /d "%~dp0"
title Instalar Tela do carro no tablet
echo.
echo [1/4] Baixando as ferramentas do Android (site do Google)...
if not exist "platform-tools\adb.exe" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://dl.google.com/android/repository/platform-tools-latest-windows.zip' -OutFile 'platform-tools.zip'; Expand-Archive -Force 'platform-tools.zip' '.'"
)
if not exist "platform-tools\adb.exe" (
  echo Nao consegui baixar as ferramentas. Confira a internet do computador e rode de novo.
  goto fim
)
echo [2/4] Baixando o app Tela do carro...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://anunc-ia.vercel.app/tela/app/tela-do-carro.apk' -OutFile 'tela-do-carro.apk'"
echo.
echo [3/4] Ligue o tablet neste computador pelo cabo USB.
echo       No tablet, toque em PERMITIR quando ele perguntar sobre depuracao USB.
echo       (esperando o tablet...)
"platform-tools\adb.exe" wait-for-device
echo [4/4] Instalando...
"platform-tools\adb.exe" install -r "tela-do-carro.apk"
if errorlevel 1 (
  echo.
  echo Nao deu certo. Tire um print desta janela e mande.
  goto fim
)
echo.
echo Pronto! No tablet, abra o app "Tela do carro".
:fim
echo.
pause
