import { BadRequestException, Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import { Public } from '../../common/decorators/public.decorator';
import { UploadsService } from './uploads.service';

const SCOPE_RE = /^[a-z0-9_-]+$/i;
const FILE_RE = /^[a-z0-9_-]+\.[a-z0-9]+$/i;

/**
 * Serves uploaded files off local disk. Mounted under the global "/api" prefix,
 * so files live at /api/uploads/:scope/:filename — which means the existing
 * nginx and Vite "/api" proxies forward them for free (no extra rules).
 */
@Controller('uploads')
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  // Public so <img>/<video> tags load without an auth header. Filenames are
  // unguessable (nanoid) and the route only ever serves files under the root.
  @Public()
  @Get(':scope/:filename')
  serve(@Param('scope') scope: string, @Param('filename') filename: string, @Res() res: Response) {
    if (!SCOPE_RE.test(scope) || !FILE_RE.test(filename)) throw new BadRequestException('BAD_PATH');
    const abs = this.uploads.resolve(scope, filename);
    if (!abs || !fs.existsSync(abs)) throw new NotFoundException('FILE_NOT_FOUND');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.sendFile(abs);
  }
}
