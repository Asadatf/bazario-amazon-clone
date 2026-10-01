import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { CursorQueryDto } from '../../common/pagination/cursor';

export const SORTS = ['relevance', 'price_asc', 'price_desc', 'rating', 'newest'] as const;
export type Sort = (typeof SORTS)[number];

const trimmed = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);

export class SearchQueryDto extends CursorQueryDto {
  @ApiPropertyOptional({ description: 'Free text, supports "quoted phrases", OR and -exclusions' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: 'Category slug; includes sub-categories' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ description: 'Minimum price in cents' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price in cents' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ enum: SORTS, description: 'Defaults to relevance with q, rating without' })
  @IsOptional()
  @IsIn(SORTS)
  sort?: Sort;
}
