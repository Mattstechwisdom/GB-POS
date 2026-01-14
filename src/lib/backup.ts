import * as crypto from 'crypto';
import * as zlib from 'zlib';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export interface BackupData {
  version: string;
  timestamp: string;
  collections: Record<string, any[]>;
}

export interface EncryptedBackup {
  version: string;
  algorithm: string;
  salt: string;
  iv: string;
  tag: string;
  data: string;
  timestamp: string;
}

export interface BackupResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface RestoreResult {
  success: boolean;
  data?: BackupData;
  recordsCount?: number;
  error?: string;
}

/**
 * Derives a key from a password using PBKDF2
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Compresses data using gzip
 */
function compressData(data: string): Buffer {
  return zlib.gzipSync(Buffer.from(data, 'utf8'));
}

/**
 * Decompresses gzipped data
 */
function decompressData(compressedData: Buffer): string {
  return zlib.gunzipSync(compressedData).toString('utf8');
}

/**
 * Encrypts backup data with AES-256-GCM
 */
export function encryptBackupData(backupData: BackupData, password: string): EncryptedBackup {
  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Derive key from password
    const key = deriveKey(password, salt);
    
    // Convert backup data to JSON and compress
    const jsonData = JSON.stringify(backupData);
    const compressedData = compressData(jsonData);
    
    // Encrypt the compressed data
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    cipher.setAAD(Buffer.from('GadgetBoyPOS-Backup-v1'));
    
    const encrypted = Buffer.concat([
      cipher.update(compressedData),
      cipher.final()
    ]);
    
    const tag = cipher.getAuthTag();
    
    // Create encrypted backup structure
    const encryptedBackup: EncryptedBackup = {
      version: '1.0.0',
      algorithm: ALGORITHM,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted.toString('hex'),
      timestamp: new Date().toISOString()
    };
    
    return encryptedBackup;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Encryption failed: ${errorMsg}`);
  }
}

/**
 * Decrypts backup data
 */
export function decryptBackupData(encryptedBackup: EncryptedBackup, password: string): BackupData {
  try {
    // Parse hex values back to buffers
    const salt = Buffer.from(encryptedBackup.salt, 'hex');
    const iv = Buffer.from(encryptedBackup.iv, 'hex');
    const tag = Buffer.from(encryptedBackup.tag, 'hex');
    const encryptedData = Buffer.from(encryptedBackup.data, 'hex');
    
    // Derive key from password
    const key = deriveKey(password, salt);
    
    // Decrypt the data
    const decipher = crypto.createDecipheriv(encryptedBackup.algorithm, key, iv);
    (decipher as any).setAAD(Buffer.from('GadgetBoyPOS-Backup-v1'));
    (decipher as any).setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]);
    
    // Decompress and parse JSON
    const jsonData = decompressData(decrypted);
    const backupData = JSON.parse(jsonData) as BackupData;
    
    return backupData;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('bad decrypt') || errorMsg.includes('authentication')) {
      throw new Error('Invalid password or corrupted backup file');
    }
    throw new Error(`Decryption failed: ${errorMsg}`);
  }
}

/**
 * Validates backup data structure
 */
export function validateBackupData(data: any): data is BackupData {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  if (!data.version || !data.timestamp || !data.collections) {
    return false;
  }
  
  if (typeof data.collections !== 'object') {
    return false;
  }
  
  // Check that collections contain arrays
  for (const [key, value] of Object.entries(data.collections)) {
    if (!Array.isArray(value)) {
      console.warn(`Collection ${key} is not an array`);
      return false;
    }
  }
  
  return true;
}

/**
 * Validates encrypted backup structure
 */
export function validateEncryptedBackup(data: any): data is EncryptedBackup {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  const requiredFields = ['version', 'algorithm', 'salt', 'iv', 'tag', 'data', 'timestamp'];
  for (const field of requiredFields) {
    if (!data[field] || typeof data[field] !== 'string') {
      return false;
    }
  }
  
  return true;
}

/**
 * Counts total records in backup data
 */
export function countBackupRecords(backupData: BackupData): number {
  let total = 0;
  for (const collection of Object.values(backupData.collections)) {
    if (Array.isArray(collection)) {
      total += collection.length;
    }
  }
  return total;
}

/**
 * Generates a backup filename with timestamp
 */
export function generateBackupFilename(): string {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `GadgetBoyPOS-Backup-${timestamp}.gbpos`;
}

/**
 * Creates a backup summary for user display
 */
export function createBackupSummary(backupData: BackupData): string {
  const collections = Object.entries(backupData.collections)
    .map(([name, items]) => `${name}: ${items.length}`)
    .join(', ');
  
  return `Backup created: ${backupData.timestamp} | Records: ${countBackupRecords(backupData)} | Collections: ${collections}`;
}