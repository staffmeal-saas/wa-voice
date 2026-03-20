// src/services/sender.js
// Envoi en masse de messages

import pino from 'pino';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { formatPhoneToJID, isValidPhone } from '../lib/baileys-client.js';
import { prepareAudioForWhatsApp, readAudioBuffer, getMimeType } from '../lib/audio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_FOLDER = join(__dirname, '../../data');
const NUMBERS_FILE = join(DATA_FOLDER, 'numbers.txt');
const LOGS_FOLDER = join(__dirname, '../../logs');
const SEND_LOG = join(LOGS_FOLDER, 'sent.json');
const FAILED_LOG = join(LOGS_FOLDER, 'failed.json');

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

const DEFAULT_CONFIG = {
  delayBetweenMessages: 3000,
  batchSize: 5,
  batchDelay: 30000,
  retryFailed: false,
  maxRetries: 2,
  dryRun: false,
  audioPath: null,
  limit: null,
  skipDuplicates: true
};

class SendResult {
  constructor() {
    this.total = 0;
    this.success = 0;
    this.failed = 0;
    this.skipped = 0;
    this.sent = [];
    this.failedList = [];
    this.startTime = null;
    this.endTime = null;
  }

  get duration() {
    if (!this.startTime || !this.endTime) return 0;
    return Math.round((this.endTime - this.startTime) / 1000);
  }

  get successRate() {
    if (this.total === 0) return 0;
    return ((this.success / this.total) * 100).toFixed(1);
  }
}

export function loadNumbers(filePath = NUMBERS_FILE) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch (error) {
    throw new Error(`Impossible de lire le fichier de numéros: ${error.message}`);
  }
}

export function loadSentLog() {
  const sent = new Set();

  if (existsSync(SEND_LOG)) {
    try {
      const data = JSON.parse(readFileSync(SEND_LOG, 'utf-8'));
      if (Array.isArray(data)) {
        data.forEach(item => sent.add(item.phone));
      }
    } catch (error) {
      logger.warn('Impossible de lire le log des envois');
    }
  }

  return sent;
}

export function saveSendLog(result) {
  const existingSent = existsSync(SEND_LOG)
    ? JSON.parse(readFileSync(SEND_LOG, 'utf-8'))
    : [];

  const timestamp = new Date().toISOString();
  const newSent = result.sent.map(phone => ({ phone, sentAt: timestamp }));
  writeFileSync(SEND_LOG, JSON.stringify([...existingSent, ...newSent], null, 2));

  const existingFailed = existsSync(FAILED_LOG)
    ? JSON.parse(readFileSync(FAILED_LOG, 'utf-8'))
    : [];

  const newFailed = result.failedList.map(item => ({
    ...item,
    failedAt: timestamp
  }));
  writeFileSync(FAILED_LOG, JSON.stringify([...existingFailed, ...newFailed], null, 2));
}

async function sendMessage(sock, phone, content, type, config) {
  const jid = formatPhoneToJID(phone);

  if (config.dryRun) {
    logger.info(`[DRY RUN] Envoi ${type} à ${phone}`);
    return { success: true, phone, jid, dryRun: true };
  }

  try {
    const result = await sock.sendMessage(jid, content);
    logger.info(`✅ Envoyé à ${phone}`);
    return { success: true, phone, jid, messageId: result.key.id };
  } catch (error) {
    logger.error(`❌ Échec ${phone}: ${error.message}`);
    return { success: false, phone, jid, error: error.message };
  }
}

function delay(ms, message = 'Pause') {
  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.ceil((ms - elapsed) / 1000);
      if (remaining > 0) {
        process.stdout.write(`\r⏳ ${message} (${remaining}s)   `);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(interval);
      process.stdout.write(`\r✓ ${message} terminée${' '.repeat(20)}\n`);
      resolve();
    }, ms);
  });
}

function showProgress(result, current, total) {
  const progress = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(progress / 5)) + '░'.repeat(20 - Math.floor(progress / 5));

  process.stdout.write(
    `\r[${bar}] ${progress}% | ` +
    `✓ ${result.success} | ✗ ${result.failed} | ` +
    `⊘ ${result.skipped} | ${current}/${total}`
  );
}

