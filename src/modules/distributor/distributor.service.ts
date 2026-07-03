import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DistributorService {
  constructor(private prisma: PrismaService) { }

  async getDashboard(distributorId: string | null) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const orderWhere: any = {};
    if (distributorId) orderWhere.distributorId = distributorId;

    const productWhere: any = {};
    if (distributorId) productWhere.distributorId = distributorId;

    // Oxirgi 7 kun uchun sanalar
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      return d;
    });

    const [incomingOrders, readyOrders, shippedOrders, lowStockProducts, revenue, activeDrivers, salesTrendRaw] =
      await Promise.all([
        this.prisma.order.count({ where: { ...orderWhere, status: 'NEW' } }),
        this.prisma.order.count({ where: { ...orderWhere, status: 'ACCEPTED' } }),
        this.prisma.order.count({
          where: { ...orderWhere, status: { in: ['PICKED', 'IN_TRANSIT', 'DELIVERED'] }, createdAt: { gte: today } },
        }),
        this.prisma.product.count({ where: productWhere }),
        this.prisma.order.aggregate({
          where: { ...orderWhere, createdAt: { gte: today } },
          _sum: { totalAmount: true },
        }),
        this.prisma.driver.count({ where: { isOnline: true } }),
        Promise.all(
          days.map((day) => {
            const nextDay = new Date(day);
            nextDay.setDate(nextDay.getDate() + 1);
            return this.prisma.order.aggregate({
              where: { ...orderWhere, createdAt: { gte: day, lt: nextDay } },
              _sum: { totalAmount: true },
              _count: { id: true },
            }).then((r) => ({
              date: day.toISOString().slice(0, 10),
              sales: r._sum.totalAmount || 0,
              count: r._count.id || 0,
            }));
          }),
        ),
      ]);

    return {
      incomingOrders,
      readyOrders,
      shippedOrders,
      lowStockProducts,
      revenue: revenue._sum.totalAmount || 0,
      activeDrivers,
      salesTrend: salesTrendRaw,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        distributor: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    return user;
  }

  async updateProfile(userId: string, data: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { distributor: true },
    });

    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    // Update user
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
      },
    });

    // Update distributor (undefined maydonlarni Prisma e'tiborsiz qoldiradi)
    if (user.distributor) {
      await this.prisma.distributor.update({
        where: { id: user.distributor.id },
        data: {
          companyName: data.companyName,
          address: data.address,
          phone: data.phone,
          description: data.description,
          driverCommission:
            data.driverCommission !== undefined ? Number(data.driverCommission) : undefined,
        },
      });
    }

    return { success: true, user: updatedUser };
  }

  // YANGI: Mini Dashboard uchun
  async getProductsDashboard(distributorId: string | null) {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const orderWhere: any = {
      createdAt: { gte: sevenDaysAgo },
      status: { in: ['DELIVERED', 'IN_TRANSIT', 'PICKED'] },
    };
    if (distributorId) {
      orderWhere.distributorId = distributorId;
    }

    const productWhere: any = {};
    if (distributorId) {
      productWhere.distributorId = distributorId;
    }

    // Top 5 eng ko'p sotilgan mahsulotlar
    const topSellingProducts = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: orderWhere,
      },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 5,
    });

    const topSellingIds = topSellingProducts.map((p) => p.productId);

    // Kam qolgan mahsulotlar
    const lowStockProducts = await this.prisma.inventory.findMany({
      where: {
        product: productWhere,
        quantity: { lte: this.prisma.inventory.fields.minThreshold },
      },
      include: {
        product: {
          include: { images: { where: { isCover: true }, take: 1 } },
        },
      },
      take: 10,
    });

    // Sekin sotilayotgan mahsulotlar
    const slowMovingProducts = await this.prisma.salesVelocity.findMany({
      where: {
        product: productWhere,
        status: { in: ['SLOW', 'DEAD'] },
      },
      include: {
        product: {
          include: { images: { where: { isCover: true }, take: 1 } },
        },
      },
      orderBy: { dailyAverage: 'asc' },
      take: 10,
    });

    // Eng ko'p buyurtma qilingan mahsulotlar
    const mostOrderedProducts = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          ...orderWhere,
          createdAt: { gte: sevenDaysAgo },
        },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    });

    const mostOrderedIds = mostOrderedProducts.map((p) => p.productId);

    // Barcha kerakli mahsulotlarni bitta query bilan olish (N+1 ni oldini olish)
    const allProductIds = [...new Set([...topSellingIds, ...mostOrderedIds])];
    const allProducts = allProductIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: allProductIds } },
          include: { images: { where: { isCover: true }, take: 1 } },
        })
      : [];
    const productMap = Object.fromEntries(allProducts.map((p) => [p.id, p]));

    const topProducts = topSellingProducts.map((item) => ({
      ...productMap[item.productId],
      soldQuantity: item._sum.quantity,
      revenue: item._sum.total,
    }));

    const mostOrdered = mostOrderedProducts.map((item) => ({
      ...productMap[item.productId],
      orderCount: item._count.id,
    }));

    return {
      topSellingProducts: topProducts,
      lowStockProducts,
      slowMovingProducts,
      mostOrderedProducts: mostOrdered,
    };
  }

  async getOrders(distributorId: string | null, status?: string, page = 1, limit = 20) {
    const where: any = {};
    if (distributorId) where.distributorId = distributorId;
    if (status) where.status = status;

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          client: { include: { user: true } },
          driver: { include: { user: true } },
          items: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data: orders,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async acceptOrder(orderId: string, distributorId: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, distributorId },
    });

    if (!order) {
      throw new NotFoundException('Buyurtma topilmadi');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'ACCEPTED' },
      include: {
        client: { include: { user: true } },
        items: { include: { product: true } },
      },
    });

    await this.prisma.orderStatusHistory.create({
      data: { orderId, status: 'ACCEPTED' },
    });

    return updatedOrder;
  }

  async rejectOrder(orderId: string, distributorId: string, reason: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, distributorId },
    });

    if (!order) {
      throw new NotFoundException('Buyurtma topilmadi');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'REJECTED', rejectionReason: reason },
    });

    await this.prisma.orderStatusHistory.create({
      data: { orderId, status: 'REJECTED', note: reason },
    });

    return updatedOrder;
  }

  async assignDriver(orderId: string, driverId: string, distributorId: string | null) {
    const where: any = { id: orderId };
    if (distributorId) where.distributorId = distributorId;

    const order = await this.prisma.order.findFirst({ where });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { driverId, status: 'ASSIGNED' },
      include: { driver: { include: { user: true } } },
    });

    await this.prisma.orderStatusHistory.create({
      data: { orderId, status: 'ASSIGNED' },
    });

    return updated;
  }

  async getStockLogs(distributorId: string | null) {
    const where: any = {};
    if (distributorId) {
      where.distributorId = distributorId;
    }

    return this.prisma.stockLog.findMany({
      where,
      include: { product: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getInventory(distributorId: string | null, warehouseId?: string, page = 1, limit = 20) {
    const where: any = {};
    if (distributorId) where.product = { distributorId };
    if (warehouseId) where.warehouseId = warehouseId;

    const skip = (page - 1) * limit;
    const [inventory, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        include: {
          product: {
            include: {
              images: { where: { isCover: true }, take: 1 },
              category: true,
            },
          },
          warehouse: true,
        },
        skip,
        take: limit,
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return {
      success: true,
      data: { inventory },
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateStock(
    productId: string,
    distributorId: string | null,
    quantity: number,
    type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'ADD' | 'SUBTRACT' | 'SET',
    note?: string,
    changedBy?: string,
  ) {
    // Frontend type nomlarini backend nomlariga moslashtirish
    const normalizedType: 'IN' | 'OUT' | 'ADJUSTMENT' =
      type === 'ADD' ? 'IN' :
        type === 'SUBTRACT' ? 'OUT' :
          type === 'SET' ? 'ADJUSTMENT' :
            type as 'IN' | 'OUT' | 'ADJUSTMENT';

    // Mahsulotni topish
    const where: any = { id: productId };
    if (distributorId) {
      where.distributorId = distributorId;
    }

    const product = await this.prisma.product.findFirst({ where });

    if (!product) {
      throw new NotFoundException('Mahsulot topilmadi');
    }

    // Inventory topish — yo'q bo'lsa avtomatik yaratish
    let inventories = await this.prisma.inventory.findMany({
      where: { productId },
    });

    if (!inventories || inventories.length === 0) {
      // Warehouse topish yoki yaratish
      let warehouse = distributorId
        ? await this.prisma.warehouse.findFirst({ where: { distributorId } })
        : null;

      if (!warehouse && distributorId) {
        warehouse = await this.prisma.warehouse.create({
          data: {
            distributor: { connect: { id: distributorId } },
            name: 'Asosiy ombor',
            address: '',
            region: 'Noma\'lum',
          },
        });
      }

      if (warehouse) {
        const created = await this.prisma.inventory.create({
          data: {
            productId,
            warehouseId: warehouse.id,
            quantity: 0,
            minThreshold: 10,
          },
        });
        inventories = [created];
      } else {
        throw new NotFoundException('Ombor topilmadi');
      }
    }

    // Har bir inventory ni yangilash
    const updatePromises = inventories.map(async (inventory) => {
      let newQuantity = inventory.quantity;
      if (normalizedType === 'IN') {
        newQuantity += quantity;
      } else if (normalizedType === 'OUT') {
        newQuantity -= quantity;
      } else if (normalizedType === 'ADJUSTMENT') {
        newQuantity = quantity;
      }

      return this.prisma.inventory.update({
        where: { id: inventory.id },
        data: { quantity: Math.max(0, newQuantity) },
      });
    });

    await Promise.all(updatePromises);

    // Stock log yaratish
    if (distributorId) {
      await this.prisma.stockLog.create({
        data: {
          productId,
          distributorId,
          type: normalizedType,
          quantity,
          note,
          changedBy,
        },
      });
    }

    // Total quantity ni hisoblash
    const updatedInventories = await this.prisma.inventory.findMany({
      where: { productId },
    });
    const totalQuantity = updatedInventories.reduce(
      (sum, inv) => sum + inv.quantity,
      0,
    );

    return { success: true, newQuantity: totalQuantity };
  }

  async getDrivers(distributorId: string | null, page = 1, limit = 20) {
    const where: any = {};
    if (distributorId) where.distributorId = distributorId;

    const skip = (page - 1) * limit;
    const [drivers, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        include: {
          user: true,
          _count: { select: { orders: true, deliveries: true } },
        },
        orderBy: { user: { name: 'asc' } },
        skip,
        take: limit,
      }),
      this.prisma.driver.count({ where }),
    ]);

    return {
      success: true,
      data: drivers,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.startsWith('998') ? `+${digits}` : `+998${digits}`;
  }

  async createDriver(distributorId: string | null, data: any) {
    // Validate required fields
    if (!data.name || !data.phone) {
      throw new Error('Ism va telefon raqam majburiy');
    }

    if (!data.password || data.password.length < 6) {
      throw new Error('Parol kamida 6 ta belgidan iborat bo\'lishi kerak');
    }

    // Telefon raqamni yagona formatga keltiramiz (+998XXXXXXXXX) — Mini App
    // kirishidagi normalizePhone bilan mos bo'lishi uchun
    const normalizedPhone = this.normalizePhone(data.phone);

    // Check if phone already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { phone: normalizedPhone },
      include: { driver: true },
    });

    if (existingUser) {
      throw new Error('Bu telefon raqam allaqachon ro\'yxatdan o\'tgan. Boshqa raqam kiriting.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    try {
      // Create user
      const user = await this.prisma.user.create({
        data: {
          name: data.name,
          phone: normalizedPhone,
          password: hashedPassword,
          role: 'DRIVER',
          status: 'ACTIVE',
        },
      });

      // Create driver profile
      const driverData: any = {
        userId: user.id,
        vehicleType: data.vehicleType || 'Sedan',
        vehicleNumber: data.plateNumber || '',
        licenseNumber: data.licenseNumber || '',
      };
      if (data.commission !== undefined && data.commission !== '' && data.commission !== null) {
        driverData.commission = Number(data.commission);
      }

      // Distribyutorga bog'lash
      if (distributorId) {
        driverData.distributorId = distributorId;
      }

      const driver = await this.prisma.driver.create({
        data: driverData,
      });

      return { success: true, data: { ...driver, user } };
    } catch (error: any) {
      // Handle Prisma unique constraint error
      if (error.code === 'P2002') {
        throw new Error('Bu telefon raqam allaqachon ro\'yxatdan o\'tgan');
      }
      throw new Error(error.message || 'Haydovchi yaratishda xatolik');
    }
  }

  async updateDriver(driverId: string, distributorId: string, data: any) {
    const where: any = { id: driverId };

    // Faqat o'z haydovchisini yangilashi mumkin
    if (distributorId) {
      where.distributorId = distributorId;
    }

    const driver = await this.prisma.driver.findFirst({
      where,
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException('Haydovchi topilmadi yoki sizga tegishli emas');
    }

    // Update user
    await this.prisma.user.update({
      where: { id: driver.userId },
      data: {
        name: data.name,
        phone: data.phone,
        status: data.status,
      },
    });

    // Update driver
    const updatedDriver = await this.prisma.driver.update({
      where: { id: driverId },
      data: {
        vehicleType: data.vehicleType,
        vehicleNumber: data.plateNumber,
        status: data.status,
        // Komissiya: bo'sh/null → umumiy foizga qaytadi, son → shaxsiy foiz
        commission:
          data.commission === undefined
            ? undefined
            : (data.commission === '' || data.commission === null ? null : Number(data.commission)),
      },
      include: { user: true },
    });

    // Update password if provided
    if (data.password) {
      const hashedPassword = await bcrypt.hash(data.password, 10);
      await this.prisma.user.update({
        where: { id: driver.userId },
        data: { password: hashedPassword },
      });
    }

    return { success: true, data: updatedDriver };
  }

  async getConnectionRequests(distributorId: string | null, status?: string, page = 1, limit = 20) {
    const where: any = distributorId ? { distributorId } : {};
    if (status) where.status = status;

    const skip = (page - 1) * limit;
    const [links, total] = await Promise.all([
      this.prisma.storeDistributorLink.findMany({
        where,
        include: {
          storeOwner: {
            include: {
              user: { select: { id: true, name: true, phone: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.storeDistributorLink.count({ where }),
    ]);

    return {
      success: true,
      data: links,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async respondToConnection(linkId: string, distributorId: string | null, action: 'APPROVED' | 'REJECTED') {
    const link = await this.prisma.storeDistributorLink.findFirst({
      where: {
        id: linkId,
        ...(distributorId ? { distributorId } : {}),
      },
    });
    if (!link) throw new NotFoundException("Ulanish so'rovi topilmadi");

    const updated = await this.prisma.storeDistributorLink.update({
      where: { id: linkId },
      data: { status: action },
    });
    return { success: true, data: updated };
  }

  async deleteDriver(driverId: string, distributorId: string | null) {
    const where: any = { id: driverId };

    // Faqat o'z haydovchisini o'chirishi mumkin
    if (distributorId) {
      where.distributorId = distributorId;
    }

    const driver = await this.prisma.driver.findFirst({
      where,
      include: { user: true },
    });

    if (!driver) {
      throw new NotFoundException('Haydovchi topilmadi yoki sizga tegishli emas');
    }

    try {
      // Delete user first (this will cascade delete driver due to onDelete: Cascade)
      await this.prisma.user.delete({
        where: { id: driver.userId },
      });

      return { success: true, message: 'Haydovchi o\'chirildi' };
    } catch (error: any) {
      throw new Error('Haydovchini o\'chirishda xatolik: ' + error.message);
    }
  }
}
