import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { RegisterDto } from './register.dto';

export class VerifyOtpDto extends RegisterDto {
  @ApiProperty({ description: 'Telegram botdan olingan 6 xonali kod', example: '123456' })
  @IsString()
  @MinLength(6)
  code: string;
}
