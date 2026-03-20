---
name: whatsapp-prospecting
description: Outil de prospection WhatsApp - envoi de messages textes et vocaux en masse via Baileys. Guide d'installation et onboarding complet pour connecter votre compte WhatsApp et lancer des campagnes.
tools: Read, Write, Bash, Edit
---

# WhatsApp Prospecting Tool

Outil de prospection WhatsApp utilisant Baileys (@whiskeysockets/baileys) pour envoyer des messages textes et vocaux en masse.

## Onboarding

### Étape 1: Installation

```bash
mkdir whatsapp-prospecting && cd whatsapp-prospecting
npm init -y
npm install @whiskeysockets/baileys pino pino-pretty qrcode
```

### Étape 2: Création des Fichiers

Créez la structure suivante:

```
whatsapp-prospecting/
├── src/
│   ├── cli.js
│   ├── lib/
│   │   ├── baileys-client.js
│   │   └── audio.js
│   └── services/
│       └── sender.js
├── data/
│   ├── auth/              # Dossier à créer (NE PAS PARTAGER)
│   └── numbers.txt       # Liste des numéros
├── audio/                # Dossier pour les fichiers audio
└── logs/                 # Historique des envois
```

### Étape 3: Code Source

Copiez les fichiers depuis le repository:
- `src/cli.js` - Interface CLI
- `src/lib/baileys-client.js` - Connexion WhatsApp
- `src/lib/audio.js` - Conversion audio (Opus avec waveform)
- `src/services/sender.js` - Envoi en masse
- `package.json` - Configuration du projet

### Étape 4: Connexion WhatsApp

```bash
npm run scan
```

Un QR code sera généré dans `qrcode.png`. Scannez-le avec votre WhatsApp mobile.

**Note:** La session est sauvegardée dans `data/auth/`. Vous n'avez besoin de scanner qu'une seule fois.

### Étape 5: Préparer les Numéros

Créez `data/numbers.txt` avec vos numéros (SANS le signe `+`):
```
33695019947
33782679955
```

⚠️ **Format important:** SANS le signe `+` (ex: 33782679955, pas +33782679955)

### Étape 6: Envoyer des Messages

**Messages vocaux:**
```bash
npm run send -- --file=/path/to/audio.opus
```

**Messages textes:**
```bash
npm run send -- --message="Votre message..."
```

## Commandes Disponibles

```bash
npm run scan      # Connecter WhatsApp (QR code)
npm run send      # Envoyer des messages
npm run status    # Vérifier le statut
```

## Configuration

Modifier les délais dans `src/services/sender.js`:
```javascript
delayBetweenMessages: 3000,  // 3 secondes entre messages
batchSize: 5,                 // Pause après 5 messages
batchDelay: 30000,           // Pause de 30s
```

## Format Audio Recommandé (IMPORTANT pour la waveform)

| Paramètre | Valeur |
|-----------|---------|
| Codec | Opus (dans conteneur OGG) |
| Bitrate | 24kbps |
| Channels | Mono |
| Sample Rate | 48kHz |
| Application | voip (IMPORTANT pour waveform) |

Conversion automatique avec FFmpeg:
```bash
ffmpeg -i input.m4a -c:a libopus -b:a 24k -ac 1 -ar 48000 -application voip output.opus
```

**Note:** Le flag `-application voip` est essentiel pour afficher l'ondulation bleue (waveform) sur les messages vocaux.

## Dépannage

| Problème | Solution |
|----------|----------|
| QR code non généré | Installer FFmpeg |
| Pas de waveform | Utiliser format Opus avec flag `-application voip` |
| "This audio is no longer available" | Vérifier format Opus + flag voip |
| Timeout | Vérifier format SANS le signe `+` |
| Session expirée | Relancer `npm run scan` |

## Sécurité

⚠️ **NE PARTAGEZ JAMAIS le dossier `data/auth/`**

Ce dossier contient vos credentials WhatsApp. Ajoutez-le à `.gitignore`:

```gitignore
data/auth/
*.log
qrcode.png
```

## Avertissement

⚠️ **Respectez les politiques WhatsApp:**
- Ne spammez pas
- Utilisez uniquement pour des contacts consentants
- Respectez les lois locales sur la prospection

## License

MIT - Libre d'utilisation.
