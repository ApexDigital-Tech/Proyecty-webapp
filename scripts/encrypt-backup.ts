import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const BACKUP_FILE = 'respaldo_usuarios_2026-08-25T16-01-41-968Z.json';
const ENCRYPTED_FILE = 'respaldo_usuarios_2026-08-25T16-01-41-968Z.json.enc';

async function main() {
  if (!fs.existsSync(BACKUP_FILE)) {
    console.error(`Backup file ${BACKUP_FILE} not found!`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(BACKUP_FILE, 'utf-8');
  const rawHash = crypto.createHash('sha256').update(rawData).digest('hex').toUpperCase();

  // Generate AES-256 key from a secure secret or machine-derived secret
  const secretKey = process.env.BACKUP_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
  const keyBuffer = crypto.scryptSync(secretKey, 'proyecty-backup-salt-2026', 32);
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  let encrypted = cipher.update(rawData, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  const payload = {
    algorithm: 'aes-256-gcm',
    iv: iv.toString('hex'),
    authTag,
    encryptedData: encrypted,
    originalSha256: rawHash,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(ENCRYPTED_FILE, JSON.stringify(payload, null, 2), 'utf-8');

  // Verify decryption test
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  let decrypted = decipher.update(payload.encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  const decryptedHash = crypto.createHash('sha256').update(decrypted).digest('hex').toUpperCase();
  if (decryptedHash !== rawHash) {
    throw new Error('Integrity verification failed during backup encryption test!');
  }

  console.log(`[Backup Encryption] Successfully encrypted backup with AES-256-GCM.`);
  console.log(`[Backup Encryption] Original SHA-256: ${rawHash}`);
  console.log(`[Backup Encryption] Decryption self-test: PASSED (Hashes match 100%)`);
  console.log(`[Backup Encryption] Output file: ${ENCRYPTED_FILE}`);
}

main().catch(err => {
  console.error('Encryption failed:', err);
  process.exit(1);
});
