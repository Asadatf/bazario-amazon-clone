import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

@ApiTags('catalog')
@Controller('products')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get()
  list(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}
