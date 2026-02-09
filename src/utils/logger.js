/**
 * Elahe Panel - Logger Utility
 */

const fs = require('fs');
const path = require('path');
const config = require('../config/default');

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'info'];

function ensureLogDir() {
  if (!fs.existsSync(config.paths.logs)) {
    fs.mkdirSync(config.paths.logs, { recursive: true });
  }
}

function formatMessage(level, module, message, data) {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}${dataStr}`;
}

function writeLog(level, module, message, data) {
  if (LOG_LEVELS[level] > currentLevel) return;
  
  const formatted = formatMessage(level, module, message, data);
  
  // Console output with colors
  const colors = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', debug: '\x1b[90m' };
  console.log(`${colors[level]}${formatted}\x1b[0m`);
  
  // File output
  try {
    ensureLogDir();
    const logFile = path.join(config.paths.logs, `elahe-${new Date().toISOString().split('T')[0]}.log`);
    fs.appendFileSync(logFile, formatted + '\n');
  } catch (e) {
    // Silently fail file logging
  }
}

function createLogger(module) {
  return {
    error: (msg, data) => writeLog('error', module, msg, data),
    warn: (msg, data) => writeLog('warn', module, msg, data),
    info: (msg, data) => writeLog('info', module, msg, data),
    debug: (msg, data) => writeLog('debug', module, msg, data),
  };
}

module.exports = { createLogger };
