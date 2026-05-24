import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PricingService {
  constructor(private prisma: PrismaService) {}

  // Price Rules (Client-specific pricing)
  async getPriceRules(distributorId: string, productId?: string) {
    const where: any = {
      product: { distributorId },
    };

    if (productId) {
      where.productId = productId;
    }

    return this.prisma.priceRule.findMany({
      where,
      include: {
        product: true,
        client: {
          include: {
            user: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPriceRule(
    distributorId: string,
    data: {
      productId: string;
      variantId?: string;
      clientId?: string;
      price: number;
      validFrom?: Date;
      validTo?: Date;
    },
  ) {
    // Verify product belongs to distributor
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, distributorId },
    });

    if (!product) {
      throw new NotFoundException('Mahsulot topilmadi');
    }

    return this.prisma.priceRule.create({
      data,
    });
  }

  async updatePriceRule(
    id: string,
    distributorId: string,
    data: {
      price?: number;
      validFrom?: Date;
      validTo?: Date;
    },
  ) {
    const priceRule = await this.prisma.priceRule.findFirst({
      where: {
        id,
        product: { distributorId },
      },
    });

    if (!priceRule) {
      throw new NotFoundException('Narx qoidasi topilmadi');
    }

    return this.prisma.priceRule.update({
      where: { id },
      data,
    });
  }

  async deletePriceRule(id: string, distributorId: string) {
    const priceRule = await this.prisma.priceRule.findFirst({
      where: {
        id,
        product: { distributorId },
      },
    });

    if (!priceRule) {
      throw new NotFoundException('Narx qoidasi topilmadi');
    }

    return this.prisma.priceRule.delete({
      where: { id },
    });
  }

  // Bulk Rules (Quantity-based pricing)
  async getBulkRules(distributorId: string, productId?: string, page = 1, limit = 20) {
    const where: any = { product: { distributorId } };
    if (productId) where.productId = productId;

    const skip = (page - 1) * limit;
    const [rules, total] = await Promise.all([
      this.prisma.bulkRule.findMany({
        where,
        include: { product: true },
        orderBy: { minQuantity: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.bulkRule.count({ where }),
    ]);

    return {
      data: { rules },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createBulkRule(
    distributorId: string,
    data: {
      productId: string;
      minQuantity: number;
      maxQuantity?: number;
      discountType: 'PERCENT' | 'FIXED';
      discountValue: number;
    },
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id: data.productId, distributorId },
    });

    if (!product) {
      throw new NotFoundException('Mahsulot topilmadi');
    }

    return this.prisma.bulkRule.create({
      data,
    });
  }

  async updateBulkRule(
    id: string,
    distributorId: string,
    data: {
      minQuantity?: number;
      maxQuantity?: number;
      discountType?: 'PERCENT' | 'FIXED';
      discountValue?: number;
    },
  ) {
    const bulkRule = await this.prisma.bulkRule.findFirst({
      where: {
        id,
        product: { distributorId },
      },
    });

    if (!bulkRule) {
      throw new NotFoundException('Bulk qoidasi topilmadi');
    }

    return this.prisma.bulkRule.update({
      where: { id },
      data,
    });
  }

  async deleteBulkRule(id: string, distributorId: string) {
    const bulkRule = await this.prisma.bulkRule.findFirst({
      where: {
        id,
        product: { distributorId },
      },
    });

    if (!bulkRule) {
      throw new NotFoundException('Bulk qoidasi topilmadi');
    }

    return this.prisma.bulkRule.delete({
      where: { id },
    });
  }

  // Calculate price for client
  async calculatePrice(productId: string, clientId: string, quantity: number) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        priceRules: {
          where: {
            clientId,
            OR: [
              { validFrom: null, validTo: null },
              { validFrom: { lte: new Date() }, validTo: { gte: new Date() } },
            ],
          },
        },
        bulkRules: {
          where: {
            minQuantity: { lte: quantity },
            OR: [{ maxQuantity: null }, { maxQuantity: { gte: quantity } }],
          },
          orderBy: { minQuantity: 'desc' },
          take: 1,
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Mahsulot topilmadi');
    }

    let basePrice = product.wholesalePrice;

    // Apply client-specific price if exists
    if (product.priceRules.length > 0) {
      basePrice = product.priceRules[0].price;
    }

    // Apply bulk discount if exists
    if (product.bulkRules.length > 0) {
      const bulkRule = product.bulkRules[0];
      if (bulkRule.discountType === 'PERCENT') {
        basePrice = basePrice * (1 - bulkRule.discountValue / 100);
      } else {
        basePrice = basePrice - bulkRule.discountValue;
      }
    }

    return {
      basePrice: product.wholesalePrice,
      finalPrice: basePrice,
      quantity,
      total: basePrice * quantity,
      appliedRules: {
        clientSpecific: product.priceRules.length > 0,
        bulkDiscount: product.bulkRules.length > 0,
      },
    };
  }
}
