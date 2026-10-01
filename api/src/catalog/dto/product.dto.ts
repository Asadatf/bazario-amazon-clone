import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, IsUrl, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Noise-cancelling headphones' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description!: string;

  @ApiProperty({ description: 'Price in integer cents', example: 19999 })
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  priceCents!: number;

  @ApiProperty({ example: 25 })
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock!: number;

  @ApiProperty({ example: 'https://cdn.dummyjson.com/product-images/laptops/apple-macbook-pro-14-inch-space-grey/thumbnail.webp' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl!: string;

  @ApiProperty()
  @IsUUID()
  categoryId!: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductResponse {
  @ApiProperty() id!: string;
  @ApiProperty() sellerId!: string;
  @ApiProperty() categoryId!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty() priceCents!: number;
  @ApiProperty() stock!: number;
  @ApiProperty() imageUrl!: string;
  @ApiProperty() ratingAvg!: number;
  @ApiProperty() ratingCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiPropertyOptional() sellerName?: string;
}
