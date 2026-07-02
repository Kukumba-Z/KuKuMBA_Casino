import { diskStorage } from 'multer';
import { nanoid } from 'nanoid';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared upload configuration — everything env-driven so paths, size limits and
 * the public mount can change without touching code. Two concerns live here:
 *  1. where files land on disk (UPLOADS_DIR + a per-feature "scope" subfolder),
 *  2. how they are reached over HTTP (UPLOADS_PUBLIC_PREFIX).
 */

/** Minimal shape of a Multer file we use (keeps us off a @types/multer dep). */
export interface UploadedFileLike {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  filename: string;
  path: string;
  destination: string;
}

// The API runs under the global "/api" prefix and serves files from
// UploadsController, so the default mirrors that route. Overridable so a CDN or
// a different mount point can be slotted in without code changes.
export const UPLOADS_PUBLIC_PREFIX = (process.env.UPLOADS_PUBLIC_PREFIX || '/api/uploads').replace(/\/+$/, '');

/** Filesystem root for all uploads. Docker mounts a persistent volume here. */
export function uploadsRoot(): string {
  return path.resolve(process.env.UPLOADS_DIR || path.join(process.cwd(), 'uploads'));
}

/** Absolute directory for a scope (e.g. "support"), created on demand. */
export function scopeDir(scope: string): string {
  const dir = path.join(uploadsRoot(), path.basename(scope));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Per-file size cap in bytes (UPLOADS_MAX_FILE_MB, default 50 MB). */
export function maxFileBytes(): number {
  const mb = Number(process.env.UPLOADS_MAX_FILE_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 50) * 1024 * 1024;
}

// Extensions the file-serving route may render inline (media previews). Anything
// else is forced to download — an .html/.svg rendered on the API origin could
// run scripts (XSS), so only inert media ever displays in the browser.
export const INLINE_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.mp4', '.webm', '.mov',
  '.mp3', '.wav', '.ogg', '.m4a',
]);

/**
 * Stored-file extension, derived from the client's filename but never trusted:
 * short alphanumeric extensions pass through (lowercased), anything odd becomes
 * ".bin". The stored basename is always a fresh nanoid.
 */
export function safeExt(originalname: string): string {
  const ext = path.extname(originalname || '').toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.bin';
}

/**
 * Human filename to show players / send in Content-Disposition. Multer decodes
 * originalname as latin1, so Cyrillic (any UTF-8) names arrive mangled — re-decode
 * first, then strip path separators and control characters.
 */
export function displayName(originalname: string): string {
  const utf8 = Buffer.from(originalname || '', 'latin1').toString('utf8');
  const clean = utf8.replace(/[/\\]/g, '_').replace(/[\x00-\x1f"';]/g, '').trim();
  return (clean || 'file').slice(0, 140);
}

/**
 * Multer options for a scope: disk storage under the scope dir and the size cap.
 * Any file type is accepted — support attachments can be logs, archives, docs.
 * Safety lives at serving time (inline whitelist + forced download), not here.
 */
export function multerOptionsFor(scope: string) {
  return {
    storage: diskStorage({
      destination: (_req: unknown, _file: unknown, cb: (e: Error | null, dir: string) => void) =>
        cb(null, scopeDir(scope)),
      filename: (_req: unknown, file: { originalname: string }, cb: (e: Error | null, name: string) => void) =>
        cb(null, `${nanoid()}${safeExt(file.originalname)}`),
    }),
    limits: { fileSize: maxFileBytes() },
  };
}
