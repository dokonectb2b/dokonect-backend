import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) { }

  async getDistributorAnalytics(distributorId: string | null, period = '7d', from?: string, to?: string) {
    let startDate: Date;
    let endDate = new Date();

    if (from) {
      startDate = new Date(from);
      if (to) { endDate = new Date(to); endDate.setHours(23, 59, 59, 999); }
    } else {
      const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
    }

    const orderWhere = distributorId
      ? { distributorId, createdAt: { gte: startDate, lte: endDate } }
      : { createdAt: { gte: startDate, lte: endDate } };

    const [orders, revenue, topProducts, clientGroups] = await Promise.all([
      this.prisma.order.findMany({
        where: orderWhere,
      }),
      this.prisma.order.aggregate({
        where: orderWhere,
        _sum: { totalAmount: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: {
          order: orderWhere,
        },
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
      this.prisma.order.groupBy({
        by: ['clientId'],
        where: orderWhere,
        _sum: { totalAmount: true },
        _count: { _all: true },
        orderBy: { _sum: { totalAmount: 'desc' } },
        take: 30,
      }) as any,
    ]);

    const clientIds = (clientGroups as any[]).map((c: any) => c.clientId).filter(Boolean);
    const clients = clientIds.length > 0
      ? await this.prisma.client.findMany({
        where: { id: { in: clientIds } },
        select: { id: true, storeName: true },
      })
      : [];
    const clientMap: Record<string, string> = Object.fromEntries(
      (clients as any[]).map((c: any) => [c.id, c.storeName]),
    );

    const clientBreakdown = (clientGroups as any[]).map((c: any) => ({
      clientId: c.clientId,
      storeName: clientMap[c.clientId] || "Noma'lum do'kon",
      totalRevenue: c._sum?.totalAmount || 0,
      ordersCount: c._count?._all || 0,
    }));

    const revenueByDay = orders.reduce((acc: any, order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + order.totalAmount;
      return acc;
    }, {});

    // Sales trend for charts
    const salesTrend = Object.entries(revenueByDay).map(([date, sales]) => ({
      date,
      sales,
      orders: orders.filter(o => o.createdAt.toISOString().split('T')[0] === date).length,
    })).sort((a, b) => a.date.localeCompare(b.date));

    // Top products with details
    const productIds = topProducts.map(p => p.productId);
    const products = productIds.length > 0
      ? await this.prisma.product.findMany({
        where: { id: { in: productIds } },
        include: { images: { where: { isCover: true }, take: 1 } },
      })
      : [];
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    const topProductsWithDetails = topProducts.map(item => ({
      productId: item.productId,
      product: productMap[item.productId],
      quantity: item._sum.quantity || 0,
      revenue: item._sum.total || 0,
    }));

    // Order statistics
    const orderStats = {
      total: orders.length,
      delivered: orders.filter(o => o.status === 'DELIVERED').length,
      cancelled: orders.filter(o => o.status === 'CANCELLED' || o.status === 'REJECTED').length,
      inTransit: orders.filter(o => o.status === 'IN_TRANSIT' || o.status === 'PICKED').length,
      new: orders.filter(o => o.status === 'NEW').length,
    };

    // Average order value
    const avgOrderValue = orders.length > 0 ? (revenue._sum.totalAmount || 0) / orders.length : 0;

    return {
      totalOrders: orders.length,
      totalRevenue: revenue._sum.totalAmount || 0,
      avgOrderValue,
      revenueByDay,
      salesTrend,
      topProducts: topProductsWithDetails,
      clientBreakdown,
      orders: orderStats,
    };
  }

  async getPaymentsAnalytics(distributorId: string | null, from?: string, to?: string, period = '7d') {
    let startDate: Date;
    let endDate = new Date();

    if (from) {
      startDate = new Date(from);
      if (to) { endDate = new Date(to); endDate.setHours(23, 59, 59, 999); }
    } else {
      const days = period === '90d' ? 90 : period === '30d' ? 30 : 7;
      startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
    }

    const baseWhere: any = {
      ...(distributorId ? { distributorId } : {}),
      createdAt: { gte: startDate, lte: endDate },
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    };

    const orders = await this.prisma.order.findMany({
      where: baseWhere,
      include: {
        client: { select: { storeName: true } },
        driver: { include: { user: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    }) as any[];

    const cashOrders = orders.filter((o: any) => o.paymentMethod === 'CASH');
    const onlineOrders = orders.filter((o: any) => o.paymentMethod === 'CARD' || o.paymentMethod === 'BANK_TRANSFER');
    const creditOrders = orders.filter((o: any) => o.paymentMethod === 'CREDIT');
    const unpaidOrders = orders.filter((o: any) => o.paymentStatus === 'UNPAID' || o.paymentStatus === 'PARTIAL');

    const sum = (list: any[]) => list.reduce((acc: number, o: any) => acc + o.totalAmount, 0);

    const summary = {
      totalAmount: sum(orders),
      cashTotal: sum(cashOrders),
      onlineTotal: sum(onlineOrders),
      creditTotal: sum(creditOrders),
      unpaidTotal: sum(unpaidOrders),
      paidTotal: sum(orders.filter((o: any) => o.paymentStatus === 'PAID')),
      cashCount: cashOrders.length,
      onlineCount: onlineOrders.length,
      creditCount: creditOrders.length,
    };

    // Group cash by driver
    const driverMap = new Map<string, any>();
    for (const order of cashOrders) {
      const key = order.driverId || '__none__';
      const driverName = order.driver?.user?.name || (order.driverId ? "Noma'lum haydovchi" : 'Haydovchisiz');
      if (!driverMap.has(key)) {
        driverMap.set(key, { driverId: order.driverId, driverName, totalCollected: 0, ordersCount: 0, collections: [] });
      }
      const entry = driverMap.get(key);
      entry.totalCollected += order.totalAmount;
      entry.ordersCount += 1;
      entry.collections.push({
        orderId: order.id,
        storeName: order.client?.storeName || "Noma'lum do'kon",
        amount: order.totalAmount,
        paymentStatus: order.paymentStatus,
        date: order.createdAt,
      });
    }

    const onlinePayments = onlineOrders.map((o: any) => ({
      orderId: o.id,
      storeName: o.client?.storeName || "Noma'lum do'kon",
      method: o.paymentMethod,
      amount: o.totalAmount,
      paymentStatus: o.paymentStatus,
      date: o.createdAt,
    }));

    return {
      summary,
      driverPayments: Array.from(driverMap.values()).sort((a, b) => b.totalCollected - a.totalCollected),
      onlinePayments,
    };
  }

  async getClientAnalytics(clientId: string, period: string = '7d') {
    const days = period === '30d' ? 30 : period === '7d' ? 7 : 1;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [orders, spending] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          clientId,
          createdAt: { gte: startDate },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          clientId,
          createdAt: { gte: startDate },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const spendingByDay = orders.reduce((acc: any, order) => {
      const date = order.createdAt.toISOString().split('T')[0];
      acc[date] = (acc[date] || 0) + order.totalAmount;
      return acc;
    }, {});

    return {
      totalOrders: orders.length,
      totalSpending: spending._sum.totalAmount || 0,
      spendingByDay,
    };
  }
}
