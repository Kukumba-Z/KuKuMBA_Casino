import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KycService } from './kyc.service';

class SubmitKycDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() country?: string;
}
class AddDocDto {
  @IsIn(['passport', 'id_card', 'selfie', 'proof_of_address']) kind: string;
  @IsString() fileUrl: string;
}

@Controller('kyc')
export class KycController {
  constructor(private kyc: KycService) {}

  @Get()
  status(@CurrentUser('id') userId: string) {
    return this.kyc.status(userId);
  }

  @Post('submit')
  submit(@CurrentUser('id') userId: string, @Body() dto: SubmitKycDto) {
    return this.kyc.submit(userId, dto);
  }

  @Post('documents')
  addDoc(@CurrentUser('id') userId: string, @Body() dto: AddDocDto) {
    return this.kyc.addDocument(userId, dto.kind, dto.fileUrl);
  }
}
