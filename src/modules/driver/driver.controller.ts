import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DriverService } from './driver.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Driver')
@Controller('driver')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.DRIVER)
@ApiBearerAuth()
export class DriverController {
  constructor(private driverService: DriverService) { }

  @Get('dashboard')
  @ApiOperation({ summary: 'Driver dashboard' })
  getDashboard(@CurrentUser('driver') driver: any) {
    return this.driverService.getDashboard(driver.id);
  }

  @Get('home')
  @ApiOperation({ summary: 'Home sahifasi statistikasi (sana bo\'yicha)' })
  getHomeStats(@CurrentUser('driver') driver: any, @Query('date') date?: string) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.driverService.getHomeStats(driver.id, targetDate);
  }

  @Post('location')
  @ApiOperation({ summary: 'Lokatsiyani yangilash' })
  updateLocation(@CurrentUser('driver') driver: any, @Body() body: { lat: number; lng: number }) {
    return this.driverService.updateLocation(driver.id, body.lat, body.lng);
  }

  @Patch('status')
  @ApiOperation({ summary: 'Online/offline status' })
  updateStatus(@CurrentUser('driver') driver: any, @Body('isOnline') isOnline: boolean) {
    return this.driverService.updateStatus(driver.id, isOnline);
  }

  @Post('orders/:orderId/accept')
  @ApiOperation({ summary: 'Buyurtmani qabul qilish' })
  acceptOrder(@Param('orderId') orderId: string, @CurrentUser('driver') driver: any) {
    return this.driverService.acceptOrder(driver.id, orderId);
  }

  @Patch('orders/:orderId/status')
  @ApiOperation({ summary: 'Buyurtma statusini yangilash' })
  updateOrderStatus(
    @Param('orderId') orderId: string,
    @CurrentUser('driver') driver: any,
    @Body()
    body: {
      status: string;
      photoProof?: string;
      signature?: string;
      problemReport?: string;
    },
  ) {
    return this.driverService.updateOrderStatus(
      orderId,
      driver.id,
      body.status,
      body.photoProof,
      body.signature,
      body.problemReport,
    );
  }

  @Get('orders')
  @ApiOperation({ summary: 'Tayinlangan buyurtmalar ro\'yxati' })
  getOrders(
    @CurrentUser('driver') driver: any,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.driverService.getOrders(
      driver.id,
      status,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
      date,
      startDate,
      endDate,
    );
  }

  @Get('orders/search/:orderNumber')
  @ApiOperation({ summary: 'Buyurtmani raqam bo\'yicha qidirish (to\'lov uchun)' })
  findOrderByNumber(
    @Param('orderNumber', ParseIntPipe) orderNumber: number,
    @CurrentUser('driver') driver: any,
  ) {
    return this.driverService.findOrderByNumber(driver.id, orderNumber);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Buyurtma tafsiloti' })
  getOrderById(@Param('orderId') orderId: string, @CurrentUser('driver') driver: any) {
    return this.driverService.getOrderById(driver.id, orderId);
  }

  @Post('orders/:orderId/collect-payment')
  @ApiOperation({ summary: 'To\'lovni qabul qilish (Naqd / Karta / Korporativ)' })
  collectPayment(
    @Param('orderId') orderId: string,
    @CurrentUser('driver') driver: any,
    @Body() body: { paymentMethod: string; amount: number },
  ) {
    return this.driverService.collectPayment(orderId, driver.id, body.paymentMethod, body.amount);
  }

  @Get('payment-stats')
  @ApiOperation({ summary: 'To\'lov turi bo\'yicha statistika (sana oralig\'i)' })
  getPaymentStats(
    @CurrentUser('driver') driver: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const today = new Date().toISOString().split('T')[0];
    return this.driverService.getPaymentStats(driver.id, startDate || today, endDate || today);
  }

  @Get('collections')
  @ApiOperation({ summary: 'Kimdan qancha va qanday shaklda to\'lov qabul qilgani (batafsil)' })
  getCollections(
    @CurrentUser('driver') driver: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const today = new Date().toISOString().split('T')[0];
    return this.driverService.getCollections(driver.id, startDate || today, endDate || today);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Sana oralig\'ida driver statistikasi (biriktirilgan, yetkazilgan, qabul qilingan summa)' })
  getStatistics(
    @CurrentUser('driver') driver: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const today = new Date().toISOString().split('T')[0];
    return this.driverService.getStatistics(driver.id, startDate || today, endDate || today);
  }

  @Get('earnings')
  @ApiOperation({ summary: 'Daromad tarixi' })
  getEarnings(
    @CurrentUser('driver') driver: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.driverService.getEarnings(driver.id, startDate, endDate, +page, +limit);
  }
}
