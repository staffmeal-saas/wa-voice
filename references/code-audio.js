// src/lib/audio.js
// Conversion et gestion audio

import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const AUDIO_FOLDER = join(__dirname, '../../audio');
const DEFAULT_AUDIO_FILE = join(AUDIO_FOLDER, 'message.opus');
const ACCEPTED_FORMATS = ['.aac', '.m4a', '.opus', '.ogg', '.mp3', '.wav'];
const MAX_VOICE_DURATION = 300; // 5 minutes

/**
 * Convertit un fichier audio en format OGG/Opus pour WhatsApp (message vocal)
 */
export async function convertToOpus(inputPath, outputPath = null) {
  if (!existsSync(inputPath)) {
    throw new Error(`Fichier introuvable: ${inputPath}`);
  }

  const output = outputPath || inputPath.replace(/\.[^.]+$/, '.opus');

  try {
    await execAsync('ffmpeg -version');
  } catch (error) {
    throw new Error('ffmpeg est requis. Installation: brew install ffmpeg');
  }

  // IMPORTANT: -application voip est nécessaire pour afficher la waveform
  const command = `ffmpeg -i "${inputPath}" -c:a libopus -b:a 24k -ac 1 -ar 48000 -application voip -y "${output}"`;

  try {
    await execAsync(command);
    return output;
  } catch (error) {
    throw new Error(`Erreur de conversion: ${error.message}`);
  }
}

export function isAcceptedFormat(filePath) {
  const ext = filePath.toLowerCase();
  return ACCEPTED_FORMATS.some(format => ext.endsWith(format));
}

export async function getAudioMetadata(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Fichier introuvable: ${filePath}`);
  }

  try {
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration,size,format_name -of json "${filePath}"`);
    const metadata = JSON.parse(stdout);
    const format = metadata.format;

    return {
      duration: parseFloat(format.duration) || 0,
      size: parseInt(format.size) || 0,
      format: format.format_name,
      sizeMB: (parseInt(format.size) / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    const stats = statSync(filePath);
    return {
      duration: 0,
      size: stats.size,
      format: 'unknown',
      sizeMB: (stats.size / 1024 / 1024).toFixed(2)
    };
  }
}

export async function prepareAudioForWhatsApp(sourcePath) {
  let targetPath = sourcePath;

  if (!isAcceptedFormat(sourcePath)) {
    console.log(`⚠️ Format non supporté, conversion vers Opus...`);
    targetPath = await convertToOpus(sourcePath);
    console.log(`✅ Converti: ${targetPath}`);
  } else if (sourcePath.endsWith('.aac') || sourcePath.endsWith('.m4a') || sourcePath.endsWith('.mp3') || sourcePath.endsWith('.wav')) {
    console.log(`⚠️ Conversion vers Opus pour message vocal (waveform)...`);
    targetPath = await convertToOpus(sourcePath);
    console.log(`✅ Converti: ${targetPath}`);
  } else if (!sourcePath.endsWith('.opus')) {
    console.log(`⚠️ Conversion vers Opus optimisé...`);
    targetPath = await convertToOpus(sourcePath);
    console.log(`✅ Converti: ${targetPath}`);
  }

  const metadata = await getAudioMetadata(targetPath);

  if (metadata.duration > MAX_VOICE_DURATION) {
    console.warn(`⚠️ Le message vocal est long (${metadata.duration}s).`);
  }

  return {
    path: targetPath,
    ...metadata,
    ready: true
  };
}

export function readAudioBuffer(filePath) {
  return readFileSync(filePath);
}

export function getMimeType(filePath) {
  const ext = filePath.toLowerCase();
  const mimeTypes = {
    '.opus': 'audio/ogg; codecs=opus',  // Requis pour PTT (waveform)
    '.ogg': 'audio/ogg; codecs=opus',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav'
  };

  for (const [extension, mimeType] of Object.entries(mimeTypes)) {
    if (ext.endsWith(extension)) {
      return mimeType;
    }
  }
  return 'audio/ogg';
}

export async function checkFFmpeg() {
  try {
    await execAsync('ffmpeg -version');
    return true;
  } catch {
    return false;
  }
}

export default {
  convertToOpus,
  isAcceptedFormat,
  getAudioMetadata,
  prepareAudioForWhatsApp,
  readAudioBuffer,
  getMimeType,
  checkFFmpeg
};
