import fs from 'fs';
import path from 'path';
import { connectAndWait, sendText, numberToJid } from '../lib/baileys-client.js';
import { getDevicePath } from '../lib/device-manager.js';

/**
 * Warmup phases configuration
 *
 * Phase 1 (Passive): Days 1-3, 0-3 messages/day, 60s-5min delays
 * Phase 2 (Week 1):  Days 4-10, 5-10 messages/day, 30-90s delays
 * Phase 3 (Week 2):  Days 11-17, 15-25 messages/day, 45s-3min delays
 * Phase 4 (Week 3-4): Days 18-31, 50-80 messages/day, 30s-2min delays
 */
const PHASES = [
  {
    name: 'Phase 1 - Passive',
    dayStart: 1,
    dayEnd: 3,
    minMessages: 0,
    maxMessages: 3,
    minDelay: 60000,
    maxDelay: 300000
  },
  {
    name: 'Phase 2 - Week 1',
    dayStart: 4,
    dayEnd: 10,
    minMessages: 5,
    maxMessages: 10,
    minDelay: 30000,
    maxDelay: 90000
  },
  {
    name: 'Phase 3 - Week 2',
    dayStart: 11,
    dayEnd: 17,
    minMessages: 15,
    maxMessages: 25,
    minDelay: 45000,
    maxDelay: 180000
  },
  {
    name: 'Phase 4 - Week 3-4',
    dayStart: 18,
    dayEnd: 31,
    minMessages: 50,
    maxMessages: 80,
    minDelay: 30000,
    maxDelay: 120000
  }
];

