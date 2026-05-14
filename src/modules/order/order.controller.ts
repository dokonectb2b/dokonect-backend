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
  async findAll(@CurrentUser() user: any, @Query('status') status?: OrderStatus) {
    console.log('📦 Orders request - User:', {
      id: user.id,
      role: user.role,
      hasClient: !!user.client,
      hasDistributor: !!user.distributor
    });

    if (user.role === Role.CLIENT) {
      if (!user.client) {
        console.error('❌ CLIENT role but no client data');
        return [];
      }
      return this.orderService.findAllForClient(user.client.id, status);
    } else if (user.role === Role.DISTRIBUTOR) {
      if (!user.distributor) {
        console.error('❌ DISTRIBUTOR role but no distributor data');
        return [];
      }
      return this.orderService.findAllForDistributor(user.distributor.id, status);
    } else if (user.role === Role.DRIVER) {
      // Driver uchun ham qo'shamiz
      if (!user.driver) {
        console.error('❌ DRIVER role but no driver data');
        return [];
      }
      return this.orderService.findAllForDriver(user.driver.id, status);
    }

    console.error('❌ Unknown role or no data:', user.role);
    return [];
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
