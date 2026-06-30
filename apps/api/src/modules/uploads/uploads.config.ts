import { BadRequestException } from '@nestjs/common';
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

/** Per-file size cap in bytes (UPLOADS_MAX_FILE_MB, default 25 MB). */
export function maxFileBytes(): number {
  const mb = Number(process.env.UPLOADS_MAX_FILE_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : 25) * 1024 * 1024;
}

// Attachments are user-submitted evidence: photos and short clips. Keep the
// allow-list tight so the disk only ever holds renderable media. The extension
// is derived from the mime type (never trusted from the original filename).
const MIME_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

export const ALLOWED_MIME = Object.keys(MIME_EXT);

/** Multer options for a scope: disk storage, size limit and a mime allow-list. */
export function multerOptionsFor(scope: string) {
  return {
    storage: diskStorage({
      destination: (_req: unknown, _file: unknown, cb: (e: Error | null, dir: string) => void) =>
        cb(null, scopeDir(scope)),
      filename: (_req: unknown, file: { mimetype: string }, cb: (e: Error | null, name: string) => void) =>
        cb(null, `${nanoid()}${MIME_EXT[file.mimetype] ?? ''}`),
    }),
    limits: { fileSize: maxFileBytes() },
    fileFilter: (_req: unknown, file: { mimetype: string }, cb: (e: Error | null, ok: boolean) => void) => {
      if (!ALLOWED_MIME.includes(file.mimetype)) return cb(new BadRequestException('UPLOAD_TYPE_NOT_ALLOWED'), false);
      cb(null, true);
    },
  };
}
