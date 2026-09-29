import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { env } from './env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Controlled secure storage directory outside public asset web roots
export const UPLOAD_DIR = path.resolve(__dirname, '../../storage/uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Allowed extensions and corresponding MIME types
const ALLOWED_MIME_TYPES = {
  // Documents
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.txt': ['text/plain'],
  // Spreadsheets
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.csv': ['text/csv', 'application/csv', 'text/plain'],
  // Images
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
};

// Dangerous extensions explicitly blocked
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.js', '.mjs', '.cjs',
  '.py', '.php', '.phtml', '.pl', '.vbs', '.scr', '.msi', '.com',
  '.jar', '.bin', '.wsf', '.dll', '.app',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique cryptographically random filename with safe extension
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ALLOWED_MIME_TYPES[ext] ? ext : '';
    const uniqueId = crypto.randomUUID();
    const storedName = `${Date.now()}_${uniqueId}${safeExt}`;
    cb(null, storedName);
  },
});

const fileFilter = (req, file, cb) => {
  // 1. Path traversal / malicious filename check
  const rawExt = path.extname(file.originalname).toLowerCase();
  if (!rawExt || BLOCKED_EXTENSIONS.has(rawExt)) {
    const err = new Error('Blocked file extension. Executable and script files are strictly prohibited.');
    err.statusCode = 400;
    return cb(err);
  }

  // 2. Validate BOTH extension and MIME type
  const allowedMimes = ALLOWED_MIME_TYPES[rawExt];
  if (!allowedMimes) {
    const err = new Error(`Unsupported file extension: ${rawExt}. Only standard business documents and images are permitted.`);
    err.statusCode = 400;
    return cb(err);
  }

  const mime = file.mimetype.toLowerCase();
  if (!allowedMimes.includes(mime)) {
    const err = new Error(`MIME type mismatch for ${rawExt}: detected ${file.mimetype}. Upload rejected.`);
    err.statusCode = 400;
    return cb(err);
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter,
});

/**
 * Clean up physical file on disk (orphan protection during DB failure or deletion)
 */
export const deletePhysicalFile = async (filePath) => {
  try {
    if (!filePath) return;
    const resolvedPath = path.resolve(filePath);

    // Path traversal check: must stay within UPLOAD_DIR
    if (!resolvedPath.startsWith(UPLOAD_DIR)) {
      console.error(`[SECURITY ERROR] Attempted deletion outside upload directory: ${resolvedPath}`);
      return;
    }

    if (fs.existsSync(resolvedPath)) {
      await fs.promises.unlink(resolvedPath);
    }
  } catch (err) {
    console.error(`[STORAGE CLEANUP ERROR] Failed to delete physical file: ${err.message}`);
  }
};