export async function sendMessages(sock, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const result = new SendResult();

  logger.info('\n' + '='.repeat(50));
  logger.info('📤 Envoi de messages en masse');
  logger.info('='.repeat(50) + '\n');

  // Charger le contenu (audio ou texte)
  let content, mimeType;
  if (config.audioPath) {
    logger.info('🎵 Préparation du fichier audio...');
    const audioInfo = await prepareAudioForWhatsApp(config.audioPath);
    const audioBuffer = readAudioBuffer(audioInfo.path);
    mimeType = getMimeType(audioInfo.path);
    content = { audio: audioBuffer, mimetype: mimeType, ptt: true };
    logger.info(`   Format: ${audioInfo.format}`);
    logger.info(`   Durée: ${Math.round(audioInfo.duration)}s`);
    logger.info(`   Taille: ${audioInfo.sizeMB} MB\n`);
  } else if (config.message) {
    content = { text: config.message };
    logger.info(`📝 Message texte: "${config.message.substring(0, 50)}..."\n`);
  }

  // Charger les numéros
  logger.info('📋 Chargement de la liste de numéros...');
  let numbers = loadNumbers(config.numbersFile);

  if (config.skipDuplicates) {
    const sent = loadSentLog();
    const before = numbers.length;
    numbers = numbers.filter(n => !sent.has(n));
    const duplicates = before - numbers.length;
    if (duplicates > 0) {
      logger.info(`   ✓ ${duplicates} numéros déjà envoyés ignorés`);
    }
  }

  if (config.limit && numbers.length > config.limit) {
    numbers = numbers.slice(0, config.limit);
    logger.info(`   ✓ Limité à ${config.limit} numéros`);
  }

  result.total = numbers.length;

  if (numbers.length === 0) {
    logger.warn('\n⚠️ Aucun numéro à traiter');
    return result;
  }

  logger.info(`   Total: ${numbers.length} numéros\n`);

  if (numbers.length > 1) {
    logger.info(`⏱️  Délai entre messages: ${config.delayBetweenMessages / 1000}s`);
    logger.info(`   Pause après ${config.batchSize} messages: ${config.batchDelay / 1000}s\n`);
  }

  if (!config.dryRun && !config.autoConfirm) {
    await delay(2000);
  }

  result.startTime = Date.now();

  const type = config.audioPath ? 'vocal' : 'texte';

  for (let i = 0; i < numbers.length; i++) {
    const phone = numbers[i];

    if (!isValidPhone(phone)) {
      logger.warn(`⚠️ Numéro invalide ignoré: ${phone}`);
      result.skipped++;
      continue;
    }

    if (i > 0) {
      await delay(config.delayBetweenMessages, `Attente avant ${phone}`);
    }

    if (config.batchSize > 0 && i > 0 && i % config.batchSize === 0) {
      const pauseMessage = `Pause batch (${i}/${numbers.length} envoyés)`;
      await delay(config.batchDelay, pauseMessage);
    }

    const sendResult = await sendMessage(sock, phone, content, type, config);

    if (sendResult.success) {
      result.success++;
      result.sent.push(phone);
    } else {
      result.failed++;
      result.failedList.push({
        phone,
        error: sendResult.error,
        retryCount: 0
      });
    }

    showProgress(result, i + 1, numbers.length);
  }

  process.stdout.write('\n');
  result.endTime = Date.now();

  if (!config.dryRun) {
    saveSendLog(result);
    logger.info('\n📝 Logs sauvegardés dans logs/');
  }

  return result;
}

export function printSummary(result) {
  console.log('\n' + '='.repeat(50));
  console.log('📊 RÉSUMÉ DE L\'ENVOI');
  console.log('='.repeat(50));
  console.log(`\n✓ Réussis :  ${result.success}`);
  console.log(`✗ Échoués :  ${result.failed}`);
  console.log(`⊘ Ignorés :  ${result.skipped}`);
  console.log(`📦 Total :    ${result.total}`);
  console.log(`📈 Taux :     ${result.successRate}%`);
  console.log(`⏱️  Durée :    ${result.duration}s`);
  console.log('');

  if (result.failed > 0) {
    console.log('❌ Numéros en échec:');
    result.failedList.forEach(item => {
      console.log(`   ${item.phone} - ${item.error}`);
    });
    console.log('');
  }
}

export default {
  sendMessages,
  printSummary,
  loadNumbers,
  loadSentLog,
  DEFAULT_CONFIG
};
