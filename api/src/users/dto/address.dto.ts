import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, MaxLength } from 'class-validator';

export class CreateAddressDto {
  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({ example: '410 Terry Ave N' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  line1!: string;

  @ApiProperty({ example: 'Seattle' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ example: '98109' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;

  @ApiProperty({ example: 'US', description: 'ISO 3166-1 alpha-2' })
  @IsString()
  @Length(2, 2)
  country!: string;
}
