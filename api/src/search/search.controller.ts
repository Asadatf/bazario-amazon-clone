import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SearchQueryDto } from './dto/search-query.dto';
import { SuggestQueryDto } from './dto/suggest-query.dto';
import { SearchService } from './search.service';

@ApiTags('catalog')
@Public()
@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('products')
  list(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }

  /** Separate path rather than /products/suggest, which would collide with /products/:id. */
  @Get('search/suggestions')
  @ApiOperation({ summary: 'Search-as-you-type: top matching products, typo tolerant' })
  // Fired on every keystroke; a short shared cache absorbs repeats of popular prefixes.
  @Header('Cache-Control', 'public, max-age=60')
  suggestions(@Query() query: SuggestQueryDto) {
    return this.searchService.suggest(query.q);
  }
}
