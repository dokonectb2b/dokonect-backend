import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PromoCodeService } from './promo-code.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Promo Codes')
@Controller('promo-codes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PromoCodeController {
  constructor(private promoCodeService: PromoCodeService) { }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiOperation({ summary: "Promo kodlar ro'yxati" })
  getPromoCodes(
    @CurrentUser() user: any,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const distributorId = user.distributor?.id || null;
    return this.promoCodeService.getPromoCodes(distributorId, +page, +limit);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Yangi promo kod' })
  createPromoCode(
    @CurrentUser() user: any,
    @Body()
    body: {
      code: string;
      discountType: 'PERCENT' | 'FIXED';
      discountValue: number;
      minOrderAmount?: number;
      maxUses?: number;
      usesPerClient?: number;
      validFrom?: Date;
      validTo?: Date;
      applicableTo?: any;
    },
  ) {
    const distributorId = user.distributor?.id || null;
    return this.promoCodeService.createPromoCode(distributorId, body);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Promo kodni tahrirlash' })
  updatePromoCode(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body()
    body: {
      discountValue?: number;
      minOrderAmount?: number;
      maxUses?: number;
      usesPerClient?: number;
      validFrom?: Date;
      validTo?: Date;
    },
  ) {
    const distributorId = user.distributor?.id || null;
    return this.promoCodeService.updatePromoCode(id, distributorId, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiOperation({ summary: "Promo kodni o'chirish" })
  deletePromoCode(@Param('id') id: string, @CurrentUser() user: any) {
    const distributorId = user.distributor?.id || null;
    return this.promoCodeService.deletePromoCode(id, distributorId);
  }

  @Post('validate')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Promo kodni tekshirish' })
  validatePromoCode(
    @CurrentUser('client') client: any,
    @Body() body: { code: string; orderAmount: number },
  ) {
    return this.promoCodeService.validatePromoCode(body.code, client.id, body.orderAmount);
  }
}
