import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PromoCodeService {
  constructor(private prisma: PrismaService) { }

  async getPromoCodes(distributorId: string | null, page = 1, limit = 20) {
    const where = distributorId ? { distributorId } : {};
    const skip = (page - 1) * limit;
    const [promoCodes, total] = await Promise.all([
      this.prisma.promoCode.findMany({
        where,
        include: { _count: { select: { usages: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.promoCode.count({ where }),
    ]);

    return {
      data: promoCodes,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createPromoCode(
    distributorId: string,
    data: {
      code: string;
      discountType: 'PERCENT' | 'FIXED';
      discountValue: number;
      minOrderAmount?: number;
      maxUses?: number;
      usesPerClient?: number;
      validFrom?: Date;
      validTo?: Date;
      applicableTo?: any;
    },
  ) {
    // Check if code already exists
    const existing = await this.prisma.promoCode.findUnique({
      where: { code: data.code },
    });

    if (existing) {
      throw new BadRequestException('Promo kod allaqachon mavjud');
    }

    return this.prisma.promoCode.create({
      data: {
        ...data,
        distributorId,
      },
    });
  }

  async updatePromoCode(
    id: string,
    distributorId: string,
    data: {
      discountValue?: number;
      minOrderAmount?: number;
      maxUses?: number;
      usesPerClient?: number;
      validFrom?: Date;
      validTo?: Date;
    },
  ) {
    const promoCode = await this.prisma.promoCode.findFirst({
      where: { id, distributorId },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo kod topilmadi');
    }

    return this.prisma.promoCode.update({
      where: { id },
      data,
    });
  }

  async deletePromoCode(id: string, distributorId: string) {
    const promoCode = await this.prisma.promoCode.findFirst({
      where: { id, distributorId },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo kod topilmadi');
    }

    return this.prisma.promoCode.delete({
      where: { id },
    });
  }

  async validatePromoCode(code: string, clientId: string, orderAmount: number) {
    const promoCode = await this.prisma.promoCode.findUnique({
      where: { code },
      include: {
        usages: {
          where: { clientId },
        },
        _count: {
          select: { usages: true },
        },
      },
    });

    if (!promoCode) {
      throw new NotFoundException('Promo kod topilmadi');
    }

    // Check validity period
    const now = new Date();
    if (promoCode.validFrom && promoCode.validFrom > now) {
      throw new BadRequestException('Promo kod hali faol emas');
    }
    if (promoCode.validTo && promoCode.validTo < now) {
      throw new BadRequestException('Promo kod muddati tugagan');
    }

    // Check minimum order amount
    if (promoCode.minOrderAmount && orderAmount < promoCode.minOrderAmount) {
      throw new BadRequestException(`Minimal buyurtma summasi: ${promoCode.minOrderAmount}`);
    }

    // Check max uses
    if (promoCode.maxUses && promoCode._count.usages >= promoCode.maxUses) {
      throw new BadRequestException('Promo kod limitga yetdi');
    }

    // Check uses per client
    if (promoCode.usages.length >= promoCode.usesPerClient) {
      throw new BadRequestException('Siz bu promo koddan maksimal foydalandingiz');
    }

    // Calculate discount
    let discountAmount = 0;
    if (promoCode.discountType === 'PERCENT') {
      discountAmount = (orderAmount * promoCode.discountValue) / 100;
    } else {
      discountAmount = promoCode.discountValue;
    }

    return {
      valid: true,
      promoCode,
      discountAmount,
      finalAmount: orderAmount - discountAmount,
    };
  }

  async applyPromoCode(promoCodeId: string, clientId: string, orderId: string) {
    return this.prisma.promoUsage.create({
      data: {
        promoCodeId,
        clientId,
        orderId,
      },
    });
  }
}
