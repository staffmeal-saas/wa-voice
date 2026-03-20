// src/cli.js
// Interface CLI principale

#!/usr/bin/env node

import { createWhatsAppClient, hasSession, clearSession } from './lib/baileys-client.js';
import { sendMessages, printSummary, loadNumbers } from './services/sender.js';
import { convertToAAC, checkFFmpeg, showFFmpegInstructions, prepareAudioForWhatsApp } from './lib/audio.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AUDIO_FOLDER = join(__dirname, '../audio');
const NUMBERS_FILE = join(__dirname, '../data/numbers.txt');

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function color(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// Parse args
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      options[key] = value || true;
    } else {
      options.command = arg;
    }
  }

  return options;
}

// Question interactive
function ask(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// Command: scan - Connecter WhatsApp
async function cmdScan() {
  console.log(color('\n📱 Connexion à WhatsApp...\n', 'cyan'));

  if (hasSession()) {
    console.log(color('⚠️  Une session existe déjà.', 'yellow'));
    const reset = await ask('Voulez-vous supprimer la session existante? (o/n): ');
    if (reset.toLowerCase() === 'o') {
      await clearSession();
    } else {
      console.log(color('✅ Utilisation de la session existante.\n', 'green'));
      return;
    }
  }

  await new Promise((resolve) => {
    createWhatsAppClient({
      onQR: (qr) => {
        console.log(color('\n📷 Scannez le QR code avec votre WhatsApp mobile\n', 'cyan'));
      },
      onConnected: (sock) => {
        console.log(color('\n✅ Connexion réussie! Appuyez sur Ctrl+C pour quitter.\n', 'green'));
        resolve();
      },
      onDisconnected: (error, loggedOut) => {
        if (loggedOut) {
          console.log(color('\n🔴 Session expirée. Relancez la commande pour vous reconnecter.\n', 'red'));
        }
        resolve();
      }
    });
  });
}

// Command: send - Envoyer des messages
async function cmdSend(options) {
  console.log(color('\n📤 Préparation de l\'envoi...\n', 'cyan'));

  // Vérifier FFmpeg si audio
  if (options.file) {
    if (!(await checkFFmpeg())) {
      console.log(color('⚠️  ffmpeg n\'est pas installé.\n', 'yellow'));
      showFFmpegInstructions();
      return;
    }
  }

  // Vérifier les numéros
  try {
    const numbers = loadNumbers();
    console.log(color(`📋 ${numbers.length} numéros à traiter\n`, 'cyan'));
  } catch (error) {
    console.log(color('❌ Erreur: ' + error.message, 'red'));
    return;
  }

  // Connecter WhatsApp
  let sock;
  try {
    sock = await new Promise((resolve, reject) => {
      createWhatsAppClient({
        onConnected: resolve,
        onDisconnected: reject
      });
    });
  } catch (error) {
    console.log(color('❌ Erreur de connexion: ' + error.message, 'red'));
    return;
  }

  // Envoyer
  try {
    const config = {
      audioPath: options.file ? join(__dirname, '..', options.file) : null,
      message: options.message || null,
      numbersFile: NUMBERS_FILE,
      skipDuplicates: true
    };

    console.log(color('Appuyez sur Ctrl+C pour annuler. Envoi dans 3...', 'yellow'));

    await new Promise(resolve => setTimeout(resolve, 3000));

    const result = await sendMessages(sock, config);
    printSummary(result);

  } catch (error) {
    console.log(color('❌ Erreur: ' + error.message, 'red'));
  }
}

// Command: convert - Convertir audio
async function cmdConvert(options) {
  if (!options.input) {
    console.log(color('❌ Erreur: --input requis', 'red'));
    console.log(color('Usage: npm run convert -- --input=/path/to/file.m4a', 'cyan'));
    return;
  }

  if (!(await checkFFmpeg())) {
    console.log(color('⚠️  ffmpeg n\'est pas installé.\n', 'yellow'));
    showFFmpegInstructions();
    return;
  }

  try {
    const outputPath = await convertToAAC(options.input);
    console.log(color(`\n✅ Converti: ${outputPath}\n`, 'green'));
  } catch (error) {
    console.log(color('❌ Erreur: ' + error.message, 'red'));
  }
}

// Command: status - Vérifier le statut
async function cmdStatus() {
  console.log(color('\n📊 Statut WhatsApp Prospecting\n', 'cyan'));

  console.log(`Session: ${hasSession() ? color('✅ Connectée', 'green') : color('❌ Non connectée', 'red')}`);

  try {
    const numbers = loadNumbers();
    console.log(`Numéros: ${color(numbers.length.toString(), 'blue')}`);
  } catch (error) {
    console.log(`Numéros: ${color('Erreur', 'red')}`);
  }

  console.log(`FFmpeg: ${await checkFFmpeg() ? color('✅ Installé', 'green') : color('❌ Non installé', 'red')}`);
  console.log('');
}

// Main
async function main() {
  const options = parseArgs();
  const command = options.command || 'help';

  switch (command) {
    case 'scan':
      await cmdScan();
      break;
    case 'send':
      await cmdSend(options);
      break;
    case 'convert':
      await cmdConvert(options);
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'clear':
      await clearSession();
      break;
    default:
      console.log(color('\n📱 WhatsApp Prospecting Tool\n', 'cyan'));
      console.log(color('Commandes:\n', 'yellow'));
      console.log('  npm run scan         - Connecter WhatsApp (QR code)');
      console.log('  npm run send         - Envoyer des messages');
      console.log('  npm run convert      - Convertir un fichier audio');
      console.log('  npm run status       - Vérifier le statut');
      console.log('  npm run clear        - Effacer la session');
      console.log('');
      console.log(color('Options send:\n', 'yellow'));
      console.log('  --file=/path       - Fichier audio (.aac, .m4a, .mp3)');
      console.log('  --message="text"    - Message texte');
      console.log('');
  }
}

main().catch(console.error);
