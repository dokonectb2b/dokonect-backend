import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DebtService } from './debt.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Debts')
@Controller('debts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DebtController {
  constructor(private debtService: DebtService) { }

  @Get('client')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Do\'kon egasining qarzlari' })
  getClientDebts(@CurrentUser() user: any) {
    console.log('💰 Client debts request - User:', {
      id: user.id,
      role: user.role,
      hasClient: !!user.client,
      clientId: user.client?.id
    });

    if (!user.client) {
      console.error('❌ CLIENT role but no client data');
      return [];
    }
    return this.debtService.getClientDebts(user.client.id);
  }

  @Get('distributor')
  @UseGuards(RolesGuard)
  @Roles(Role.DISTRIBUTOR)
  @ApiOperation({ summary: 'Distribyutor qarzlari (mijozlardan)' })
  getDistributorDebts(@CurrentUser() user: any) {
    console.log('💰 Distributor debts request - User:', {
      id: user.id,
      role: user.role,
      hasDistributor: !!user.distributor,
      distributorId: user.distributor?.id
    });

    if (!user.distributor) {
      console.error('❌ DISTRIBUTOR role but no distributor data');
      return [];
    }
    return this.debtService.getDistributorDebts(user.distributor.id);
  }

  @Post(':debtId/pay')
  @ApiOperation({ summary: "Qarzni to'lash" })
  payDebt(@Param('debtId') debtId: string, @Body('amount') amount: number) {
    return this.debtService.payDebt(debtId, amount);
  }

  @Post('client/:clientId/pay')
  @UseGuards(RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiOperation({ summary: "Client uchun to'lov qabul qilish (Customer ID bo'yicha)" })
  acceptPaymentForClient(
    @Param('clientId') clientId: string,
    @Body() body: { amount: number; debtId?: string; note?: string }
  ) {
    return this.debtService.acceptPaymentForClient(clientId, body.amount, body.debtId, body.note);
  }

  @Get('summary')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Qarz xulosasi (umumiy, to\'langan, muddati o\'tgan)' })
  getDebtSummary(@CurrentUser() user: any) {
    if (!user.client) {
      return {
        totalDebt: 0,
        totalPaid: 0,
        overdueCount: 0,
        overdueAmount: 0,
      };
    }
    return this.debtService.getDebtSummary(user.client.id);
  }
}
