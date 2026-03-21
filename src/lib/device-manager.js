import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DEVICES_FILE = path.join(DATA_DIR, 'devices.json');
const DEVICES_DIR = path.join(DATA_DIR, 'devices');

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(DEVICES_DIR, { recursive: true });
}

function loadDevices() {
  ensureDataDirs();
  if (!fs.existsSync(DEVICES_FILE)) {
    return { active: null, devices: [] };
  }
  return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf-8'));
}

function saveDevices(data) {
  ensureDataDirs();
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(data, null, 2));
}

function getDevicePath(name) {
  return path.join(DEVICES_DIR, name);
}

function createDeviceDirs(name) {
  const devicePath = getDevicePath(name);
  fs.mkdirSync(path.join(devicePath, 'auth'), { recursive: true });
  fs.mkdirSync(path.join(devicePath, 'logs'), { recursive: true });

  // Create empty files if they don't exist
  const numbersFile = path.join(devicePath, 'numbers.txt');
  if (!fs.existsSync(numbersFile)) {
    fs.writeFileSync(numbersFile, '');
  }
  const sentFile = path.join(devicePath, 'logs', 'sent.json');
  if (!fs.existsSync(sentFile)) {
    fs.writeFileSync(sentFile, '[]');
  }
}

export function add(name) {
  const data = loadDevices();
  const existing = data.devices.find(d => d.name === name);
  if (existing) {
    console.log(`Device "${name}" already exists.`);
    return existing;
  }

  createDeviceDirs(name);

  const device = {
    name,
    phone: null,
    createdAt: new Date().toISOString(),
    active: data.devices.length === 0 // first device is active by default
  };

  data.devices.push(device);
  if (device.active || !data.active) {
    data.active = name;
  }

  saveDevices(data);
  console.log(`Device "${name}" created.`);
  return device;
}

export function list() {
  const data = loadDevices();
  if (data.devices.length === 0) {
    console.log('No devices configured. Use "npm run device add <name>" to add one.');
    return [];
  }

  console.log('\nDevices:');
  console.log('─'.repeat(50));
  for (const device of data.devices) {
    const marker = data.active === device.name ? ' [ACTIVE]' : '';
    const phone = device.phone ? ` (${device.phone})` : '';
    console.log(`  ${device.name}${phone}${marker}`);
  }
  console.log('');
  return data.devices;
}

export function remove(name) {
  const data = loadDevices();
  const index = data.devices.findIndex(d => d.name === name);
  if (index === -1) {
    console.log(`Device "${name}" not found.`);
    return false;
  }

  data.devices.splice(index, 1);
  if (data.active === name) {
    data.active = data.devices.length > 0 ? data.devices[0].name : null;
  }
  saveDevices(data);

  // Remove device directory
  const devicePath = getDevicePath(name);
  if (fs.existsSync(devicePath)) {
    fs.rmSync(devicePath, { recursive: true, force: true });
  }

  console.log(`Device "${name}" removed.`);
  return true;
}

export function switchDevice(name) {
  const data = loadDevices();
  const device = data.devices.find(d => d.name === name);
  if (!device) {
    console.log(`Device "${name}" not found.`);
    return false;
  }

  data.active = name;
  saveDevices(data);
  console.log(`Switched to device "${name}".`);
  return true;
}

export function getActive() {
  const data = loadDevices();
  if (!data.active) {
    return null;
  }
  return data.devices.find(d => d.name === data.active) || null;
}

export function getActiveDeviceName(overrideName) {
  if (overrideName) return overrideName;
  const active = getActive();
  if (!active) {
    // Auto-create a default device if none exists
    add('default');
    return 'default';
  }
  return active.name;
}

export function updatePhone(name, phone) {
  const data = loadDevices();
  const device = data.devices.find(d => d.name === name);
  if (device) {
    device.phone = phone;
    saveDevices(data);
  }
}

export { getDevicePath, DATA_DIR, DEVICES_DIR, PROJECT_ROOT };
