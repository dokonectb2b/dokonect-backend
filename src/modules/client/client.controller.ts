import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ClientService } from './client.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@ApiTags('Client')
@Controller('client')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.CLIENT)
@ApiBearerAuth()
export class ClientController {
  constructor(private clientService: ClientService) { }

  @Get('profile')
  @ApiOperation({ summary: 'Client profili' })
  getClientProfile(@CurrentUser('client') client: any) {
    return this.clientService.getClientById(client.id);
  }

  @Get(':clientId')
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Client ma\'lumotlari (ID bo\'yicha)' })
  getClientById(@Param('clientId') clientId: string) {
    return this.clientService.getClientById(clientId);
  }

  @Get('code/:customerCode')
  @Roles(Role.DISTRIBUTOR, Role.ADMIN)
  @ApiOperation({ summary: 'Client ma\'lumotlari (Customer Code bo\'yicha)' })
  getClientByCustomerCode(@Param('customerCode') customerCode: string) {
    return this.clientService.getClientByCustomerCode(customerCode);
  }
  @Patch('profile')
  @ApiOperation({ summary: 'Profil yangilash' })
  updateProfile(@CurrentUser() user: any, @Body() data: any) {
    return this.clientService.updateProfile(user.id, data);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Client dashboard' })
  getDashboard(@CurrentUser('client') client: any) {
    return this.clientService.getDashboard(client.id);
  }

  @Get('products')
  @ApiOperation({ summary: "Mahsulotlar ro'yxati" })
  getProducts(@CurrentUser('client') client: any, @Query() query: any) {
    return this.clientService.getProducts(client.id, query);
  }

  @Get('distributors')
  @ApiOperation({ summary: "Distribyutorlar ro'yxati" })
  getDistributors(
    @CurrentUser('client') client: any,
    @Query('region') region?: string,
    @Query('search') search?: string,
  ) {
    return this.clientService.getDistributors(client.id, region, search);
  }

  @Get('distributors/:distributorId')
  @ApiOperation({ summary: "Distribyutor tafsilotlari" })
  getDistributorById(
    @Param('distributorId') distributorId: string,
    @CurrentUser('client') client: any,
  ) {
    return this.clientService.getDistributorById(client.id, distributorId);
  }

  @Get('finance')
  @ApiOperation({ summary: "Moliyaviy ma'lumotlar" })
  getFinanceSummary(@CurrentUser('client') client: any) {
    return this.clientService.getFinanceSummary(client.id);
  }

  @Get('orders/tracking/:orderId')
  @ApiOperation({ summary: 'Buyurtma tracking' })
  getOrderTracking(@Param('orderId') orderId: string, @CurrentUser('client') client: any) {
    return this.clientService.getOrderTracking(orderId, client.id);
  }

  @Get('orders/stats')
  @ApiOperation({ summary: 'Buyurtma statistikasi' })
  getOrderStats(@CurrentUser('client') client: any) {
    return this.clientService.getOrderStats(client.id);
  }

  @Post('orders/:orderId/rate')
  @ApiOperation({ summary: 'Yetkazib berishni baholash' })
  rateDelivery(
    @Param('orderId') orderId: string,
    @CurrentUser('client') client: any,
    @Body() body: { rating: number; comment?: string },
  ) {
    return this.clientService.rateDelivery(orderId, client.id, body.rating, body.comment);
  }
}
