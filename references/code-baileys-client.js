// src/lib/baileys-client.js
// Connexion WhatsApp avec Baileys

import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const AUTH_FOLDER = join(__dirname, '../../data/auth');
const SESSION_FILE = join(AUTH_FOLDER, 'creds.json');
const QR_CODE_FILE = join(__dirname, '../../qrcode.png');

// Créer le dossier auth s'il n'existe pas
if (!existsSync(AUTH_FOLDER)) {
  mkdirSync(AUTH_FOLDER, { recursive: true });
}

// Logger
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      singleLine: true
    }
  }
});

/**
 * Ouvre une image dans le visualiseur par défaut (macOS)
 */
async function openImage(filePath) {
  const { exec } = await import('child_process');
  try {
    await new Promise((resolve, reject) => {
      exec(`open "${filePath}"`, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  } catch (error) {
    logger.warn('Impossible d\'ouvrir l\'image automatiquement:', error.message);
  }
}

/**
 * Initialise le socket WhatsApp avec Baileys
 */
export async function createWhatsAppClient({
  onQR = () => {},
  onConnected = () => {},
  onDisconnected = () => {}
} = {}) {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger,
    browser: ['WhatsApp Prospecting', 'MacOS', '1.0.0'],
    markOnlineOnConnect: false,
  });

  // Gestion des événements de connexion
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('📱 QR Code généré - Scannez avec WhatsApp');
      logger.info(`📁 Image: ${QR_CODE_FILE}`);

      QRCode.toFile(QR_CODE_FILE, qr, {
        width: 400,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      }).then(() => {
        logger.info('✅ QR Code sauvegardé');
        if (process.platform === 'darwin') {
          openImage(QR_CODE_FILE);
        }
      }).catch((error) => {
        logger.error('Erreur lors de la génération du QR code:', error);
      });

      onQR(qr);
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        logger.warn('🔴 Connexion fermée - Reconnexion automatique...');
        onDisconnected(lastDisconnect);
      } else {
        logger.error('🔴 Session expirée - Scannez à nouveau le QR');
        onDisconnected(lastDisconnect, true);
      }
    }

    if (connection === 'open') {
      logger.info('✅ WhatsApp connecté avec succès!');
      logger.info(`📱 Numéro: ${sock.user?.id.split(':')[0]}`);
      logger.info(`👤 Nom: ${sock.user?.name || 'Non défini'}`);
      onConnected(sock);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  return sock;
}

export function hasSession() {
  return existsSync(SESSION_FILE);
}

export async function clearSession() {
  const fs = await import('fs');
  const { readdirSync, unlinkSync } = fs;
  const { glob } = await import('glob');

  try {
    const files = await glob('**/*', { cwd: AUTH_FOLDER, absolute: true });
    files.forEach(file => unlinkSync(file));
    logger.info('🗑️ Session supprimée avec succès');
    return true;
  } catch (error) {
    logger.error('❌ Erreur lors de la suppression de la session:', error.message);
    return false;
  }
}

export function formatPhoneToJID(phone) {
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.includes('@')) {
    return `${cleaned}@s.whatsapp.net`;
  }
  return cleaned;
}

export function isValidPhone(phone) {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
}
