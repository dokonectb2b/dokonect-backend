import { Injectable, BadRequestException, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../../prisma/prisma.service';

interface StoreEntry {
  value: string;
  expiresAt: number;
}

@Injectable()
export class OtpService implements OnModuleInit, OnModuleDestroy {
  private botToken: string;
  private botUsername: string;
  private miniAppUrl: string;
  private customerMiniAppUrl: string;

  private otpMap  = new Map<string, StoreEntry>(); // phone → { code, expiresAt }
  private sentMap = new Map<string, number>();      // phone → rateLimitExpiresAt

  private pollOffset = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.botToken          = config.get<string>('TELEGRAM_BOT_TOKEN')       ?? '';
    this.botUsername       = config.get<string>('TELEGRAM_BOT_USERNAME')    ?? 'dokonect_bot';
    this.miniAppUrl        = config.get<string>('MINI_APP_URL')             ?? 'https://dokonect-frontend-seven.vercel.app/driver/tg-auth';
    this.customerMiniAppUrl= config.get<string>('CUSTOMER_MINI_APP_URL')   ?? 'https://dokonect-frontend-seven.vercel.app/store/tg-auth';
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async onModuleInit() {
    if (!this.botToken) return;
    try { await axios.post(`https://api.telegram.org/bot${this.botToken}/deleteWebhook`); } catch { /* ignore */ }
    this.pollTimer = setInterval(() => this.poll(), 30000);
    // Eskirgan OTP va rate-limit yozuvlarini har 10 daqiqada tozalash
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of this.otpMap)  if (now > v.expiresAt)    this.otpMap.delete(k);
      for (const [k, v] of this.sentMap) if (now > v)              this.sentMap.delete(k);
    }, 10 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  private async poll() {
    try {
      const res = await axios.get(
        `https://api.telegram.org/bot${this.botToken}/getUpdates`,
        { params: { offset: this.pollOffset, timeout: 25 }, timeout: 30000 },
      );
      const updates: any[] = res.data?.result ?? [];
      for (const update of updates) {
        try {
          await this.handleWebhookUpdate(update);
        } catch { /* individual update xatosi butun pollni to'xtatmasin */ }
        this.pollOffset = update.update_id + 1;
      }
    } catch { /* network xatolarini e'tiborsiz qoldir */ }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('998') ? `+${digits}` : `+998${digits}`;
  }

  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  storeOtp(phone: string, code: string): void {
    this.otpMap.set(phone, { value: code, expiresAt: Date.now() + 300_000 }); // 5 min
  }

  verifyOtp(phone: string, code: string): boolean {
    const normalized = this.normalizePhone(phone);
    const entry = this.otpMap.get(normalized);
    if (!entry || Date.now() > entry.expiresAt || entry.value !== code) return false;
    this.otpMap.delete(normalized);
    return true;
  }

  isRateLimited(phone: string): boolean {
    const normalized = this.normalizePhone(phone);
    const expiresAt = this.sentMap.get(normalized);
    if (expiresAt && Date.now() < expiresAt) return true;
    this.sentMap.set(normalized, Date.now() + 60_000); // 60 soniya
    return false;
  }

  // ─── DB: chatId saqlash ───────────────────────────────────────────────────────

  async getChatId(phone: string): Promise<string | null> {
    const row = await this.prisma.telegramChatMapping.findUnique({
      where: { phone: this.normalizePhone(phone) },
    });
    return row?.chatId ?? null;
  }

  async storeChatId(phone: string, chatId: string): Promise<void> {
    const normalized = this.normalizePhone(phone);
    await this.prisma.telegramChatMapping.upsert({
      where:  { phone: normalized },
      update: { chatId },
      create: { phone: normalized, chatId },
    });
  }

  // ─── Telegram API ─────────────────────────────────────────────────────────────

  private async tgPost(method: string, body: Record<string, any>): Promise<void> {
    await axios.post(`https://api.telegram.org/bot${this.botToken}/${method}`, body);
  }

  // Ro'yxatdan o'tish uchun "Telefon raqamni ulashish" klaviaturasi
  private async sendContactKeyboard(chatId: string): Promise<void> {
    await this.tgPost('sendMessage', {
      chat_id: chatId,
      text:
        `Salom! 👋\n\n` +
        `<b>Dokonect</b> ga ro'yxatdan o'tish uchun quyidagi tugmani bosib telefon raqamingizni ulashing.\n\n` +
        `Telefon raqamingiz avtomatik tekshiriladi va tasdiqlash kodi yuboriladi.`,
      parse_mode: 'HTML',
      reply_markup: {
        keyboard: [[{ text: '📱 Telefon raqamni ulashish', request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  // Customer (do'kon) uchun Mini App tugmasi
  private async sendCustomerAppButton(chatId: string, name: string): Promise<void> {
    await this.tgPost('sendMessage', {
      chat_id: chatId,
      text:
        `✅ <b>Xush kelibsiz, ${name}!</b>\n\n` +
        `🛒 Siz do'kon egasi sifatida ro'yxatdan o'tgansiz.\n\n` +
        `Ilovani ochish uchun quyidagi tugmani bosing:`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🛒 Do\'kon Ilovasini Ochish', web_app: { url: this.customerMiniAppUrl } },
        ]],
      },
    });
  }

  // Driver uchun Mini App tugmasi
  private async sendDriverAppButton(chatId: string, driverName: string): Promise<void> {
    await this.tgPost('sendMessage', {
      chat_id: chatId,
      text:
        `✅ <b>Xush kelibsiz, ${driverName}!</b>\n\n` +
        `🚗 Siz haydovchi sifatida ro'yxatdan o'tgansiz.\n\n` +
        `Ilovani ochish uchun quyidagi tugmani bosing:`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🚀 Driver Ilovasini Ochish', web_app: { url: this.miniAppUrl } },
        ]],
      },
    });
  }

  // OTP yuborish va klaviaturani yashirish
  private async sendOtpMessage(chatId: string, phone: string, code: string): Promise<void> {
    await this.tgPost('sendMessage', {
      chat_id: chatId,
      text:
        `✅ <b>Telefon tasdiqlandi!</b>\n\n` +
        `📱 Telefon: <code>${phone}</code>\n\n` +
        `🔐 Tasdiqlash kodi: <code>${code}</code>\n\n` +
        `⏱ Kod <b>5 daqiqa</b> ichida amal qiladi.\n` +
        `Bu kodni hech kimga bermang.\n\n` +
        `<i>Saytga qaytib kodni kiriting va ro'yxatdan o'ting.</i>`,
      parse_mode: 'HTML',
      reply_markup: { remove_keyboard: true },
    });
  }

  // ─── Ro'yxatdan o'tgandan so'ng bot xabari ───────────────────────────────────

  async notifyAfterRegistration(phone: string, name: string, role: 'CLIENT' | 'DRIVER'): Promise<void> {
    const chatId = await this.getChatId(this.normalizePhone(phone));
    if (!chatId) return;
    if (role === 'CLIENT') await this.sendCustomerAppButton(chatId, name);
    else if (role === 'DRIVER') await this.sendDriverAppButton(chatId, name);
  }

  // ─── OTP yaratish va yuborish ─────────────────────────────────────────────────

  private async generateAndSendOtp(chatId: string, phone: string): Promise<void> {
    const code = this.generateCode();
    this.storeOtp(phone, code);
    this.sentMap.set(phone, Date.now() + 60_000);
    await this.sendOtpMessage(chatId, phone, code);
  }

  // Saytdan "Qayta yuborish" bosilganda
  async sendOtp(phone: string): Promise<{ botUsername: string }> {
    const chatId = await this.getChatId(phone);

    if (!chatId) {
      throw new BadRequestException(
        `Avval @${this.botUsername} botini oching va telefon raqamingizni ulashing`,
      );
    }

    if (this.isRateLimited(phone)) {
      throw new BadRequestException('Kod allaqachon yuborildi. 60 soniya kuting');
    }

    await this.generateAndSendOtp(chatId, this.normalizePhone(phone));
    return { botUsername: this.botUsername };
  }

  // ─── Telegram update handler ──────────────────────────────────────────────────

  async handleWebhookUpdate(update: any): Promise<void> {
    const msg = update?.message;
    if (!msg) return;

    const chatId = String(msg.chat.id);

    // 1) Foydalanuvchi telefon raqamini ulashdi
    if (msg.contact) {
      const rawPhone = msg.contact.phone_number;
      const phone = this.normalizePhone(rawPhone);

      const existingUser = await this.prisma.user.findFirst({ where: { phone } });

      if (existingUser) {
        // Driver bo'lsa — Driver Mini App tugmasi
        if (existingUser.role === 'DRIVER') {
          await this.storeChatId(phone, chatId);
          await this.sendDriverAppButton(chatId, existingUser.name);
          return;
        }

        // Client/do'kon bo'lsa — Customer Mini App tugmasi
        if (existingUser.role === 'CLIENT') {
          await this.storeChatId(phone, chatId);
          await this.sendCustomerAppButton(chatId, existingUser.name);
          return;
        }

        // Boshqa rol — allaqachon ro'yxatdan o'tgan
        await this.tgPost('sendMessage', {
          chat_id: chatId,
          text:
            `⚠️ <b>Bu raqam allaqachon ro'yxatdan o'tgan!</b>\n\n` +
            `📱 <code>${phone}</code>\n\n` +
            `Agar bu sizning raqamingiz bo'lsa, saytda <b>Kirish</b> sahifasidan foydalaning.`,
          parse_mode: 'HTML',
          reply_markup: { remove_keyboard: true },
        });
        return;
      }

      // Yangi foydalanuvchi — OTP yuboriladi
      await this.storeChatId(phone, chatId);
      await this.generateAndSendOtp(chatId, phone);
      return;
    }

    const text: string = msg.text || '';

    // 2) /start komandasi
    if (text.startsWith('/start')) {
      // Agar bu chatId allaqachon driver bo'lsa — to'g'ridan app button
      const mapping = await this.prisma.telegramChatMapping.findFirst({ where: { chatId } });
      if (mapping) {
        const user = await this.prisma.user.findFirst({ where: { phone: mapping.phone } });
        if (user?.role === 'DRIVER') {
          await this.sendDriverAppButton(chatId, user.name);
          return;
        }
        if (user?.role === 'CLIENT') {
          await this.sendCustomerAppButton(chatId, user.name);
          return;
        }
      }

      // Yangi yoki boshqa foydalanuvchi — standart klaviatura
      await this.sendContactKeyboard(chatId);
      return;
    }

    // 3) Fallback: qo'lda raqam yozilsa
    const phoneMatch = text.match(/(\+?998\d{9})/);
    if (phoneMatch) {
      const phone = this.normalizePhone(phoneMatch[1]);

      const existingUser = await this.prisma.user.findFirst({ where: { phone } });
      if (existingUser) {
        if (existingUser.role === 'DRIVER') {
          await this.storeChatId(phone, chatId);
          await this.sendDriverAppButton(chatId, existingUser.name);
          return;
        }
        if (existingUser.role === 'CLIENT') {
          await this.storeChatId(phone, chatId);
          await this.sendCustomerAppButton(chatId, existingUser.name);
          return;
        }
        await this.tgPost('sendMessage', {
          chat_id: chatId,
          text:
            `⚠️ <b>Bu raqam allaqachon ro'yxatdan o'tgan!</b>\n\n` +
            `📱 <code>${phone}</code>\n\n` +
            `Agar bu sizning raqamingiz bo'lsa, saytda <b>Kirish</b> sahifasidan foydalaning.`,
          parse_mode: 'HTML',
        });
        return;
      }

      await this.storeChatId(phone, chatId);
      await this.generateAndSendOtp(chatId, phone);
    }
  }
}
