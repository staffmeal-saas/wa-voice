import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers
} from 'baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import path from 'path';
import { getDevicePath, updatePhone, PROJECT_ROOT } from './device-manager.js';

const logger = pino({ level: 'silent' });

/**
 * Create and return a connected Baileys WhatsApp socket
 *
 * @param {string} deviceName - Name of the device to connect
 * @param {object} options - Connection options
 * @param {boolean} options.printQR - Whether to print QR in terminal (default: true)
 * @param {boolean} options.saveQR - Whether to save QR as PNG (default: true)
 * @param {function} options.onConnected - Callback when connected
 * @param {function} options.onDisconnected - Callback when disconnected
 * @param {function} options.onMessage - Callback for incoming messages
 * @returns {Promise<object>} The Baileys socket
 */
export async function createClient(deviceName, options = {}) {
  const {
    printQR = true,
    saveQR = true,
    onConnected = null,
    onDisconnected = null,
    onMessage = null,
    _retryCount = 0
  } = options;

  const MAX_RETRIES = 5;

  const devicePath = getDevicePath(deviceName);
  const authDir = path.join(devicePath, 'auth');

  const { state, saveCreds } = await useMultiFileAuthState(authDir);

  const sock = makeWASocket({
    version: [2, 3000, 1034074495],
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    browser: Browsers.appropriate('Chrome'),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false
  });

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n--- QR Code ---');
      console.log('Scan this QR code with WhatsApp on your phone:\n');

      // Display QR in terminal
      if (printQR) {
        qrcodeTerminal.generate(qr, { small: true }, (qrString) => {
          console.log(qrString);
        });
      }

      // Save QR as PNG file
      if (saveQR) {
        const qrPath = path.join(PROJECT_ROOT, 'qrcode.png');
        try {
          await QRCode.toFile(qrPath, qr, {
            width: 512,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
          });
          console.log(`\nQR code saved to: ${qrPath}`);
        } catch (err) {
          console.error('Failed to save QR code image:', err.message);
        }
      }

      console.log('\nWaiting for scan...\n');
    }

    if (connection === 'open') {
      console.log(`Connected to WhatsApp as device "${deviceName}"!`);

      // Extract and save phone number
      const phoneNumber = sock.user?.id?.split(':')[0] || sock.user?.id?.split('@')[0];
      if (phoneNumber) {
        updatePhone(deviceName, phoneNumber);
        console.log(`Phone: ${phoneNumber}`);
      }

      if (onConnected) onConnected(sock);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const reason = DisconnectReason;

      console.log(`Connection closed. Status: ${statusCode}`);

      // Only reconnect for known recoverable codes and within retry limit
      const recoverableCodes = [
        reason.restartRequired,    // 515
        reason.connectionClosed,   // 428
        reason.timedOut,           // 408
        reason.unavailableService  // 503
      ];

      const shouldReconnect = recoverableCodes.includes(statusCode) && _retryCount < MAX_RETRIES;

      if (shouldReconnect) {
        const delay = Math.min(2000 * (_retryCount + 1), 10000);
        console.log(`Reconnecting in ${delay / 1000}s... (attempt ${_retryCount + 1}/${MAX_RETRIES})`);
        await new Promise(r => setTimeout(r, delay));
        return createClient(deviceName, { ...options, _retryCount: _retryCount + 1 });
      } else if (statusCode === reason.loggedOut) {
        console.log('Logged out. Please scan QR code again.');
      } else {
        console.log(`Connection failed (status: ${statusCode}). Not retrying.`);
      }

      if (onDisconnected) onDisconnected(statusCode);
    }
  });

  // Save credentials on update
  sock.ev.on('creds.update', saveCreds);

  // Handle incoming messages
  if (onMessage) {
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type === 'notify') {
        for (const msg of messages) {
          if (!msg.key.fromMe) {
            onMessage(msg, sock);
          }
        }
      }
    });
  }

  return sock;
}

/**
 * Connect a device and wait until connection is established
 *
 * @param {string} deviceName - Name of the device
 * @returns {Promise<object>} Connected socket
 */
export function connectAndWait(deviceName) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Connection timeout (120s). Please try again.'));
    }, 120000);

    createClient(deviceName, {
      onConnected: (sock) => {
        clearTimeout(timeout);
        resolve(sock);
      },
      onDisconnected: (code) => {
        clearTimeout(timeout);
        reject(new Error(`Disconnected with code: ${code}`));
      }
    }).catch((err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Send a text message
 */
export async function sendText(sock, jid, text) {
  return sock.sendMessage(jid, { text });
}

/**
 * Send an audio voice note
 */
export async function sendAudio(sock, jid, audioData) {
  return sock.sendMessage(jid, {
    audio: audioData.buffer,
    mimetype: audioData.mimetype,
    ptt: audioData.ptt,
    seconds: audioData.seconds
  });
}

/**
 * Format a phone number to WhatsApp JID
 * @param {string} number - Phone number without +
 * @returns {string} JID format
 */
export function numberToJid(number) {
  // Remove any non-digit characters
  const clean = number.replace(/\D/g, '');
  return `${clean}@s.whatsapp.net`;
}

/**
 * Check if a number is registered on WhatsApp
 */
export async function isOnWhatsApp(sock, number) {
  try {
    const jid = numberToJid(number);
    const [result] = await sock.onWhatsApp(jid);
    return result?.exists || false;
  } catch {
    return false;
  }
}
