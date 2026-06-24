import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { ContentService } from './content.service';

@Controller('content')
export class ContentController {
  constructor(private content: ContentService) {}

  @Public()
  @Get()
  list() {
    return this.content.list();
  }

  @Public()
  @Get(':key')
  page(@Param('key') key: string, @Query('locale') locale?: string) {
    return this.content.page(key, locale === 'en' ? 'en' : 'ru');
  }
}
