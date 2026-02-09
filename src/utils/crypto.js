/**
 * Elahe Panel - Cryptographic Utilities
 * Connection token generation and validation between Iran/Foreign servers
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

/**
 * Generate a connection token for server-to-server authentication
 */
function generateConnectionToken(serverIp, authKey) {
  const payload = JSON.stringify({
    ip: serverIp,
    key: authKey,
    ts: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(authKey, salt, 32);
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  
  const token = Buffer.concat([
    salt,
    iv,
    tag,
    Buffer.from(encrypted, 'hex'),
  ]).toString('base64url');
  
  return token;
}

/**
 * Decrypt and validate a connection token
 */
function decryptConnectionToken(token, authKey) {
  try {
    const data = Buffer.from(token, 'base64url');
    
    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = data.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    const key = crypto.scryptSync(authKey, salt, 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
  } catch (err) {
    return null;
  }
}

/**
 * Generate auth key pair for server communication
 */
function generateAuthKey() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random password
 */
function generatePassword(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%';
  return Array.from(crypto.randomBytes(length))
    .map(b => chars[b % chars.length])
    .join('');
}

/**
 * Generate subscription token
 */
function generateSubToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Generate X25519 key pair for VLESS Reality
 */
function generateX25519KeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('base64url'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32).toString('base64url'),
  };
}

/**
 * Generate short ID for Reality protocol
 */
function generateShortId() {
  return crypto.randomBytes(8).toString('hex').substring(0, 16);
}

module.exports = {
  generateConnectionToken,
  decryptConnectionToken,
  generateAuthKey,
  generatePassword,
  generateSubToken,
  generateX25519KeyPair,
  generateShortId,
};
