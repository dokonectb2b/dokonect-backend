import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrderService } from './order.service';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, OrderStatus } from '@prisma/client';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrderController {
  constructor(private orderService: OrderService) { }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Buyurtma berish (Client)' })
  create(@CurrentUser('client') client: any, @Body() dto: CreateOrderDto) {
    return this.orderService.create(client.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "O'z buyurtmalarim" })
  async findAll(
    @CurrentUser() user: any,
    @Query('status') status?: OrderStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    if (user.role === Role.CLIENT) {
      if (!user.client) return { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      return this.orderService.findAllForClient(user.client.id, status, +page, +limit);
    } else if (user.role === Role.DISTRIBUTOR) {
      if (!user.distributor) return { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      return this.orderService.findAllForDistributor(user.distributor.id, status, +page, +limit);
    } else if (user.role === Role.DRIVER) {
      if (!user.driver) return { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
      return this.orderService.findAllForDriver(user.driver.id, status);
    }
    return { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 0 } };
  }

  @Get('number/:orderNumber')
  @ApiOperation({ summary: 'Buyurtma tafsiloti (orderNumber bo\'yicha)' })
  findByOrderNumber(@Param('orderNumber', ParseIntPipe) orderNumber: number, @CurrentUser() user: any) {
    return this.orderService.findByOrderNumber(orderNumber, user.id, user.role);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buyurtma tafsiloti' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.orderService.findOne(id, user.id, user.role);
  }

  @Patch(':id/cancel')
  @UseGuards(RolesGuard)
  @Roles(Role.CLIENT)
  @ApiOperation({ summary: 'Buyurtmani bekor qilish (Client, faqat NEW statusda)' })
  cancelOrder(
    @Param('id') id: string,
    @CurrentUser('client') client: any,
    @Body('reason') reason?: string,
  ) {
    return this.orderService.cancelOrder(id, client.id, reason);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(Role.DISTRIBUTOR)
  @ApiOperation({ summary: "Buyurtma statusini o'zgartirish (Distributor)" })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser('distributor') distributor: any,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatus(id, distributor.id, dto);
  }
}
