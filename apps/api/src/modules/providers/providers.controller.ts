import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { LaunchGameDto } from './dto/callbacks.dto';
import { ProvidersService } from './providers.service';

/** Player-facing: launch an external provider game (JWT-authenticated). */
@Controller('providers')
export class ProvidersController {
  constructor(private providers: ProvidersService) {}

  @Post('launch')
  launch(@CurrentUser('id') userId: string, @Body() dto: LaunchGameDto) {
    return this.providers.launch(userId, dto);
  }
}
