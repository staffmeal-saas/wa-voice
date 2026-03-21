import fs from 'fs';
import path from 'path';
import { connectAndWait, sendAudio, sendText, numberToJid } from '../lib/baileys-client.js';
import { readAudioForSending } from '../lib/audio.js';
import { getDevicePath, PROJECT_ROOT } from '../lib/device-manager.js';

/**
 * Sleep for ms milliseconds with random jitter
 */
function sleep(ms, jitter = 0.3) {
  const variation = ms * jitter;
  const actual = ms + (Math.random() * variation * 2 - variation);
  return new Promise(resolve => setTimeout(resolve, Math.max(500, actual)));
}

/**
 * Load numbers from a file (one number per line)
 */
function loadNumbers(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Numbers file not found: ${filePath}`);
  }

  return fs.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(n => n.trim())
    .filter(n => n && !n.startsWith('#') && /^\d+$/.test(n));
}

/**
 * Load sent log for a device
 */
function loadSentLog(deviceName) {
  const logPath = path.join(getDevicePath(deviceName), 'logs', 'sent.json');
  if (!fs.existsSync(logPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  } catch {
    return [];
  }
}

/**
 * Save sent log entry
 */
function appendSentLog(deviceName, entry) {
  const logDir = path.join(getDevicePath(deviceName), 'logs');
  const logPath = path.join(logDir, 'sent.json');
  fs.mkdirSync(logDir, { recursive: true });

  const log = loadSentLog(deviceName);
  log.push(entry);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
}

/**
 * Send messages in bulk
 *
 * @param {string} deviceName - Device to use
 * @param {object} options - Send options
 */
export async function sendBulk(deviceName, options = {}) {
  const {
    file = path.join(PROJECT_ROOT, 'audio', 'message.opus'),
    numbersFile = null,
    limit = 0,
    dryRun = false,
    delay = 3000,
    batchSize = 5,
    confirm = false,
    text = null
  } = options;

  const devicePath = getDevicePath(deviceName);
  const numbersPath = numbersFile || path.join(devicePath, 'numbers.txt');

  // Load numbers
  const allNumbers = loadNumbers(numbersPath);
  if (allNumbers.length === 0) {
    console.log(`No numbers found in ${numbersPath}`);
    return;
  }

  // Apply limit
  const numbers = limit > 0 ? allNumbers.slice(0, limit) : allNumbers;

  // Check if sending audio or text
  const isAudio = !text;
  let audioData = null;

  if (isAudio) {
    if (!fs.existsSync(file)) {
      console.error(`Audio file not found: ${file}`);
      console.log('Use --file=<path> to specify an audio file, or --text="message" for text.');
      return;
    }
    audioData = readAudioForSending(file);
    console.log(`\nAudio file: ${file}`);
  } else {
    console.log(`\nText message: "${text}"`);
  }

  console.log(`Device: ${deviceName}`);
  console.log(`Numbers: ${numbers.length} (of ${allNumbers.length} total)`);
  console.log(`Delay: ${delay}ms | Batch size: ${batchSize}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  // Confirmation
  if (!confirm && !dryRun) {
    console.log('Add --confirm to skip confirmation, or --dry-run for test mode.');
    console.log(`Ready to send to ${numbers.length} numbers. Proceeding in 5 seconds...`);
    console.log('Press Ctrl+C to cancel.\n');
    await sleep(5000, 0);
  }

  // Connect (skip in dry run)
  let sock = null;
  if (!dryRun) {
    console.log('Connecting to WhatsApp...');
    sock = await connectAndWait(deviceName);
    console.log('Connected!\n');
    // Small delay after connection
    await sleep(2000, 0);
  }

  // Send messages
  let sent = 0;
  let failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < numbers.length; i++) {
    const number = numbers[i];
    const jid = numberToJid(number);
    const progress = `[${i + 1}/${numbers.length}]`;

    try {
      if (dryRun) {
        console.log(`${progress} [DRY RUN] Would send to ${number}`);
      } else {
        if (isAudio) {
          await sendAudio(sock, jid, audioData);
        } else {
          await sendText(sock, jid, text);
        }
        console.log(`${progress} Sent to ${number}`);

        appendSentLog(deviceName, {
          number,
          type: isAudio ? 'audio' : 'text',
          file: isAudio ? path.basename(file) : null,
          sentAt: new Date().toISOString(),
          status: 'sent'
        });
      }
      sent++;
    } catch (err) {
      console.error(`${progress} Failed for ${number}: ${err.message}`);
      appendSentLog(deviceName, {
        number,
        type: isAudio ? 'audio' : 'text',
        sentAt: new Date().toISOString(),
        status: 'failed',
        error: err.message
      });
      failed++;
    }

    // Delay between messages
    if (i < numbers.length - 1) {
      // Extra delay between batches
      if ((i + 1) % batchSize === 0) {
        const batchDelay = delay * 3;
        console.log(`\n--- Batch complete. Pausing ${Math.round(batchDelay / 1000)}s ---\n`);
        await sleep(batchDelay);
      } else {
        await sleep(delay);
      }
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDone! Sent: ${sent}, Failed: ${failed}, Time: ${elapsed}s`);

  // Disconnect
  if (sock) {
    await sock.end();
  }
}

/**
 * Show sending status/history for a device
 */
export function showStatus(deviceName) {
  const log = loadSentLog(deviceName);

  if (log.length === 0) {
    console.log(`No messages sent from device "${deviceName}" yet.`);
    return;
  }

  const sent = log.filter(e => e.status === 'sent').length;
  const failed = log.filter(e => e.status === 'failed').length;
  const lastSent = log[log.length - 1];

  console.log(`\nDevice: ${deviceName}`);
  console.log('─'.repeat(40));
  console.log(`Total messages: ${log.length}`);
  console.log(`Sent: ${sent}`);
  console.log(`Failed: ${failed}`);
  console.log(`Last activity: ${lastSent.sentAt}`);
  console.log(`Last number: ${lastSent.number}`);
  console.log('');
}
