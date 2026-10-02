import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

export const MAX_LINE_QUANTITY = 30;

export class AddCartItemDto {
  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY, default: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: MAX_LINE_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QUANTITY)
  quantity!: number;
}

export const MAX_GUEST_LINES = 50;

/** A cart held by a signed-out browser: only ids and quantities. Prices are never accepted from the client. */
export class GuestCartDto {
  @ApiProperty({ type: [AddCartItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_GUEST_LINES)
  @ValidateNested({ each: true })
  @Type(() => AddCartItemDto)
  items!: AddCartItemDto[];
}
