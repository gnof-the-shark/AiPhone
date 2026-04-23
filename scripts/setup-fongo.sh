#!/usr/bin/env bash
# =============================================================================
#  setup-fongo.sh — installe un émulateur Android avec Fongo pour AiPhone
# =============================================================================
#
#  Ce script configure tout ce dont tu as besoin pour faire tourner Fongo dans
#  un émulateur Android sur une machine Linux (Ubuntu/Debian recommandé).
#
#  Étapes automatiques :
#    1. Vérifie / installe Java 17
#    2. Télécharge Android command-line tools
#    3. Accepte les licences SDK
#    4. Installe emulator + system image Android 33
#    5. Crée un AVD (fongo-phone)
#    6. Lance l'émulateur en arrière-plan
#    7. Attend le boot complet
#    8. Installe l'APK Fongo (fourni ou téléchargé)
#
#  Étapes manuelles (après ce script) :
#    → Ouvrir Fongo dans l'émulateur
#    → Créer / se connecter à un compte Fongo
#    → Configurer Fongo comme appli SMS par défaut
#    → Activer les notifications Fongo
#    → Mettre à jour .env avec ALLOWED_NUMBERS=<ton_numero_fongo>
#
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

ANDROID_HOME="${ANDROID_HOME:-$HOME/android-sdk}"
AVD_NAME="fongo-phone"
API_LEVEL="33"
ABI="x86_64"
SYSTEM_IMAGE="system-images;android-${API_LEVEL};google_apis;${ABI}"
CMDLINE_TOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
FONGO_APK="${1:-}"   # optionnel : passer le chemin de l'APK en argument

export ANDROID_HOME
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║         AiPhone — Setup Fongo Android VM         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. Java ───────────────────────────────────────────────────────────────────

echo "▶ Vérification de Java..."
if ! command -v java &>/dev/null; then
  echo "  Java non trouvé — installation de OpenJDK 17..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq openjdk-17-jdk
fi
java -version 2>&1 | head -1
echo ""

# ── 2. Android command-line tools ────────────────────────────────────────────

echo "▶ Android SDK → $ANDROID_HOME"
if [ ! -d "$ANDROID_HOME/cmdline-tools/latest/bin" ]; then
  echo "  Téléchargement des Android command-line tools..."
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  TMP_ZIP=$(mktemp /tmp/cmdline-tools-XXXX.zip)
  curl -fsSL "$CMDLINE_TOOLS_URL" -o "$TMP_ZIP"
  unzip -q "$TMP_ZIP" -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest" 2>/dev/null || true
  rm -f "$TMP_ZIP"
  echo "  ✓ Android command-line tools installés"
else
  echo "  ✓ Android command-line tools déjà présents"
fi
echo ""

# ── 3. Licences + packages SDK ───────────────────────────────────────────────

echo "▶ Acceptation des licences SDK..."
yes | sdkmanager --licenses >/dev/null 2>&1 || true

echo "▶ Installation des packages SDK (peut prendre quelques minutes)..."
sdkmanager --install \
  "platform-tools" \
  "emulator" \
  "platforms;android-${API_LEVEL}" \
  "$SYSTEM_IMAGE" \
  2>&1 | grep -v "^Done\|Fetch\|Install\|\[=" || true
echo "  ✓ Packages installés"
echo ""

# ── 4. AVD ────────────────────────────────────────────────────────────────────

echo "▶ Création du AVD « $AVD_NAME »..."
if avdmanager list avd 2>/dev/null | grep -q "Name: $AVD_NAME"; then
  echo "  ✓ AVD déjà existant"
else
  echo "no" | avdmanager create avd \
    --name "$AVD_NAME" \
    --package "$SYSTEM_IMAGE" \
    --device "pixel_4" \
    --force 2>&1 | tail -5
  echo "  ✓ AVD créé"
fi
echo ""

# ── 5. Lancer l'émulateur ─────────────────────────────────────────────────────

echo "▶ Démarrage de l'émulateur en arrière-plan..."
nohup emulator -avd "$AVD_NAME" \
  -no-audio \
  -no-window \
  -gpu swiftshader_indirect \
  -no-snapshot \
  > /tmp/emulator.log 2>&1 &

EMULATOR_PID=$!
echo "  PID émulateur : $EMULATOR_PID"
echo ""

# ── 6. Attendre le boot ───────────────────────────────────────────────────────

echo "▶ Attente du démarrage Android (peut prendre 2-5 min)..."
TIMEOUT=300
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS=$(adb -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null || echo "0")
  if [ "$STATUS" = "1" ]; then
    echo "  ✓ Android démarré !"
    break
  fi
  printf "  ... %ds\r" $ELAPSED
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo "  ✗ Timeout — l'émulateur ne répond pas. Consulte /tmp/emulator.log"
  exit 1
fi
echo ""

# ── 7. Installer Fongo ────────────────────────────────────────────────────────

echo "▶ Installation de Fongo..."

if [ -n "$FONGO_APK" ] && [ -f "$FONGO_APK" ]; then
  echo "  Utilisation de l'APK fourni : $FONGO_APK"
  adb -s emulator-5554 install -r "$FONGO_APK"
  echo "  ✓ Fongo installé"
else
  echo ""
  echo "  ┌──────────────────────────────────────────────────────────┐"
  echo "  │  APK Fongo non fourni.  Pour l'installer manuellement :  │"
  echo "  │                                                          │"
  echo "  │  1. Télécharge l'APK depuis apkmirror.com                │"
  echo "  │     (cherche « Fongo » par Fongo Inc.)                   │"
  echo "  │                                                          │"
  echo "  │  2. Installe-le :                                        │"
  echo "  │     adb -s emulator-5554 install fongo.apk               │"
  echo "  │                                                          │"
  echo "  │  Ou relance ce script avec le chemin de l'APK :          │"
  echo "  │     ./scripts/setup-fongo.sh /chemin/vers/fongo.apk      │"
  echo "  └──────────────────────────────────────────────────────────┘"
fi

# ── 8. Instructions finales ───────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║               Étapes manuelles restantes                     ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Connecte-toi à l'émulateur visuellement :                   ║"
echo "║    scrcpy --serial emulator-5554                             ║"
echo "║  (installe scrcpy si besoin : sudo apt install scrcpy)       ║"
echo "║                                                              ║"
echo "║  Dans Fongo (emulateur) :                                    ║"
echo "║    1. Crée un compte Fongo (ou connecte-toi)                 ║"
echo "║    2. Note ton numéro Fongo (ex: +14381234567)               ║"
echo "║    3. Paramètres → Définir comme appli SMS par défaut         ║"
echo "║    4. Autoriser les notifications                            ║"
echo "║                                                              ║"
echo "║  Puis mets à jour ton .env :                                 ║"
echo "║    ALLOWED_NUMBERS=+14381234567   ← ton numéro Fongo         ║"
echo "║    GEMINI_API_KEY=ta_cle_gemini                              ║"
echo "║                                                              ║"
echo "║  Lance le serveur :                                          ║"
echo "║    node server.mjs                                           ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
