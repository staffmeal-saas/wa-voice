#!/usr/bin/env node

import { getActiveDeviceName, add, list, remove, switchDevice, getDevicePath } from './lib/device-manager.js';
import { createClient, connectAndWait } from './lib/baileys-client.js';
import { convertToOpus } from './lib/audio.js';
import { sendBulk, showStatus } from './services/sender.js';
import { startWarmup, runWarmup, showWarmupStatus, stopWarmup } from './services/warmup.js';
import path from 'path';

// Parse CLI arguments
const args = process.argv.slice(2);

// Extract --device option
let deviceOverride = null;
const filteredArgs = args.filter(arg => {
  if (arg.startsWith('--device=')) {
    deviceOverride = arg.split('=')[1];
    return false;
  }
  return true;
});

const command = filteredArgs[0];
const subCommand = filteredArgs[1];

// Parse options from remaining args
function parseOptions(startIndex = 1) {
  const opts = {};
  for (let i = startIndex; i < filteredArgs.length; i++) {
    const arg = filteredArgs[i];
    if (arg.startsWith('--')) {
      const [key, ...valueParts] = arg.slice(2).split('=');
      const value = valueParts.join('=');
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

      if (value === '' || value === undefined) {
        opts[camelKey] = true;
      } else if (!isNaN(value)) {
        opts[camelKey] = Number(value);
      } else {
        opts[camelKey] = value;
      }
    }
  }
  return opts;
}

async function main() {
  try {
    switch (command) {
      case 'scan': {
        const deviceName = getActiveDeviceName(deviceOverride);
        console.log(`Scanning QR code for device: ${deviceName}`);
        await createClient(deviceName, {
          printQR: true,
          saveQR: true,
          onConnected: (sock) => {
            console.log('\nSuccessfully connected! You can now close this with Ctrl+C.');
          }
        });
        break;
      }

      case 'send': {
        const deviceName = getActiveDeviceName(deviceOverride);
        const opts = parseOptions(1);
        await sendBulk(deviceName, {
          file: opts.file,
          numbersFile: opts.numbers,
          limit: opts.limit || 0,
          dryRun: opts.dryRun || false,
          delay: opts.delay || 3000,
          batchSize: opts.batch || 5,
          confirm: opts.confirm || false,
          text: opts.text || null
        });
        break;
      }

      case 'status': {
        const deviceName = getActiveDeviceName(deviceOverride);
        showStatus(deviceName);
        break;
      }

      case 'convert': {
        const inputFile = subCommand;
        if (!inputFile) {
          console.log('Usage: npm run convert <input-file> [--output=<output-file>]');
          process.exit(1);
        }
        const opts = parseOptions(2);
        const inputPath = path.resolve(inputFile);
        convertToOpus(inputPath, opts.output ? path.resolve(opts.output) : null);
        break;
      }

      case 'device': {
        switch (subCommand) {
          case 'add': {
            const name = filteredArgs[2];
            if (!name) {
              console.log('Usage: npm run device add <name>');
              process.exit(1);
            }
            add(name);
            // Launch QR scan for the new device
            console.log(`\nLaunching QR scan for "${name}"...`);
            await createClient(name, {
              printQR: true,
              saveQR: true,
              onConnected: () => {
                console.log('\nDevice connected! You can close this with Ctrl+C.');
              }
            });
            break;
          }

          case 'list':
            list();
            break;

          case 'remove': {
            const name = filteredArgs[2];
            if (!name) {
              console.log('Usage: npm run device remove <name>');
              process.exit(1);
            }
            remove(name);
            break;
          }

          case 'switch': {
            const name = filteredArgs[2];
            if (!name) {
              console.log('Usage: npm run device switch <name>');
              process.exit(1);
            }
            switchDevice(name);
            break;
          }

          default:
            console.log('Device commands:');
            console.log('  npm run device add <name>      Create a new device and scan QR');
            console.log('  npm run device list            List all devices');
            console.log('  npm run device remove <name>   Remove a device');
            console.log('  npm run device switch <name>   Switch active device');
            break;
        }
        break;
      }

      case 'warmup': {
        const deviceName = getActiveDeviceName(deviceOverride);

        switch (subCommand) {
          case 'start':
            startWarmup(deviceName);
            break;

          case 'run':
            await runWarmup(deviceName);
            break;

          case 'status':
            showWarmupStatus(deviceName);
            break;

          case 'stop':
            stopWarmup(deviceName);
            break;

          default:
            console.log('Warmup commands:');
            console.log('  npm run warmup start    Initialize warmup');
            console.log('  npm run warmup run      Run a warmup cycle');
            console.log('  npm run warmup status   Show warmup status');
            console.log('  npm run warmup stop     Stop warmup');
            break;
        }
        break;
      }

      default:
        console.log('WhatsApp Prospecting Tool');
        console.log('');
        console.log('Commands:');
        console.log('  npm run scan              Connect WhatsApp (QR code)');
        console.log('  npm run send              Send messages');
        console.log('  npm run status            Check sending status');
        console.log('  npm run convert <file>    Convert audio to Opus');
        console.log('  npm run device <cmd>      Manage devices');
        console.log('  npm run warmup <cmd>      Warmup management');
        console.log('');
        console.log('Global options:');
        console.log('  --device=<name>           Use a specific device');
        break;
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
