import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DriverService {
  constructor(private prisma: PrismaService) { }

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
    const driver = await this.prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw new NotFoundException('Driver topilmadi');

    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new NotFoundException('Buyurtma topilmadi');
    if (existing.distributorId !== driver.distributorId) {
      throw new ForbiddenException('Bu buyurtma sizning distribyutoringizga tegishli emas');
    }

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
    const existing = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!existing) throw new NotFoundException('Buyurtma topilmadi');
    if (existing.driverId !== driverId) throw new ForbiddenException('Bu buyurtma sizga tegishli emas');

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

      // Calculate earnings — only once per order
      const existingEarning = await this.prisma.driverEarning.findFirst({
        where: { orderId, driverId },
      });
      if (!existingEarning) {
        const baseAmount = order.totalAmount * 0.1; // 10% commission
        await this.prisma.driverEarning.create({
          data: { driverId, orderId, amount: baseAmount },
        });
      }
    }

    if (problemReport && order.delivery) {
      await this.prisma.delivery.update({
        where: { orderId },
        data: { problemReport },
      });
    }

    return order;
  }

  async getOrders(
    driverId: string,
    status?: string,
    page = 1,
    limit = 20,
    date?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = { driverId };

    // Status filter
    if (status) where.status = status;

    // Date range filter (priority)
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    } else if (date) {
      // Single date filter (fallback)
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      where.createdAt = { gte: startOfDay, lte: endOfDay };
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

    if (!order) throw new NotFoundException('Buyurtma topilmadi');
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
          statusHistory: {
            some: {
              status: { in: ['ASSIGNED', 'PICKED'] },
              timestamp: { gte: startOfDay, lte: endOfDay },
            },
          },
        },
      }),
      this.prisma.order.count({
        where: {
          driverId,
          status: 'DELIVERED',
          statusHistory: {
            some: {
              status: 'DELIVERED',
              timestamp: { gte: startOfDay, lte: endOfDay },
            },
          },
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

    const orders = await this.prisma.order.findMany({
      where: {
        driverId,
        status: 'DELIVERED',
        statusHistory: {
          some: {
            status: 'DELIVERED',
            timestamp: { gte: start, lte: end },
          },
        },
      },
      select: { paymentMethod: true, totalAmount: true },
    });

    const cash = orders.filter((o) => o.paymentMethod === 'CASH');
    const card = orders.filter((o) => o.paymentMethod === 'CARD');

    const cashAmount = cash.reduce((s, o) => s + o.totalAmount, 0);
    const cardAmount = card.reduce((s, o) => s + o.totalAmount, 0);

    return {
      cash: { amount: cashAmount, count: cash.length },
      card: { amount: cardAmount, count: card.length },
      total: { amount: cashAmount + cardAmount, count: cash.length + card.length },
    };
  }

  async getCollections(driverId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Barcha yetkazilgan buyurtmalarni olish
    const orders = await this.prisma.order.findMany({
      where: {
        driverId,
        status: 'DELIVERED',
        statusHistory: {
          some: {
            status: 'DELIVERED',
            timestamp: { gte: start, lte: end },
          },
        },
      },
      include: {
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
        distributor: {
          select: {
            companyName: true,
          },
        },
        statusHistory: {
          where: { status: 'DELIVERED' },
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Mijoz bo'yicha guruhlash
    const collectionsByClient = new Map<string, any>();

    for (const order of orders) {
      const clientId = order.clientId;
      const clientName = order.client?.user?.name || order.client?.storeName || 'Noma\'lum';
      const customerCode = order.client?.customerCode || 'N/A';
      const phone = order.client?.user?.phone || 'N/A';

      if (!collectionsByClient.has(clientId)) {
        collectionsByClient.set(clientId, {
          clientId,
          clientName,
          customerCode,
          phone,
          storeName: order.client?.storeName,
          totalAmount: 0,
          cashAmount: 0,
          cardAmount: 0,
          creditAmount: 0,
          bankTransferAmount: 0,
          totalOrders: 0,
          cashOrders: 0,
          cardOrders: 0,
          creditOrders: 0,
          bankTransferOrders: 0,
          orders: [],
        });
      }

      const clientData = collectionsByClient.get(clientId);
      clientData.totalAmount += order.totalAmount;
      clientData.totalOrders += 1;

      // To'lov turi bo'yicha
      if (order.paymentMethod === 'CASH') {
        clientData.cashAmount += order.totalAmount;
        clientData.cashOrders += 1;
      } else if (order.paymentMethod === 'CARD') {
        clientData.cardAmount += order.totalAmount;
        clientData.cardOrders += 1;
      } else if (order.paymentMethod === 'CREDIT') {
        clientData.creditAmount += order.totalAmount;
        clientData.creditOrders += 1;
      } else if (order.paymentMethod === 'BANK_TRANSFER') {
        clientData.bankTransferAmount += order.totalAmount;
        clientData.bankTransferOrders += 1;
      }

      // Buyurtma tafsilotlari
      clientData.orders.push({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        deliveredAt: order.statusHistory?.[0]?.timestamp ?? order.updatedAt,
        distributor: order.distributor?.companyName,
      });
    }

    // Map dan array ga o'tkazish va saralash
    const collections = Array.from(collectionsByClient.values()).sort(
      (a, b) => b.totalAmount - a.totalAmount
    );

    // Umumiy statistika
    const summary = {
      totalClients: collections.length,
      totalOrders: orders.length,
      totalAmount: orders.reduce((sum, o) => sum + o.totalAmount, 0),
      cashAmount: orders.filter(o => o.paymentMethod === 'CASH').reduce((sum, o) => sum + o.totalAmount, 0),
      cardAmount: orders.filter(o => o.paymentMethod === 'CARD').reduce((sum, o) => sum + o.totalAmount, 0),
      creditAmount: orders.filter(o => o.paymentMethod === 'CREDIT').reduce((sum, o) => sum + o.totalAmount, 0),
      bankTransferAmount: orders.filter(o => o.paymentMethod === 'BANK_TRANSFER').reduce((sum, o) => sum + o.totalAmount, 0),
      cashOrders: orders.filter(o => o.paymentMethod === 'CASH').length,
      cardOrders: orders.filter(o => o.paymentMethod === 'CARD').length,
      creditOrders: orders.filter(o => o.paymentMethod === 'CREDIT').length,
      bankTransferOrders: orders.filter(o => o.paymentMethod === 'BANK_TRANSFER').length,
    };

    return {
      summary,
      collections,
      period: {
        startDate,
        endDate,
      },
    };
  }

  async getStatistics(driverId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Jami biriktirilgan buyurtmalar (ASSIGNED va undan keyingi statuslar)
    const assignedOrders = await this.prisma.order.findMany({
      where: {
        driverId,
        status: { in: ['ASSIGNED', 'PICKED', 'IN_TRANSIT', 'DELIVERED', 'RETURNED'] },
        statusHistory: {
          some: {
            status: 'ASSIGNED',
            timestamp: { gte: start, lte: end },
          },
        },
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        paymentMethod: true,
        paymentStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Yetkazilgan buyurtmalar
    const deliveredOrders = assignedOrders.filter(o => o.status === 'DELIVERED');

    // Qabul qilingan summa (faqat yetkazilgan va to'langan)
    const collectedAmount = deliveredOrders.reduce((sum, order) => {
      // Naqd va karta to'lovlar darhol qabul qilinadi
      if (order.paymentMethod === 'CASH' || order.paymentMethod === 'CARD') {
        return sum + order.totalAmount;
      }
      // Kredit va bank o'tkazmasi keyinroq to'lanadi
      return sum;
    }, 0);

    // To'lov turlari bo'yicha
    const cashOrders = deliveredOrders.filter(o => o.paymentMethod === 'CASH');
    const cardOrders = deliveredOrders.filter(o => o.paymentMethod === 'CARD');
    const creditOrders = deliveredOrders.filter(o => o.paymentMethod === 'CREDIT');
    const bankTransferOrders = deliveredOrders.filter(o => o.paymentMethod === 'BANK_TRANSFER');

    const cashAmount = cashOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const cardAmount = cardOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const creditAmount = creditOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const bankTransferAmount = bankTransferOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // Status bo'yicha
    const statusCounts = {
      assigned: assignedOrders.filter(o => o.status === 'ASSIGNED').length,
      picked: assignedOrders.filter(o => o.status === 'PICKED').length,
      inTransit: assignedOrders.filter(o => o.status === 'IN_TRANSIT').length,
      delivered: deliveredOrders.length,
      returned: assignedOrders.filter(o => o.status === 'RETURNED').length,
    };

    return {
      period: {
        startDate,
        endDate,
      },
      summary: {
        totalAssigned: assignedOrders.length,
        totalDelivered: deliveredOrders.length,
        totalCollected: collectedAmount,
        deliveryRate: assignedOrders.length > 0
          ? ((deliveredOrders.length / assignedOrders.length) * 100).toFixed(2) + '%'
          : '0%',
      },
      byStatus: statusCounts,
      byPaymentMethod: {
        cash: {
          count: cashOrders.length,
          amount: cashAmount,
        },
        card: {
          count: cardOrders.length,
          amount: cardAmount,
        },
        credit: {
          count: creditOrders.length,
          amount: creditAmount,
        },
        bankTransfer: {
          count: bankTransferOrders.length,
          amount: bankTransferAmount,
        },
      },
      details: {
        totalOrdersAmount: deliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0),
        averageOrderAmount: deliveredOrders.length > 0
          ? (deliveredOrders.reduce((sum, o) => sum + o.totalAmount, 0) / deliveredOrders.length).toFixed(2)
          : 0,
      },
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
