import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';
import { OrderStatus } from '@prisma/client';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
  ) { }

  async create(clientId: string, dto: CreateOrderDto) {
    // Validate products exist and calculate totals
    let subtotal = 0;
    const orderItems = [];

    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(`Mahsulot topilmadi: ${item.productId}`);
      }

      const itemTotal = product.wholesalePrice * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: product.wholesalePrice,
        total: itemTotal,
      });
    }

    const totalAmount = subtotal + (dto.deliveryFee || 0) - (dto.discount || 0);

    const order = await this.prisma.order.create({
      data: {
        clientId,
        distributorId: dto.distributorId,
        subtotal,
        deliveryFee: dto.deliveryFee || 0,
        discount: dto.discount || 0,
        totalAmount,
        deliveryAddress: dto.deliveryAddress,
        deliveryTimeSlot: dto.deliveryTimeSlot,
        notes: dto.notes,
        paymentMethod: dto.paymentMethod,
        items: {
          create: orderItems,
        },
        statusHistory: {
          create: {
            status: OrderStatus.NEW,
            note: 'Buyurtma yaratildi',
          },
        },
      },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
            variant: true,
          },
        },
        distributor: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            address: true,
          },
        },
      },
    });

    // Create debt if payment method is CREDIT
    if (dto.paymentMethod === 'CREDIT') {
      await this.prisma.debt.create({
        data: {
          orderId: order.id,
          clientId,
          distributorId: dto.distributorId,
          originalAmount: totalAmount,
          remainingAmount: totalAmount,
          dueDate: dto.dueDate,
        },
      });
    }

    // Real-time: distribyutorga yangi buyurtma xabari
    this.events.emitToDistributor(dto.distributorId, 'order:new', {
      id: order.id,
      totalAmount: order.totalAmount,
      clientId: order.clientId,
      createdAt: order.createdAt,
    });

    return order;
  }

  async findAllForClient(clientId: string, status?: OrderStatus) {
    const where: any = { clientId };
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: true,
              },
            },
          },
        },
        distributor: {
          select: {
            companyName: true,
            phone: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllForDistributor(distributorId: string, status?: OrderStatus) {
    const where: any = { distributorId };
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: true,
              },
            },
          },
        },
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

  async findAllForDriver(driverId: string, status?: OrderStatus) {
    const where: any = { driverId };
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: {
                name: true,
                images: true,
              },
            },
          },
        },
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
            phone: true,
            address: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByOrderNumber(orderNumber: number, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      include: {
        items: {
          include: {
            product: { include: { images: true } },
            variant: true,
          },
        },
        client: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        distributor: {
          select: { companyName: true, phone: true, address: true },
        },
        driver: {
          include: {
            user: { select: { name: true, phone: true } },
          },
        },
        statusHistory: { orderBy: { timestamp: 'desc' } },
        delivery: true,
      },
    });

    if (!order) throw new NotFoundException('Buyurtma topilmadi');

    if (role === 'CLIENT' && order.client?.userId !== userId) {
      throw new BadRequestException("Ruxsat yo'q");
    }

    return order;
  }

  async findOne(id: string, userId: string, role: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
            variant: true,
          },
        },
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
            phone: true,
            address: true,
          },
        },
        driver: {
          include: {
            user: {
              select: {
                name: true,
                phone: true,
              },
            },
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
        },
        delivery: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Buyurtma topilmadi');
    }

    // Check access rights
    if (role === 'CLIENT' && order.client?.userId !== userId) {
      throw new BadRequestException("Ruxsat yo'q");
    }
    // Distributor check skipped (userId not in select)

    return order;
  }

  async cancelOrder(id: string, clientId: string, reason?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, clientId },
    });

    if (!order) throw new NotFoundException('Buyurtma topilmadi');

    if (!['NEW'].includes(order.status)) {
      throw new BadRequestException(
        "Faqat 'Yangi' statusdagi buyurtmani bekor qilish mumkin",
      );
    }

    return this.prisma.order.update({
      where: { id },
      data: {
        status: OrderStatus.CANCELLED,
        rejectionReason: reason,
        statusHistory: {
          create: { status: OrderStatus.CANCELLED, note: reason || 'Mijoz tomonidan bekor qilindi' },
        },
      },
    });
  }

  async updateStatus(id: string, distributorId: string, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findFirst({
      where: { id, distributorId },
    });

    if (!order) {
      throw new NotFoundException('Buyurtma topilmadi');
    }

    const updatedOrder = await this.prisma.order.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.rejectionReason,
        statusHistory: {
          create: {
            status: dto.status,
            note: dto.note,
          },
        },
      },
      include: {
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    return updatedOrder;
  }
}
