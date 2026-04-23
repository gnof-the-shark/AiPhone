# AiPhone

> **Conversations SMS avec Gemini — via Fongo dans un émulateur Android.**

AiPhone est un serveur Node.js qui fait tourner Fongo dans un émulateur Android
(AVD) et utilise ADB pour envoyer/recevoir des SMS.  Google Gemini gère les
conversations : il répond à tes messages **et** peut t'envoyer des messages de
sa propre initiative.

```
Ton téléphone ←── SMS ──→ Fongo (émulateur Android)
                               ↕ ADB
                          Node.js (AiPhone)
                               ↕ HTTPS
                          Google Gemini
```

---

## Prérequis

| Outil | Détails |
|---|---|
| **Node.js ≥ 22** | Utilise le test runner natif |
| **Linux x86_64** | L'émulateur Android nécessite KVM/HAXM |
| **Java 17+** | Requis par les Android tools |
| **8 Go de RAM** | L'émulateur est gourmand |
| **Compte Fongo** | Gratuit sur [fongo.com](https://www.fongo.com) — numéro canadien gratuit |
| **Clé API Gemini** | Gratuite sur [aistudio.google.com](https://aistudio.google.com) |

---

## Installation

### 1 — Cloner et installer les dépendances Node

```bash
git clone https://github.com/gnof-the-shark/AiPhone.git
cd AiPhone
npm install
```

### 2 — Installer l'émulateur Android + Fongo

```bash
# Lance le script de setup (Java, Android SDK, AVD, émulateur, Fongo)
./scripts/setup-fongo.sh

# Si tu as déjà l'APK Fongo :
./scripts/setup-fongo.sh /chemin/vers/fongo.apk
```

Le script te guidera pour les étapes manuelles dans l'émulateur
(création de compte, numéro Fongo, appli SMS par défaut).

### 3 — Configurer

```bash
cp .env.example .env
# Édite .env
```

```dotenv
GEMINI_API_KEY=ta_cle_gemini_ici
ALLOWED_NUMBERS=+14383389459   # ← ton numéro de téléphone personnel
```

### 4 — Lancer le serveur

```bash
node server.mjs
# [aiphone:server] listening { url: 'http://localhost:3000' }
# [aiphone:server] sms polling started { intervalMs: 5000 }
# [aiphone:server] proactive scheduler started { intervalMs: 14400000 }
```

---

## Comment ça marche

1. L'émulateur Android tourne avec Fongo installé comme appli SMS par défaut.
2. **SMS entrant** — Tu textais ton numéro Fongo → Fongo affiche une notification → AiPhone poll `adb shell dumpsys notification` toutes les 5 secondes → détecte le nouveau message → l'envoie à Gemini → Gemini répond → AiPhone ouvre Fongo en mode compose via intent Android et tape le bouton Envoyer via UIAutomator.
3. **Message proactif** — Toutes les 4 heures, AiPhone demande à Gemini s'il a quelque chose à dire. Si oui, le message est envoyé sans attendre un message entrant.
4. **Historique** — Chaque échange est conservé en mémoire (max 50 messages par numéro) pour que Gemini garde le contexte.

---

## Configuration

| Variable | Défaut | Description |
|---|---|---|
| `PORT` | `3000` | Port HTTP du serveur |
| `ADB_DEVICE` | `emulator-5554` | Série ADB de l'émulateur |
| `ADB_PATH` | `adb` | Chemin vers le binaire adb |
| `GEMINI_API_KEY` | — | **Requis.** Clé API Google Gemini |
| `GEMINI_MODEL` | `gemini-1.5-flash` | Modèle Gemini |
| `ALLOWED_NUMBERS` | — | Numéros E.164 autorisés (séparés par virgule) |
| `POLL_INTERVAL_MS` | `5000` | Fréquence de poll des notifications Fongo (ms) |
| `PROACTIVE_INTERVAL_MS` | `14400000` | Fréquence des messages proactifs de Gemini (ms) |

---

## Endpoint HTTP

### `GET /health`

```json
{ "ok": true, "bridgeReady": true, "geminiConfigured": true, "schedulerActive": true }
```

---

## Tests

```bash
npm test
```

---

## Licence

MIT
