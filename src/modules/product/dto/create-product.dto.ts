import { IsString, IsNumber, IsOptional, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus, DiscountType } from '@prisma/client';

class ProductVariantDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  color?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  size?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  model?: string;

  @ApiProperty()
  @IsString()
  skuVariant: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  priceOverride?: number;
}

export class CreateProductDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  sku: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsNumber()
  wholesalePrice: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  retailPrice?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  costPrice?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  brandId?: string;

  @ApiPropertyOptional({ enum: ProductStatus })
  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @ApiPropertyOptional({ enum: DiscountType })
  @IsEnum(DiscountType)
  @IsOptional()
  discountType?: DiscountType;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  discountValue?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  youtubeUrl?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({ type: [ProductVariantDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  @IsOptional()
  variants?: ProductVariantDto[];

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  initialStock?: number;
}
