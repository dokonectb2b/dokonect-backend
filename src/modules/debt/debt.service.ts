import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DebtService {
  constructor(private prisma: PrismaService) { }

  async getClientDebts(clientId: string) {
    const debts = await this.prisma.debt.findMany({
      where: { clientId },
      include: {
        order: {
          select: {
            id: true,
            // orderNumber: true, // TODO: Uncomment after prisma generate
            createdAt: true,
            totalAmount: true,
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
          },
        },
        distributor: {
          select: {
            id: true,
            companyName: true,
            phone: true,
            logo: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Qo'shimcha statistika
    const summary = {
      total: debts.length,
      unpaid: debts.filter(d => d.status === 'UNPAID').length,
      partial: debts.filter(d => d.status === 'PARTIAL').length,
      paid: debts.filter(d => d.status === 'PAID').length,
      overdue: debts.filter(d => d.status === 'OVERDUE').length,
      totalAmount: debts.reduce((sum, d) => sum + d.remainingAmount, 0),
    };

    return {
      debts,
      summary,
    };
  }

  async getDistributorDebts(distributorId: string) {
    const debts = await this.prisma.debt.findMany({
      where: { distributorId },
      include: {
        order: {
          select: {
            id: true,
            // orderNumber: true, // TODO: Uncomment after prisma generate
            createdAt: true,
            totalAmount: true,
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
          },
        },
        client: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Distribyutor uchun statistika
    const summary = {
      total: debts.length,
      unpaid: debts.filter(d => d.status === 'UNPAID').length,
      partial: debts.filter(d => d.status === 'PARTIAL').length,
      paid: debts.filter(d => d.status === 'PAID').length,
      overdue: debts.filter(d => d.status === 'OVERDUE').length,
      totalReceivable: debts.reduce((sum, d) => sum + d.remainingAmount, 0),
      totalReceived: debts.reduce((sum, d) => sum + d.paidAmount, 0),
    };

    return {
      debts,
      summary,
    };
  }

  async payDebt(debtId: string, amount: number) {
    const debt = await this.prisma.debt.findUnique({
      where: { id: debtId },
    });

    if (!debt) {
      throw new NotFoundException('Qarz topilmadi');
    }

    const newPaidAmount = debt.paidAmount + amount;
    const newRemainingAmount = debt.originalAmount - newPaidAmount;

    let status = debt.status;
    if (newRemainingAmount <= 0) {
      status = 'PAID';
    } else if (newPaidAmount > 0) {
      status = 'PARTIAL';
    }

    return this.prisma.debt.update({
      where: { id: debtId },
      data: {
        paidAmount: newPaidAmount,
        remainingAmount: newRemainingAmount,
        status,
      },
    });
  }

  async acceptPaymentForClient(clientId: string, amount: number, debtId?: string, note?: string) {
    // Agar debtId berilgan bo'lsa, faqat shu qarzni to'lash
    if (debtId) {
      const debt = await this.prisma.debt.findUnique({
        where: { id: debtId },
        include: {
          client: true,
          distributor: true,
        },
      });

      if (!debt) {
        throw new NotFoundException('Qarz topilmadi');
      }

      if (debt.clientId !== clientId) {
        throw new NotFoundException('Bu qarz ushbu clientga tegishli emas');
      }

      return this.payDebt(debtId, amount);
    }

    // Agar debtId berilmagan bo'lsa, eng eski qarzdan boshlab to'lash
    const debts = await this.prisma.debt.findMany({
      where: {
        clientId,
        status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
      },
      orderBy: [
        { status: 'desc' }, // OVERDUE birinchi (O > P > U alphabetically)
        { dueDate: 'asc' }, // Muddati eng yaqin bo'lganidan
        { createdAt: 'asc' }, // Eng eskisidan
      ],
    });

    if (debts.length === 0) {
      throw new NotFoundException('To\'lanmagan qarzlar topilmadi');
    }

    // Transaction ichida bajarish
    return await this.prisma.$transaction(async (prisma) => {
      let remainingAmount = amount;
      const paidDebts = [];

      for (const debt of debts) {
        if (remainingAmount <= 0) break;

        const debtRemaining = debt.remainingAmount;
        const paymentForThisDebt = Math.min(remainingAmount, debtRemaining);

        const newPaidAmount = debt.paidAmount + paymentForThisDebt;
        const newRemainingAmount = debt.originalAmount - newPaidAmount;

        let status = debt.status;
        if (newRemainingAmount <= 0) {
          status = 'PAID';
        } else if (newPaidAmount > 0) {
          status = 'PARTIAL';
        }

        const updatedDebt = await prisma.debt.update({
          where: { id: debt.id },
          data: {
            paidAmount: newPaidAmount,
            remainingAmount: newRemainingAmount,
            status,
          },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                totalAmount: true,
              },
            },
          },
        });

        paidDebts.push({
          debtId: updatedDebt.id,
          orderId: updatedDebt.orderId,
          orderNumber: updatedDebt.order?.orderNumber,
          paidAmount: paymentForThisDebt,
          remainingAmount: updatedDebt.remainingAmount,
          status: updatedDebt.status,
        });

        remainingAmount -= paymentForThisDebt;
      }

      return {
        success: true,
        totalPaid: amount,
        remainingAmount,
        paidDebts,
        note,
      };
    });
  }

  async getDebtSummary(clientId: string) {
    const debts = await this.prisma.debt.findMany({
      where: { clientId },
    });

    const totalDebt = debts.reduce((sum, d) => sum + d.remainingAmount, 0);
    const totalPaid = debts.reduce((sum, d) => sum + d.paidAmount, 0);

    const now = new Date();
    const overdueDebts = debts.filter((d) => d.dueDate && d.dueDate < now && d.status !== 'PAID');

    return {
      totalDebt,
      totalPaid,
      overdueCount: overdueDebts.length,
      overdueAmount: overdueDebts.reduce((sum, d) => sum + d.remainingAmount, 0),
    };
  }
}
