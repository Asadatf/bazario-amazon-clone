import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, ValidateNested } from 'class-validator';
import { CreateAddressDto } from '../../users/dto/address.dto';

export class CreateOrderDto {
  @ApiProperty({ type: CreateAddressDto })
  @ValidateNested()
  @Type(() => CreateAddressDto)
  shippingAddress!: CreateAddressDto;
}

export class MockPayDto {
  @ApiProperty({ enum: ['succeeded', 'failed'] })
  @IsIn(['succeeded', 'failed'])
  outcome!: 'succeeded' | 'failed';
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: ['SHIPPED', 'DELIVERED'] })
  @IsIn(['SHIPPED', 'DELIVERED'])
  status!: 'SHIPPED' | 'DELIVERED';
}