const WARMUP_MESSAGES = [
  'Salut ! Comment tu vas ?',
  'Hey, ca fait longtemps !',
  'Coucou, tu fais quoi de beau ?',
  'Salut, j\'espere que tu vas bien !',
  'Hello ! Quoi de neuf ?',
  'Bonjour ! Belle journee aujourd\'hui',
  'Salut, je pensais a toi !',
  'Hey ! Tu as passe un bon weekend ?',
  'Coucou, on se voit bientot ?',
  'Salut ! Tu as vu les news ?',
  'Hello, comment se passe ta journee ?',
  'Bonjour, tout va bien de ton cote ?',
  'Salut, ca roule ?',
  'Hey, tu es dispo cette semaine ?',
  'Coucou, j\'ai une question pour toi'
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDelay(min, max) {
  return new Promise(resolve => setTimeout(resolve, randomInt(min, max)));
}

function getWarmupPath(deviceName) {
  return path.join(getDevicePath(deviceName), 'warmup.json');
}

function getContactsPath(deviceName) {
  return path.join(getDevicePath(deviceName), 'warmup-contacts.txt');
}

function loadWarmupState(deviceName) {
  const warmupPath = getWarmupPath(deviceName);
  if (!fs.existsSync(warmupPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(warmupPath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveWarmupState(deviceName, state) {
  fs.writeFileSync(getWarmupPath(deviceName), JSON.stringify(state, null, 2));
}

function loadContacts(deviceName) {
  const contactsPath = getContactsPath(deviceName);
  if (!fs.existsSync(contactsPath)) return [];
  return fs.readFileSync(contactsPath, 'utf-8')
    .split('\n')
    .map(n => n.trim())
    .filter(n => n && !n.startsWith('#') && /^\d+$/.test(n));
}

function isWithinTimeWindow() {
  const hour = new Date().getHours();
  return hour >= 9 && hour < 20;
}

function getCurrentPhase(dayNumber) {
  for (const phase of PHASES) {
    if (dayNumber >= phase.dayStart && dayNumber <= phase.dayEnd) {
      return phase;
    }
  }
  // Beyond day 31, use phase 4
  return PHASES[PHASES.length - 1];
}

function getDayNumber(startDate) {
  const start = new Date(startDate);
  const now = new Date();
  const diffMs = now - start;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Initialize warmup for a device
 */
export function startWarmup(deviceName) {
  const contacts = loadContacts(deviceName);

  if (contacts.length === 0) {
    const contactsPath = getContactsPath(deviceName);
    console.log(`No warmup contacts found.`);
    console.log(`Add phone numbers (one per line) to: ${contactsPath}`);
    console.log('These should be numbers that will respond to your messages (friends, colleagues).');
    return false;
  }

  const existing = loadWarmupState(deviceName);
  if (existing && existing.status === 'active') {
    console.log('Warmup is already active for this device.');
    showWarmupStatus(deviceName);
    return false;
  }

  const state = {
    status: 'active',
    startedAt: new Date().toISOString(),
    contacts: contacts.length,
    totalSent: 0,
    todaySent: 0,
    lastSendDate: null,
    lastSendAt: null,
    banDetected: false,
    banPauseUntil: null,
    history: []
  };

  saveWarmupState(deviceName, state);
  console.log(`Warmup started for device "${deviceName}".`);
  console.log(`Contacts: ${contacts.length}`);
  console.log(`Phase 1 starts now. Run "npm run warmup run" to send messages.`);
  return true;
}

/**
 * Run a warmup cycle
 */
export async function runWarmup(deviceName) {
  const state = loadWarmupState(deviceName);

  if (!state || state.status !== 'active') {
    console.log('Warmup is not active. Run "npm run warmup start" first.');
    return;
  }

  // Check ban pause
  if (state.banDetected && state.banPauseUntil) {
    const pauseUntil = new Date(state.banPauseUntil);
    if (new Date() < pauseUntil) {
      console.log(`Ban detected - paused until ${pauseUntil.toLocaleString()}`);
      return;
    }
    // Resume
    state.banDetected = false;
    state.banPauseUntil = null;
    saveWarmupState(deviceName, state);
    console.log('Ban pause ended. Resuming warmup.');
  }

  // Check time window
  if (!isWithinTimeWindow()) {
    console.log('Outside time window (9h-20h). Try again during business hours.');
    return;
  }

  const dayNumber = getDayNumber(state.startedAt);
  const phase = getCurrentPhase(dayNumber);

  // Reset daily counter if new day
  const today = new Date().toISOString().split('T')[0];
  if (state.lastSendDate !== today) {
    state.todaySent = 0;
    state.lastSendDate = today;
  }

  // Calculate how many messages to send
  const dailyTarget = randomInt(phase.minMessages, phase.maxMessages);
  const remaining = Math.max(0, dailyTarget - state.todaySent);

  if (remaining === 0) {
    console.log(`Daily limit reached (${state.todaySent}/${dailyTarget} for ${phase.name}).`);
    return;
  }

  console.log(`\nWarmup - Day ${dayNumber} - ${phase.name}`);
  console.log(`Daily target: ${dailyTarget} | Sent today: ${state.todaySent} | Remaining: ${remaining}`);
  console.log(`Delay range: ${phase.minDelay / 1000}s - ${phase.maxDelay / 1000}s\n`);

  const contacts = loadContacts(deviceName);
  if (contacts.length === 0) {
    console.log('No contacts available.');
    return;
  }

  // Connect
  console.log('Connecting to WhatsApp...');
  let sock;
  try {
    sock = await connectAndWait(deviceName);
  } catch (err) {
    console.error(`Connection failed: ${err.message}`);
    return;
  }
  console.log('Connected!\n');

  // Wait a bit after connecting
  await randomDelay(3000, 8000);

  let sentThisRun = 0;

  for (let i = 0; i < remaining; i++) {
    // Re-check time window
    if (!isWithinTimeWindow()) {
      console.log('Reached end of time window. Stopping.');
      break;
    }

    // Pick a random contact
    const contact = contacts[randomInt(0, contacts.length - 1)];
    const jid = numberToJid(contact);

    // Pick a random message
    const message = WARMUP_MESSAGES[randomInt(0, WARMUP_MESSAGES.length - 1)];

    try {
      await sendText(sock, jid, message);
      sentThisRun++;
      state.todaySent++;
      state.totalSent++;
      state.lastSendAt = new Date().toISOString();

      state.history.push({
        contact,
        message,
        sentAt: state.lastSendAt,
        day: dayNumber,
        phase: phase.name
      });

      console.log(`[${sentThisRun}/${remaining}] Sent to ${contact}: "${message}"`);
      saveWarmupState(deviceName, state);

    } catch (err) {
      console.error(`Failed to send to ${contact}: ${err.message}`);

      // Check for ban indicators
      if (err.message.includes('blocked') || err.message.includes('ban') ||
          err.message.includes('403') || err.message.includes('rate')) {
        console.log('\n*** BAN DETECTED - Pausing warmup for 24-48h ***');
        const pauseHours = randomInt(24, 48);
        state.banDetected = true;
        state.banPauseUntil = new Date(Date.now() + pauseHours * 3600000).toISOString();
        saveWarmupState(deviceName, state);
        break;
      }
    }

    // Random delay between messages
    if (i < remaining - 1) {
      const delayMs = randomInt(phase.minDelay, phase.maxDelay);
      console.log(`  Waiting ${Math.round(delayMs / 1000)}s...`);
      await randomDelay(delayMs * 0.9, delayMs * 1.1);
    }
  }

  saveWarmupState(deviceName, state);
  console.log(`\nWarmup cycle done. Sent ${sentThisRun} messages today (${state.todaySent} total today).`);

  // Disconnect
  await sock.end();
}

/**
 * Show warmup status
 */
export function showWarmupStatus(deviceName) {
  const state = loadWarmupState(deviceName);

  if (!state) {
    console.log(`No warmup state for device "${deviceName}".`);
    console.log('Run "npm run warmup start" to initialize.');
    return;
  }

  const dayNumber = state.status === 'active' ? getDayNumber(state.startedAt) : '-';
  const phase = state.status === 'active' ? getCurrentPhase(dayNumber) : null;

  console.log(`\nWarmup Status - Device: ${deviceName}`);
  console.log('─'.repeat(45));
  console.log(`Status: ${state.status.toUpperCase()}`);
  console.log(`Started: ${state.startedAt}`);
  console.log(`Day: ${dayNumber}`);
  if (phase) console.log(`Phase: ${phase.name}`);
  console.log(`Total messages sent: ${state.totalSent}`);
  console.log(`Today: ${state.todaySent}`);
  console.log(`Contacts: ${state.contacts}`);

  if (state.banDetected) {
    console.log(`\n*** BAN DETECTED ***`);
    console.log(`Paused until: ${state.banPauseUntil}`);
  }

  if (state.lastSendAt) {
    console.log(`Last message: ${state.lastSendAt}`);
  }
  console.log('');
}

/**
 * Stop warmup
 */
export function stopWarmup(deviceName) {
  const state = loadWarmupState(deviceName);
  if (!state) {
    console.log('No warmup active.');
    return;
  }

  state.status = 'stopped';
  state.stoppedAt = new Date().toISOString();
  saveWarmupState(deviceName, state);
  console.log(`Warmup stopped for device "${deviceName}".`);
}
