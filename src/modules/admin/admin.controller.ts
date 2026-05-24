import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) { }

  @Get('dashboard')
  @ApiOperation({ summary: 'Admin dashboard statistikasi' })
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('orders')
  @ApiOperation({ summary: 'Barcha buyurtmalar' })
  getRecentOrders(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getRecentOrders(status, search, page ? +page : 1, limit ? +limit : 20);
  }

  @Get('drivers/active')
  @ApiOperation({ summary: 'Faol haydovchilar' })
  getActiveDrivers() {
    return this.adminService.getActiveDrivers();
  }

  @Get('users')
  @ApiOperation({ summary: 'Barcha foydalanuvchilar' })
  getAllUsers(
    @Query('role') role?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAllUsers(role, search, page ? +page : 1, limit ? +limit : 20);
  }

  @Post('users')
  @ApiOperation({ summary: 'Yangi foydalanuvchi yaratish' })
  createUser(@Body() data: any) {
    return this.adminService.createUser(data);
  }

  @Delete('users/:userId')
  @ApiOperation({ summary: "Foydalanuvchini o'chirish" })
  deleteUser(@Param('userId') userId: string) {
    return this.adminService.deleteUser(userId);
  }

  @Patch('users/:userId/status')
  @ApiOperation({ summary: "Foydalanuvchi statusini o'zgartirish" })
  updateUserStatus(@Param('userId') userId: string, @Body('status') status: string) {
    return this.adminService.updateUserStatus(userId, status);
  }

  @Patch('users/:userId/role')
  @ApiOperation({ summary: "Foydalanuvchi rolini o'zgartirish" })
  updateUserRole(@Param('userId') userId: string, @Body('role') role: string) {
    return this.adminService.updateUserRole(userId, role);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Analitika' })
  getAnalytics(@Query('period') period?: string) {
    return this.adminService.getAnalytics(period);
  }

  @Get('distributors')
  @ApiOperation({ summary: 'Barcha distributorlar' })
  getAllDistributors() {
    return this.adminService.getAllDistributors();
  }

  @Post('distributors')
  @ApiOperation({ summary: 'Distributor yaratish' })
  createDistributor(@Body() data: any) {
    return this.adminService.createDistributor(data);
  }

  @Put('distributors/:id')
  @ApiOperation({ summary: 'Distributorni tahrirlash (PUT)' })
  updateDistributorPut(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateDistributor(id, data);
  }

  @Patch('distributors/:id')
  @ApiOperation({ summary: 'Distributorni tahrirlash (PATCH)' })
  updateDistributorPatch(@Param('id') id: string, @Body() data: any) {
    return this.adminService.updateDistributor(id, data);
  }

  @Delete('distributors/:id')
  @ApiOperation({ summary: "Distributorni o'chirish" })
  deleteDistributor(@Param('id') id: string) {
    return this.adminService.deleteDistributor(id);
  }

  @Get('distributors/:id/stats')
  @ApiOperation({ summary: 'Distributor statistikasi' })
  getDistributorStats(@Param('id') id: string) {
    return this.adminService.getDistributorStats(id);
  }

  @Get('stores/:storeId/payments')
  @ApiOperation({ summary: "Do'kon to'lovlari tarixi" })
  getStorePayments(@Param('storeId') storeId: string) {
    return this.adminService.getStorePayments(storeId);
  }
}