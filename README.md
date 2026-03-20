# WhatsApp Prospecting Tool

Outil de prospection WhatsApp utilisant Baileys pour envoyer des messages textes et vocaux en masse.

## Installation

### Prérequis

- Node.js 18+
- FFmpeg (pour la conversion audio)

```bash
# macOS
brew install ffmpeg

# Linux (Ubuntu/Debian)
sudo apt install ffmpeg
```

### Installation du projet

```bash
mkdir whatsapp-prospecting && cd whatsapp-prospecting
npm init -y
npm install @whiskeysockets/baileys pino pino-pretty qrcode
```

### Structure des fichiers

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
├── logs/                 # Historique des envois
└── qrcode.png            # QR code généré
```

## Utilisation

### 1. Copier les fichiers source

Copiez tous les fichiers depuis le dossier `references/` vers votre projet:
- `src/cli.js` → `src/cli.js`
- `src/lib/baileys-client.js` → `src/lib/baileys-client.js`
- `src/lib/audio.js` → `src/lib/audio.js`
- `src/services/sender.js` → `src/services/sender.js`
- `package.json` → `package.json`

### 2. Connexion WhatsApp

```bash
npm run scan
```

Un QR code sera généré. Scannez-le avec votre WhatsApp mobile.

**Important:** Le dossier `data/auth/` contient vos credentials. Ajoutez-le à `.gitignore`.

### 3. Préparer les numéros

Créez `data/numbers.txt`:
```
33695019947
33782679955
```

⚠️ **Format important:** SANS le signe `+` (ex: 33782679955, pas +33782679955)

### 4. Envoyer des messages

**Message vocal:**
```bash
npm run send -- --file=/path/to/audio.aac
```

**Message texte:**
```bash
npm run send -- --message="Bonjour, voici mon offre..."
```

### Autres commandes

```bash
npm run status     # Vérifier le statut
npm run convert    # Convertir un fichier audio
npm run clear      # Effacer la session
```

## Format audio recommandé

| Paramètre | Valeur |
|-----------|---------|
| Codec | AAC |
| Bitrate | 64kbps |
| Channels | Mono |
| Sample Rate | 44.1kHz |

Conversion:
```bash
ffmpeg -i input.m4a -c:a aac -b:a 64k -ac 1 -ar 44100 output.aac
```

## Configuration

Modifier les délais dans `src/services/sender.js`:

```javascript
delayBetweenMessages: 3000,  // 3 secondes entre messages
batchSize: 5,                 // Pause après 5 messages
batchDelay: 30000,           // Pause de 30s
```

## Dépannage

| Problème | Solution |
|----------|----------|
| QR code non généré | Installer FFmpeg |
| "This audio is no longer available" | Utiliser format AAC |
| Timeout sur numéros | Vérifier format SANS `+` |
| Session expirée | Relancer `npm run scan` |

## Sécurité

⚠️ **NE PARTAGEZ JAMAIS le dossier `data/auth/`**

Ajoutez à `.gitignore`:
```
data/auth/
*.log
qrcode.png
```

## License

MIT - Libre d'utilisation et modification.

## Avertissement

Utilisez cet outil uniquement pour:
- Des contacts qui ont donné leur consentement
- Respecter les lois locales sur la prospection
- Ne pas spammer - respectez les politiques WhatsApp
