import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Check if ffmpeg is installed
 */
export function checkFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert an audio file to Opus format suitable for WhatsApp voice notes.
 * Uses: Opus codec, 24kbps, mono, 48kHz, voip application mode
 *
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path for output .opus file (optional)
 * @returns {string} Path to the converted file
 */
export function convertToOpus(inputPath, outputPath) {
  if (!checkFfmpeg()) {
    throw new Error('ffmpeg is not installed. Install it with: brew install ffmpeg');
  }

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  if (!outputPath) {
    const ext = path.extname(inputPath);
    outputPath = inputPath.replace(ext, '.opus');
  }

  const cmd = `ffmpeg -i "${inputPath}" -c:a libopus -b:a 24k -ac 1 -ar 48000 -application voip -y "${outputPath}"`;

  try {
    execSync(cmd, { stdio: 'pipe' });
    console.log(`Converted: ${inputPath} -> ${outputPath}`);
    return outputPath;
  } catch (err) {
    throw new Error(`Conversion failed: ${err.message}`);
  }
}

/**
 * Get audio file duration in seconds
 */
export function getAudioDuration(filePath) {
  if (!checkFfmpeg()) return null;
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { stdio: 'pipe' }
    );
    return Math.ceil(parseFloat(result.toString().trim()));
  } catch {
    return null;
  }
}

/**
 * Read an audio file and return buffer with metadata for Baileys
 */
export function readAudioForSending(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Audio file not found: ${filePath}`);
  }

  const buffer = fs.readFileSync(filePath);
  const duration = getAudioDuration(filePath);
  const mimetype = filePath.endsWith('.opus')
    ? 'audio/ogg; codecs=opus'
    : 'audio/mpeg';

  return {
    buffer,
    mimetype,
    ptt: true, // voice note flag
    seconds: duration || undefined
  };
}
