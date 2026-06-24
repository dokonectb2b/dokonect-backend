import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) { }

  async getDashboardStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [
      todayOrders, weeklyOrders, totalOrders, activeOrders,
      totalRevenue, todayRevenue, weeklyRevenue, monthlyRevenue,
      cashRevenue, onlineRevenue,
      totalUsers, activeDistributors, totalDistributors,
      activeShops, totalShops, onlineDrivers, totalDrivers,
      totalProducts, recentOrders, recentUsers,
    ] = await Promise.all([
      this.prisma.order.count({ where: { createdAt: { gte: today } } }),
      this.prisma.order.count({ where: { createdAt: { gte: weekAgo } } }),
      this.prisma.order.count(),
      this.prisma.order.count({ where: { status: { in: ['NEW', 'ACCEPTED', 'ASSIGNED', 'IN_TRANSIT'] } } }),
      this.prisma.order.aggregate({ _sum: { totalAmount: true } }),
      this.prisma.order.aggregate({ where: { createdAt: { gte: today } }, _sum: { totalAmount: true } }),
      this.prisma.order.aggregate({ where: { createdAt: { gte: weekAgo } }, _sum: { totalAmount: true } }),
      this.prisma.order.aggregate({ where: { createdAt: { gte: monthAgo } }, _sum: { totalAmount: true } }),
      this.prisma.order.aggregate({ where: { paymentMethod: 'CASH' }, _sum: { totalAmount: true } }),
      this.prisma.order.aggregate({ where: { paymentMethod: { in: ['CARD', 'BANK_TRANSFER'] } }, _sum: { totalAmount: true } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { role: 'DISTRIBUTOR', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'DISTRIBUTOR' } }),
      this.prisma.user.count({ where: { role: 'CLIENT', status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { role: 'CLIENT' } }),
      this.prisma.driver.count({ where: { isOnline: true } }),
      this.prisma.driver.count(),
      this.prisma.product.count(),
      this.prisma.order.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        include: { client: { include: { user: true } }, distributor: { include: { user: true } } },
      }),
      this.prisma.user.findMany({
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, phone: true, email: true, role: true, createdAt: true },
      }),
    ]);

    return {
      gmv: {
        total:   totalRevenue._sum.totalAmount   || 0,
        today:   todayRevenue._sum.totalAmount   || 0,
        weekly:  weeklyRevenue._sum.totalAmount  || 0,
        monthly: monthlyRevenue._sum.totalAmount || 0,
      },
      payments: {
        total:  (totalRevenue._sum.totalAmount || 0),
        cash:   cashRevenue._sum.totalAmount   || 0,
        online: onlineRevenue._sum.totalAmount || 0,
      },
      orders: {
        total:  totalOrders,
        today:  todayOrders,
        weekly: weeklyOrders,
        active: activeOrders,
      },
      users: {
        total: totalUsers,
        distributors: { active: activeDistributors, total: totalDistributors },
        shops:        { active: activeShops,        total: totalShops        },
        drivers:      { online: onlineDrivers,      total: totalDrivers      },
      },
      products: { total: totalProducts, lowStock: 0 },
      platform: { revenue: 0, commission: 0 },
      recentOrders,
      recentUsers,
    };
  }

  async getRecentOrders(status?: string, search?: string, page = 1, limit = 20) {
    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      const num = parseInt(search, 10);
      where.OR = [
        ...(isNaN(num) ? [] : [{ orderNumber: num }]),
        { id: { contains: search, mode: 'insensitive' } },
        { client: { storeName: { contains: search, mode: 'insensitive' } } },
        { distributor: { companyName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const skip = (page - 1) * limit;
    const [orders, total, newCount, activeCount, doneCount, cancelledCount] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { include: { user: true } },
          distributor: true,
          driver: { include: { user: true } },
          items: { include: { product: true } },
        },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.count({ where: { ...where, status: 'NEW' } }),
      this.prisma.order.count({ where: { ...where, status: { in: ['ACCEPTED', 'ASSIGNED', 'IN_TRANSIT'] } } }),
      this.prisma.order.count({ where: { ...where, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { ...where, status: { in: ['CANCELLED', 'REJECTED'] } } }),
    ]);
    return {
      success: true,
      data: {
        orders,
        pagination: { total, page, totalPages: Math.ceil(total / limit) },
        counts: { new: newCount, active: activeCount, done: doneCount, cancelled: cancelledCount },
      },
    };
  }

  async getActiveDrivers() {
    return this.prisma.driver.findMany({
      where: { isOnline: true },
      include: { user: true },
      orderBy: { rating: 'desc' },
    });
  }

  async getAllUsers(role?: string, search?: string, page = 1, limit = 20) {
    const where: any = {};
    if (role) where.role = role;
    if (search) {
      where.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [users, total, distCount, driverCount, clientCount, blockedCount] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { client: true, distributor: true, driver: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, role: 'DISTRIBUTOR' } }),
      this.prisma.user.count({ where: { ...where, role: 'DRIVER' } }),
      this.prisma.user.count({ where: { ...where, role: 'CLIENT' } }),
      this.prisma.user.count({ where: { ...where, status: 'SUSPENDED' } }),
    ]);
    return {
      success: true,
      data: {
        users,
        pagination: { total, page, totalPages: Math.ceil(total / limit) },
        counts: { distributor: distCount, driver: driverCount, client: clientCount, blocked: blockedCount },
      },
    };
  }

  async createUser(data: { name: string; phone: string; password: string; role: string }) {
    try {
      const hashedPassword = await bcrypt.hash(data.password, 10);
      const user = await this.prisma.user.create({
        data: {
          name: data.name,
          phone: data.phone,
          password: hashedPassword,
          role: data.role as any,
          status: 'ACTIVE',
        },
      });
      if (data.role === 'CLIENT') {
        await this.prisma.client.create({ data: { userId: user.id } });
      }
      return { success: true, data: user };
    } catch (e: any) {
      console.error('[createUser error]', e?.message, e?.code);
      throw e;
    }
  }

  async deleteUser(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true, message: "Foydalanuvchi o'chirildi" };
  }

  async updateUserStatus(userId: string, status: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { status: status as any },
    });
  }

  async updateUserRole(userId: string, role: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { role: role as any },
    });
    return { success: true, data: user };
  }

  async getAnalytics(period: string = '7d') {
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [orders, topProductsRaw, topStores, topDistributors] = await Promise.all([
      this.prisma.order.findMany({
        where: { createdAt: { gte: startDate } },
        include: { items: { include: { product: { include: { category: true } } } }, client: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { createdAt: { gte: startDate } } },
        _sum: { total: true, quantity: true },
        orderBy: { _sum: { total: 'desc' } },
        take: 10,
      }),
      this.prisma.client.findMany({
        include: { user: true, _count: { select: { orders: true } } },
        orderBy: { orders: { _count: 'desc' } },
        take: 10,
      }),
      this.prisma.distributor.findMany({
        include: { user: true, _count: { select: { orders: true } } },
        orderBy: { orders: { _count: 'desc' } },
        take: 10,
      }),
    ]);

    const salesTrendMap: Record<string, { sales: number; orders: number }> = {};
    for (const order of orders) {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!salesTrendMap[date]) salesTrendMap[date] = { sales: 0, orders: 0 };
      salesTrendMap[date].sales  += order.totalAmount;
      salesTrendMap[date].orders += 1;
    }
    const salesTrend = Object.entries(salesTrendMap)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const productIds = topProductsRaw.map(p => p.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true },
    });
    const topProducts = topProductsRaw.map(p => ({
      ...p,
      product: products.find(pr => pr.id === p.productId),
    }));

    const categoryMap: Record<string, number> = {};
    for (const order of orders) {
      for (const item of order.items) {
        const cat = item.product?.category?.name || 'Boshqa';
        categoryMap[cat] = (categoryMap[cat] || 0) + item.total;
      }
    }
    const categoryBreakdown = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

    return {
      success: true,
      data: { salesTrend, topProducts, topStores, topDistributors, categoryBreakdown },
    };
  }

  async getAllDistributors() {
    const distributors = await this.prisma.distributor.findMany({
      include: {
        user: true,
        _count: { select: { products: true, orders: true } },
        storeLinks: {
          where: { status: 'APPROVED' },
          include: { storeOwner: { select: { id: true, storeName: true } } },
          take: 5,
        },
      },
      orderBy: { user: { name: 'asc' } },
    });

    const distributorIds = distributors.map(d => d.id);
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [totalRevenues, monthlyRevenues, deliveredCounts, activeCounts] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['distributorId'],
        where: { distributorId: { in: distributorIds }, status: 'DELIVERED' },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.groupBy({
        by: ['distributorId'],
        where: { distributorId: { in: distributorIds }, status: 'DELIVERED', createdAt: { gte: monthAgo } },
        _sum: { totalAmount: true },
      }),
      this.prisma.order.groupBy({
        by: ['distributorId'],
        where: { distributorId: { in: distributorIds }, status: 'DELIVERED' },
        _count: { id: true },
      }),
      this.prisma.order.groupBy({
        by: ['distributorId'],
        where: { distributorId: { in: distributorIds }, status: { in: ['NEW', 'ACCEPTED', 'ASSIGNED', 'IN_TRANSIT'] } },
        _count: { id: true },
      }),
    ]);

    const enriched = distributors.map(d => ({
      ...d,
      clients: d.storeLinks.map(l => l.storeOwner),
      totalRevenue:    totalRevenues.find(r => r.distributorId === d.id)?._sum.totalAmount    || 0,
      monthlyRevenue:  monthlyRevenues.find(r => r.distributorId === d.id)?._sum.totalAmount  || 0,
      deliveredOrders: deliveredCounts.find(r => r.distributorId === d.id)?._count.id         || 0,
      activeOrders:    activeCounts.find(r => r.distributorId === d.id)?._count.id            || 0,
    }));

    return { success: true, data: { distributors: enriched } };
  }

  async getDistributorStats(id: string) {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const [totalRevenue, monthlyRevenue, deliveredOrders, activeOrders] = await Promise.all([
      this.prisma.order.aggregate({ where: { distributorId: id, status: 'DELIVERED' }, _sum: { totalAmount: true } }),
      this.prisma.order.aggregate({ where: { distributorId: id, status: 'DELIVERED', createdAt: { gte: monthAgo } }, _sum: { totalAmount: true } }),
      this.prisma.order.count({ where: { distributorId: id, status: 'DELIVERED' } }),
      this.prisma.order.count({ where: { distributorId: id, status: { in: ['NEW', 'ACCEPTED', 'ASSIGNED', 'IN_TRANSIT'] } } }),
    ]);

    return {
      success: true,
      data: {
        totalRevenue:    totalRevenue._sum.totalAmount    || 0,
        monthlyRevenue:  monthlyRevenue._sum.totalAmount  || 0,
        deliveredOrders,
        activeOrders,
      },
    };
  }

  async getStorePayments(storeId: string) {
    const client = await this.prisma.client.findFirst({
      where: { OR: [{ id: storeId }, { userId: storeId }] },
    });
    const clientId = client?.id || storeId;

    const orders = await this.prisma.order.findMany({
      where: { clientId, paymentStatus: 'PAID' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, totalAmount: true, paymentMethod: true,
        paymentStatus: true, createdAt: true, status: true,
      },
      take: 50,
    });

    const payments = orders.map(o => ({
      id:        o.id,
      orderId:   o.id,
      amount:    o.totalAmount,
      method:    o.paymentMethod,
      status:    o.paymentStatus,
      createdAt: o.createdAt,
    }));

    return { success: true, data: { payments } };
  }

  async createDistributor(data: any) {
    const hashedPassword = await bcrypt.hash(data.password || 'Dokonect@2024', 10);
    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        password: hashedPassword,
        role: 'DISTRIBUTOR',
        status: 'ACTIVE',
      },
    });
    const distributor = await this.prisma.distributor.create({
      data: {
        userId: user.id,
        companyName: data.name,
        address: data.address || '',
        phone: data.phone,
        isVerified: false,
      },
      include: { user: true },
    });
    return { success: true, data: distributor };
  }

  async updateDistributor(id: string, data: any) {
    const distributor = await this.prisma.distributor.findUnique({ where: { id }, include: { user: true } });
    if (!distributor) throw new Error('Distributor topilmadi');

    await this.prisma.user.update({
      where: { id: distributor.userId },
      data: { name: data.name, phone: data.phone, email: data.email },
    });
    const updated = await this.prisma.distributor.update({
      where: { id },
      data: { companyName: data.name, address: data.address, phone: data.phone },
      include: { user: true },
    });

    if (data.password) {
      const hashed = await bcrypt.hash(data.password, 10);
      await this.prisma.user.update({ where: { id: distributor.userId }, data: { password: hashed } });
    }
    return { success: true, data: updated };
  }

  async deleteDistributor(id: string) {
    const distributor = await this.prisma.distributor.findUnique({ where: { id } });
    if (!distributor) throw new Error('Distributor topilmadi');
    await this.prisma.distributor.delete({ where: { id } });
    return { success: true, message: "Distributor o'chirildi" };
  }
}