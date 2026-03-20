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
# Créer le projet
mkdir whatsapp-prospecting && cd whatsapp-prospecting

# Initialiser le package
npm init -y

# Installer les dépendances
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
│   └── numbers.txt
├── audio/
└── logs/
```

### Étape 3: Code Source

**Copiez les fichiers depuis le repository:**

- `src/cli.js` - Interface CLI
- `src/lib/baileys-client.js` - Connexion WhatsApp
- `src/lib/audio.js` - Conversion audio
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

### Étape 6: Envoyer des Messages

**Messages vocaux:**
```bash
npm run send -- --file=/path/to/audio.aac
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

## Format Audio Recommandé

- **Codec:** AAC
- **Bitrate:** 64kbps
- **Channels:** Mono
- **Sample Rate:** 44.1kHz

Conversion automatique avec FFmpeg:
```bash
ffmpeg -i input.m4a -c:a aac -b:a 64k -ac 1 -ar 44100 output.aac
```

## Dépannage

| Problème | Solution |
|----------|----------|
| QR code non généré | Vérifier que ffmpeg est installé |
| "This audio is no longer available" | Utiliser format AAC (pas Opus) |
| Timeout | Vérifier format SANS le signe `+` |
| Session expirée | Relancer `npm run scan` |

## Sécurité

- Ne partagez JAMAIS le dossier `data/auth/`
- Ce dossier contient vos credentials WhatsApp
- Ajoutez `data/auth/` à votre `.gitignore`

## Avertissement

⚠️ **Respectez les politiques WhatsApp:**
- Ne spammez pas
- Utilisez uniquement pour des contacts consentants
- Respectez les lois locales sur la prospection

## License

MIT - Libre d'utilisation
