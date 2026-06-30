import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { UPLOADS_PUBLIC_PREFIX, uploadsRoot } from './uploads.config';

/**
 * Thin service over the local upload store: build public URLs, resolve safe
 * absolute paths and delete files. Storage-agnostic callers (Support, Admin)
 * depend on this rather than on Multer/fs directly.
 */
@Injectable()
export class UploadsService {
  private readonly log = new Logger(UploadsService.name);

  /** Public URL for a stored file, e.g. "/api/uploads/support/abc.jpg". */
  publicUrl(scope: string, filename: string): string {
    return `${UPLOADS_PUBLIC_PREFIX}/${scope}/${filename}`;
  }

  /** Absolute path for (scope, filename), or null if it would escape the root. */
  resolve(scope: string, filename: string): string | null {
    const root = uploadsRoot();
    const abs = path.join(root, path.basename(scope), path.basename(filename));
    // Defense-in-depth against traversal: must stay under the uploads root.
    if (abs !== root && !abs.startsWith(root + path.sep)) return null;
    return abs;
  }

  /** Delete a file by its public URL (no-op if missing). True if removed. */
  removeByPublicUrl(url?: string | null): boolean {
    if (!url) return false;
    const marker = `${UPLOADS_PUBLIC_PREFIX}/`;
    const i = url.indexOf(marker);
    if (i < 0) return false;
    const [scope, ...rest] = url.slice(i + marker.length).split('/');
    const filename = rest.join('/');
    if (!scope || !filename) return false;
    const abs = this.resolve(scope, filename);
    if (!abs) return false;
    try {
      fs.rmSync(abs, { force: true });
      return true;
    } catch (e) {
      this.log.warn(`failed to remove upload ${abs}: ${String(e)}`);
      return false;
    }
  }
}
