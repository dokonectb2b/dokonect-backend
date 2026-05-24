import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PricingService } from './pricing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Pricing')
@Controller('pricing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DISTRIBUTOR)
@ApiBearerAuth()
export class PricingController {
  constructor(private pricingService: PricingService) {}

  // Price Rules
  @Get('price-rules')
  @ApiOperation({ summary: "Narx qoidalari ro'yxati" })
  getPriceRules(
    @CurrentUser('distributor') distributor: any,
    @Query('productId') productId?: string,
  ) {
    return this.pricingService.getPriceRules(distributor.id, productId);
  }

  @Post('price-rules')
  @ApiOperation({ summary: 'Yangi narx qoidasi' })
  createPriceRule(
    @CurrentUser('distributor') distributor: any,
    @Body()
    body: {
      productId: string;
      variantId?: string;
      clientId?: string;
      price: number;
      validFrom?: Date;
      validTo?: Date;
    },
  ) {
    return this.pricingService.createPriceRule(distributor.id, body);
  }

  @Put('price-rules/:id')
  @ApiOperation({ summary: 'Narx qoidasini tahrirlash' })
  updatePriceRule(
    @Param('id') id: string,
    @CurrentUser('distributor') distributor: any,
    @Body()
    body: {
      price?: number;
      validFrom?: Date;
      validTo?: Date;
    },
  ) {
    return this.pricingService.updatePriceRule(id, distributor.id, body);
  }

  @Delete('price-rules/:id')
  @ApiOperation({ summary: "Narx qoidasini o'chirish" })
  deletePriceRule(@Param('id') id: string, @CurrentUser('distributor') distributor: any) {
    return this.pricingService.deletePriceRule(id, distributor.id);
  }

  // Bulk Rules
  @Get('bulk-rules')
  @ApiOperation({ summary: 'Bulk narx qoidalari' })
  getBulkRules(
    @CurrentUser('distributor') distributor: any,
    @Query('productId') productId?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.pricingService.getBulkRules(distributor.id, productId, +page, +limit);
  }

  @Post('bulk-rules')
  @ApiOperation({ summary: 'Yangi bulk qoidasi' })
  createBulkRule(
    @CurrentUser('distributor') distributor: any,
    @Body()
    body: {
      productId: string;
      minQuantity: number;
      maxQuantity?: number;
      discountType: 'PERCENT' | 'FIXED';
      discountValue: number;
    },
  ) {
    return this.pricingService.createBulkRule(distributor.id, body);
  }

  @Put('bulk-rules/:id')
  @ApiOperation({ summary: 'Bulk qoidasini tahrirlash' })
  updateBulkRule(
    @Param('id') id: string,
    @CurrentUser('distributor') distributor: any,
    @Body()
    body: {
      minQuantity?: number;
      maxQuantity?: number;
      discountType?: 'PERCENT' | 'FIXED';
      discountValue?: number;
    },
  ) {
    return this.pricingService.updateBulkRule(id, distributor.id, body);
  }

  @Delete('bulk-rules/:id')
  @ApiOperation({ summary: "Bulk qoidasini o'chirish" })
  deleteBulkRule(@Param('id') id: string, @CurrentUser('distributor') distributor: any) {
    return this.pricingService.deleteBulkRule(id, distributor.id);
  }

  // Calculate price
  @Get('calculate')
  @ApiOperation({ summary: 'Narxni hisoblash' })
  calculatePrice(
    @Query('productId') productId: string,
    @Query('clientId') clientId: string,
    @Query('quantity') quantity: number,
  ) {
    return this.pricingService.calculatePrice(productId, clientId, +quantity);
  }
}
