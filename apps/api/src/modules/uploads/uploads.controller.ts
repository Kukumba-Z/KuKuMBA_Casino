import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { Public } from '../../common/decorators/public.decorator';
import { INLINE_EXT } from './uploads.config';
import { UploadsService } from './uploads.service';

const SCOPE_RE = /^[a-z0-9_-]+$/i;
const FILE_RE = /^[a-z0-9_-]+\.[a-z0-9]+$/i;

/**
 * Serves uploaded files off local disk. Mounted under the global "/api" prefix,
 * so files live at /api/uploads/:scope/:filename — which means the existing
 * nginx and Vite "/api" proxies forward them for free (no extra rules).
 *
 * Any file type may be stored, so serving is strict: only inert media (images/
 * video/audio) renders inline; everything else is a forced download — an .html
 * or .svg rendered on the API origin could run scripts. `?name=` restores the
 * uploader's original filename on download.
 */
@Controller('uploads')
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  // Public so <img>/<video> tags load without an auth header. Filenames are
  // unguessable (nanoid) and the route only ever serves files under the root.
  @Public()
  @Get(':scope/:filename')
  serve(
    @Param('scope') scope: string,
    @Param('filename') filename: string,
    @Res() res: Response,
    @Query('name') name?: string,
  ) {
    if (!SCOPE_RE.test(scope) || !FILE_RE.test(filename)) throw new BadRequestException('BAD_PATH');
    const abs = this.uploads.resolve(scope, filename);
    if (!abs || !fs.existsSync(abs)) throw new NotFoundException('FILE_NOT_FOUND');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (INLINE_EXT.has(path.extname(filename).toLowerCase())) {
      res.sendFile(abs);
      return;
    }
    // Non-media: always download, restoring a sanitised original name if given.
    const download = (name || filename).replace(/[/\\\x00-\x1f"';]/g, '').trim() || filename;
    res.download(abs, download);
  }
}
