import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DriverService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(driverId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [driver, todayOrders, todayEarnings, activeOrder] = await Promise.all([
      this.prisma.driver.findUnique({
        where: { id: driverId },
        include: { user: true },
      }),
      this.prisma.order.count({
        where: {
          driverId,
          status: 'DELIVERED',
          updatedAt: { gte: today },
        },
      }),
      this.prisma.driverEarning.aggregate({
        where: {
          driverId,
          date: { gte: today },
        },
        _sum: { amount: true, bonus: true },
      }),
      this.prisma.order.findFirst({
        where: {
          driverId,
          status: { in: ['PICKED', 'IN_TRANSIT'] },
        },
        include: {
          client: { include: { user: true } },
          items: { include: { product: true } },
          delivery: true,
        },
      }),
    ]);

    return {
      driver,
      todayOrders,
      todayEarnings: (todayEarnings._sum.amount || 0) + (todayEarnings._sum.bonus || 0),
      activeOrder,
    };
  }

  async updateLocation(driverId: string, lat: number, lng: number) {
    await Promise.all([
      this.prisma.driver.update({
        where: { id: driverId },
        data: { currentLat: lat, currentLng: lng },
      }),
      this.prisma.driverLocation.create({
        data: { driverId, lat, lng },
      }),
    ]);

    return { success: true };
  }

  async updateStatus(driverId: string, isOnline: boolean) {
    return this.prisma.driver.update({
      where: { id: driverId },
      data: { isOnline },
    });
  }

  async acceptOrder(driverId: string, orderId: string) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        driverId,
        status: 'PICKED',
      },
      include: {
        client: { include: { user: true } },
        distributor: true,
      },
    });

    await this.prisma.orderStatusHistory.create({
      data: {
        orderId,
        status: 'PICKED',
      },
    });

    return order;
  }

  async updateOrderStatus(
    orderId: string,
    driverId: string,
    status: string,
    photoProof?: string,
    signature?: string,
    problemReport?: string,
  ) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: status as any },
      include: {
        client: { include: { user: true } },
        delivery: true,
      },
    });

    await this.prisma.orderStatusHistory.create({
      data: { orderId, status: status as any },
    });

    if (status === 'DELIVERED') {
      if (order.delivery) {
        await this.prisma.delivery.update({
          where: { orderId },
          data: {
            deliveryTime: new Date(),
            photoProof,
            signature,
          },
        });
      }

      // Calculate earnings
      const baseAmount = order.totalAmount * 0.1; // 10% commission
      await this.prisma.driverEarning.create({
        data: {
          driverId,
          orderId,
          amount: baseAmount,
        },
      });
    }

    if (problemReport && order.delivery) {
      await this.prisma.delivery.update({
        where: { orderId },
        data: { problemReport },
      });
    }

    return order;
  }

  async getOrders(driverId: string, status?: string, page = 1, limit = 20, date?: string) {
    const where: any = { driverId };
    if (status) where.status = status;
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.updatedAt = { gte: startOfDay, lte: endOfDay };
    }

    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { include: { user: { select: { name: true, phone: true } } } },
          distributor: { select: { id: true, companyName: true, address: true } },
          items: { include: { product: { select: { id: true, name: true, unit: true } } } },
          delivery: true,
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { orders, total, page, limit };
  }

  async getOrderById(driverId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, driverId },
      include: {
        client: { include: { user: { select: { name: true, phone: true, avatar: true } } } },
        distributor: { select: { id: true, companyName: true, address: true, phone: true } },
        items: {
          include: {
            product: {
              select: { id: true, name: true, unit: true, images: { where: { isCover: true }, take: 1 } },
            },
          },
        },
        delivery: true,
        statusHistory: { orderBy: { timestamp: 'asc' } },
      },
    });

    if (!order) throw new Error('Buyurtma topilmadi');
    return order;
  }

  async getHomeStats(driverId: string, date: string) {
    const targetDate = new Date(date);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const [totalOrders, deliveredOrders, earnings] = await Promise.all([
      this.prisma.order.count({
        where: {
          driverId,
          updatedAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.order.count({
        where: {
          driverId,
          status: 'DELIVERED',
          updatedAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      this.prisma.driverEarning.aggregate({
        where: {
          driverId,
          date: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { amount: true, bonus: true },
      }),
    ]);

    return {
      totalOrders,
      deliveredOrders,
      totalRevenue: (earnings._sum.amount || 0) + (earnings._sum.bonus || 0),
    };
  }

  async getPaymentStats(driverId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const grouped = await this.prisma.order.groupBy({
      by: ['paymentMethod'],
      where: {
        driverId,
        status: 'DELIVERED',
        updatedAt: { gte: start, lte: end },
      },
      _sum: { totalAmount: true },
      _count: { id: true },
    });

    const cash = grouped.find((g) => g.paymentMethod === 'CASH');
    const card = grouped.find((g) => g.paymentMethod === 'CARD');

    const cashAmount = cash?._sum.totalAmount || 0;
    const cardAmount = card?._sum.totalAmount || 0;

    return {
      cash: { amount: cashAmount, count: cash?._count.id || 0 },
      card: { amount: cardAmount, count: card?._count.id || 0 },
      total: { amount: cashAmount + cardAmount, count: (cash?._count.id || 0) + (card?._count.id || 0) },
    };
  }

  async getEarnings(driverId: string, period: string = 'today', startDate?: string, endDate?: string) {
    let dateFilter: any = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter = { gte: start, lte: end };
    } else {
      const start = new Date();
      if (period === 'today') {
        start.setHours(0, 0, 0, 0);
      } else if (period === 'week') {
        start.setDate(start.getDate() - 7);
      } else if (period === 'month') {
        start.setMonth(start.getMonth() - 1);
      }
      dateFilter = { gte: start };
    }

    const earnings = await this.prisma.driverEarning.findMany({
      where: {
        driverId,
        date: dateFilter,
      },
      orderBy: { date: 'desc' },
    });

    const total = earnings.reduce((sum, e) => sum + e.amount + e.bonus, 0);

    return { earnings, total };
  }
}
