import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { RegisterDto, LoginDto, SendOtpDto, VerifyOtpDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private otpService: OtpService,
  ) {}

  @Post('register')
  @ApiOperation({ summary: "Ro'yxatdan o'tish (OTPsiz — admin uchun)" })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('send-otp')
  @ApiOperation({ summary: 'Telegram botga OTP yuborish' })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.phone);
  }

  @Post('verify-register')
  @ApiOperation({ summary: 'OTP tasdiqlash va ro\'yxatdan o\'tish' })
  verifyRegister(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtpAndRegister(dto);
  }

  @Post('telegram-webhook')
  @ApiOperation({ summary: 'Telegram bot webhook (faqat Telegram uchun)' })
  telegramWebhook(@Body() update: any) {
    this.otpService.handleWebhookUpdate(update).catch(() => null);
    return { ok: true };
  }

  @Post('telegram-driver')
  @ApiOperation({ summary: 'Telegram Mini App orqali driver autentifikatsiyasi' })
  telegramDriverAuth(@Body() body: { initData: string; phone?: string }) {
    return this.authService.telegramDriverAuth(body.initData, body.phone);
  }

  @Post('telegram-client')
  @ApiOperation({ summary: 'Telegram Mini App orqali client/do\'kon autentifikatsiyasi' })
  telegramClientAuth(@Body() body: { initData: string; phone?: string }) {
    return this.authService.telegramClientAuth(body.initData, body.phone);
  }

  @Post('login')
  @ApiOperation({ summary: 'Tizimga kirish' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh-token')
  @ApiOperation({ summary: 'Access token yangilash' })
  refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshAccessToken(refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Joriy foydalanuvchi ma'lumotlari" })
  getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }
}
