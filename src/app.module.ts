import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { ProductModule } from './modules/product/product.module';
import { OrderModule } from './modules/order/order.module';
import { DistributorModule } from './modules/distributor/distributor.module';
import { ClientModule } from './modules/client/client.module';
import { DriverModule } from './modules/driver/driver.module';
import { AdminModule } from './modules/admin/admin.module';
import { ChatModule } from './modules/chat/chat.module';
import { NotificationModule } from './modules/notification/notification.module';
import { DebtModule } from './modules/debt/debt.module';
import { ReviewModule } from './modules/review/review.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { StorageModule } from './modules/cloudinary/cloudinary.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { CategoryModule } from './modules/category/category.module';
import { UploadModule } from './modules/upload/upload.module';
import { BulkUploadModule } from './modules/bulk-upload/bulk-upload.module';
import { EventsModule } from './modules/events/events.module';
import { LocationModule } from './modules/location/location.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UserModule,
    ProductModule,
    OrderModule,
    DistributorModule,
    ClientModule,
    DriverModule,
    AdminModule,
    ChatModule,
    NotificationModule,
    DebtModule,
    ReviewModule,
    AnalyticsModule,
    StorageModule,
    InventoryModule,
    PricingModule,
    CategoryModule,
    UploadModule,
    BulkUploadModule,
    EventsModule,
    LocationModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule { }
