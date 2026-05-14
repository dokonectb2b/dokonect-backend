import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductService } from './product.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { ProductHistoryService } from './product-history.service';
import { CreateProductDto, UpdateProductDto, ProductQueryDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('Products')
@Controller('products')
export class ProductController {
  constructor(
    private productService: ProductService,
    private analyticsService: ProductAnalyticsService,
    private historyService: ProductHistoryService,
    private prisma: PrismaService,
  ) { }

  @Get()
  @ApiOperation({ summary: 'Barcha mahsulotlar (filters va sort bilan)' })
  findAll(@Query() query: ProductQueryDto) {
    return this.productService.findAll(query);
  }

  @Get('popular')
  @ApiOperation({ summary: 'Eng mashhur mahsulotlar (eng tez sotilayotganlar)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nechta mahsulot qaytarish (default: 10)', example: 10 })
  @ApiQuery({ name: 'distributorId', required: false, type: String, description: 'Distribyutor ID (optional)' })
  getPopular(@Query('limit') limit: string = '10', @Query('distributorId') distributorId?: string) {
    return this.productService.getPopularProducts(parseInt(limit), distributorId);
  }

  @Get('categories')
  @ApiOperation({ summary: "Kategoriyalar ro'yxati" })
  getCategories(@Query('distributorId') distributorId?: string) {
    return this.productService.getCategories(distributorId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta mahsulot (analytics va history bilan)' })
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Mahsulot analitikasi (7/30 kunlik grafik)' })
  getAnalytics(@Param('id') id: string, @Query('period') period: '7d' | '30d' = '7d') {
    return this.analyticsService.getProductAnalytics(id, period);
  }

  @Get(':id/history')
  @ApiOperation({ summary: "Mahsulot tarixi (narx va stock o'zgarishlari)" })
  getHistory(@Param('id') id: string) {
    return this.historyService.getProductHistory(id);
  }

  @Post(':id/calculate-velocity')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DISTRIBUTOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sales velocity hisoblash' })
  calculateVelocity(@Param('id') id: string) {
    return this.analyticsService.calculateSalesVelocity(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Yangi mahsulot yaratish (Distributor/Admin)' })
  async create(
    @CurrentUser() user: any,
    @Query('distributorId') distributorId: string,
    @Body() dto: CreateProductDto,
  ) {
    try {
      let distId = user.distributor?.id || distributorId;

      if (!distId) {
        throw new BadRequestException('distributorId query parametri majburiy');
      }
      return this.productService.create(distId, dto);
    } catch (error: any) {
      console.error('Create product error:', error);
      throw error;
    }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mahsulotni tahrirlash PUT (Distributor/Admin)' })
  updatePut(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateProductDto,
  ) {
    const distributorId = user.distributor?.id;
    return this.productService.update(id, distributorId, dto, user.id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mahsulotni tahrirlash PATCH (Distributor/Admin)' })
  updatePatch(
    @Param('id') id: string,
    @CurrentUser() user: any,
    @Body() dto: UpdateProductDto,
  ) {
    const distributorId = user.distributor?.id;
    return this.productService.update(id, distributorId, dto, user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Mahsulotni o'chirish (Distributor/Admin)" })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    const distributorId = user.distributor?.id;
    return this.productService.remove(id, distributorId);
  }
}
