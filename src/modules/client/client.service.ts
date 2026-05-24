import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ClientService {
  constructor(private prisma: PrismaService) { }

  async getClientById(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
          },
        },
        debts: {
          where: { status: { not: 'PAID' } },
          select: {
            id: true,
            originalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
            dueDate: true,
          },
        },
        storeLinks: {
          include: {
            distributor: {
              select: {
                id: true,
                companyName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client topilmadi');
    }

    // Calculate statistics
    const [totalOrders, totalSpent, pendingDebts] = await Promise.all([
      this.prisma.order.count({ where: { clientId } }),
      this.prisma.order.aggregate({
        where: { clientId, status: 'DELIVERED' },
        _sum: { totalAmount: true },
      }),
      this.prisma.debt.aggregate({
        where: { clientId, status: { not: 'PAID' } },
        _sum: { remainingAmount: true },
      }),
    ]);

    return {
      ...client,
      statistics: {
        totalOrders,
        totalSpent: totalSpent._sum.totalAmount || 0,
        pendingDebts: pendingDebts._sum.remainingAmount || 0,
      },
    };
  }

  async getClientByCustomerCode(customerCode: string) {
    const client = await this.prisma.client.findUnique({
      where: { customerCode },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            avatar: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
        orders: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            orderNumber: true,
            status: true,
            totalAmount: true,
            createdAt: true,
            distributor: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        debts: {
          where: { status: { not: 'PAID' } },
          select: {
            id: true,
            originalAmount: true,
            paidAmount: true,
            remainingAmount: true,
            status: true,
            dueDate: true,
            distributor: {
              select: {
                id: true,
                companyName: true,
              },
            },
          },
        },
        storeLinks: {
          include: {
            distributor: {
              select: {
                id: true,
                companyName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    if (!client) {
      throw new NotFoundException(`Customer code ${customerCode} topilmadi`);
    }

    // Calculate statistics
    const [totalOrders, totalSpent, pendingDebts] = await Promise.all([
      this.prisma.order.count({ where: { clientId: client.id } }),
      this.prisma.order.aggregate({
        where: { clientId: client.id, status: 'DELIVERED' },
        _sum: { totalAmount: true },
      }),
      this.prisma.debt.aggregate({
        where: { clientId: client.id, status: { not: 'PAID' } },
        _sum: { remainingAmount: true },
      }),
    ]);

    return {
      ...client,
      statistics: {
        totalOrders,
        totalSpent: totalSpent._sum.totalAmount || 0,
        pendingDebts: pendingDebts._sum.remainingAmount || 0,
      },
    };
  }

  async updateProfile(userId: string, data: any) {
    const client = await this.prisma.client.findUnique({ where: { userId } });
    if (!client) throw new Error('Profil topilmadi');
    await this.prisma.user.update({
      where: { id: userId },
      data: { name: data.name, phone: data.phone },
    });
    const updated = await this.prisma.client.update({
      where: { userId },
      data: { storeName: data.name, ...(data.address ? { addresses: { main: data.address } } : {}) },
      include: { user: true },
    });
    return { success: true, data: updated };
  }

  async getDashboard(clientId: string) {
    const [activeOrder, recentOrders, client] = await Promise.all([
      this.prisma.order.findFirst({
        where: {
          clientId,
          status: { in: ['NEW', 'ACCEPTED', 'ASSIGNED', 'PICKED', 'IN_TRANSIT'] },
        },
        include: {
          distributor: true,
          driver: { include: { user: true } },
          items: { include: { product: true } },
        },
      }),
      this.prisma.order.findMany({
        where: { clientId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          distributor: true,
          items: { include: { product: true } },
        },
      }),
      this.prisma.client.findUnique({
        where: { id: clientId },
        include: { user: true },
      }),
    ]);

    return {
      activeOrder,
      recentOrders,
      client,
    };
  }

  async getProducts(clientId: string, query: any) {
    const { categoryId, search, distributorId, brandId, minPrice, maxPrice, sort, page, limit } = query;

    const where: any = {
      status: 'ACTIVE',
    };

    if (categoryId) where.categoryId = categoryId;
    if (brandId) where.brandId = brandId;
    if (distributorId) where.distributorId = distributorId;

    if (minPrice || maxPrice) {
      where.wholesalePrice = {
        ...(minPrice ? { gte: parseFloat(minPrice) } : {}),
        ...(maxPrice ? { lte: parseFloat(maxPrice) } : {}),
      };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === 'price_asc'
        ? { wholesalePrice: Prisma.SortOrder.asc }
        : sort === 'price_desc'
          ? { wholesalePrice: Prisma.SortOrder.desc }
          : { createdAt: Prisma.SortOrder.desc };

    const take = limit ? parseInt(limit) : 20;
    const skip = page ? (parseInt(page) - 1) * take : 0;

    const include = {
      distributor: { select: { id: true, companyName: true, phone: true, isVerified: true } },
      category: true,
      brand: true,
      images: { where: { isCover: true }, take: 1 },
      bulkRules: true,
      priceRules: { where: { clientId } },
      inventory: { select: { quantity: true } },
    };

    const [rawProducts, total] = await Promise.all([
      this.prisma.product.findMany({ where, include, orderBy, skip, take }),
      this.prisma.product.count({ where }),
    ]);

    const products = rawProducts.map((p: any) => ({
      ...p,
      stock: (p.inventory as any[]).reduce((sum: number, inv: any) => sum + (inv.quantity || 0), 0),
    }));

    return { products, total, page: parseInt(page) || 1, limit: take };
  }

  async getDistributors(_clientId: string, region?: string, search?: string, page = 1, limit = 20) {
    const where: any = { isVerified: true };
    if (search) where.companyName = { contains: search, mode: 'insensitive' };
    if (region) where.region = region;

    const skip = (page - 1) * limit;
    const [distributors, total] = await Promise.all([
      this.prisma.distributor.findMany({
        where,
        include: { user: { select: { name: true, avatar: true } } },
        skip,
        take: limit,
      }),
      this.prisma.distributor.count({ where }),
    ]);

    const data = distributors.map((d: any) => ({
      id: d.id,
      companyName: d.companyName,
      logo: d.logo,
      address: d.address,
      phone: d.phone || d.user?.phone,
      region: d.region,
      rating: d.rating,
      isVerified: d.isVerified,
    }));

    return {
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getDistributorById(_clientId: string, distributorId: string) {
    const d: any = await this.prisma.distributor.findUnique({
      where: { id: distributorId },
      include: {
        user: { select: { name: true, avatar: true, phone: true } },
        products: {
          where: { status: 'ACTIVE' },
          include: { images: { where: { isCover: true }, take: 1 }, category: true },
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
        categories: { orderBy: { order: 'asc' } },
      },
    });

    if (!d) throw new NotFoundException('Distribyutor topilmadi');

    return {
      id: d.id,
      companyName: d.companyName,
      logo: d.logo,
      address: d.address,
      phone: d.phone || d.user?.phone,
      region: d.region,
      rating: d.rating,
      isVerified: d.isVerified,
      description: d.description,
      products: d.products,
      categories: d.categories,
      productsCount: d.products?.length ?? 0,
    };
  }

  async getFinanceSummary(clientId: string) {
    const [debts, totalSpent] = await Promise.all([
      this.prisma.debt.findMany({
        where: { clientId, status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
      }),
      this.prisma.order.aggregate({
        where: { clientId, status: 'DELIVERED' },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalDebt = debts.reduce((sum, d) => sum + d.remainingAmount, 0);

    const now = new Date();
    const overdueDebt = debts
      .filter((d) => d.dueDate && d.dueDate < now)
      .reduce((sum, d) => sum + d.remainingAmount, 0);

    return {
      totalDebt,
      overdueDebt,
      totalSpent: totalSpent._sum.totalAmount || 0,
      activeDebtsCount: debts.length,
    };
  }

  async getOrderTracking(orderId: string, clientId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, clientId },
      include: {
        distributor: true,
        driver: { include: { user: true } },
        items: { include: { product: true } },
        statusHistory: { orderBy: { timestamp: 'asc' } },
        delivery: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Buyurtma topilmadi');
    }

    return order;
  }

  async getOrderStats(clientId: string) {
    const stats = await this.prisma.order.groupBy({
      by: ['status'],
      where: { clientId },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    const formatted = stats.reduce((acc: any, stat) => {
      acc[stat.status] = {
        count: stat._count.id,
        total: stat._sum.totalAmount || 0,
      };
      return acc;
    }, {});

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayStats = await this.prisma.order.aggregate({
      where: {
        clientId,
        createdAt: { gte: today },
      },
      _count: { id: true },
      _sum: { totalAmount: true },
    });

    return {
      byStatus: formatted,
      today: {
        count: todayStats._count.id,
        total: todayStats._sum.totalAmount || 0,
      },
    };
  }

  async rateDelivery(orderId: string, clientId: string, rating: number, comment?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, clientId, status: 'DELIVERED' },
    });

    if (!order || !order.driverId) {
      throw new BadRequestException("Bu buyurtmani baholab bo'lmaydi");
    }

    const deliveryRating = await this.prisma.deliveryRating.create({
      data: {
        clientId,
        driverId: order.driverId,
        orderId,
        rating,
        comment,
      },
    });

    // Update driver rating
    const allRatings = await this.prisma.deliveryRating.findMany({
      where: { driverId: order.driverId },
    });

    const avgRating = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

    await this.prisma.driver.update({
      where: { id: order.driverId },
      data: { rating: avgRating },
    });

    return deliveryRating;
  }
}
