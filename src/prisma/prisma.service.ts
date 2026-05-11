import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();

    // Middleware: Auto-generate customerCode for new clients
    this.$use(async (params, next) => {
      if (params.model === 'Client' && params.action === 'create') {
        // Check if customerCode is not provided
        if (!params.args.data.customerCode) {
          params.args.data.customerCode = await this.generateCustomerCode();
        }
      }
      return next(params);
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Generate unique 6-digit customer code
  private async generateCustomerCode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await this.client.findUnique({
        where: { customerCode: code },
      });

      if (!existing) {
        return code;
      }

      attempts++;
    }

    // Fallback: use timestamp-based code if random fails
    return `C${Date.now().toString().slice(-6)}`;
  }
}
