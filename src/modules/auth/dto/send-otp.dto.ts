import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({ example: '+998901234567' })
  @IsString()
  phone: string;
}
