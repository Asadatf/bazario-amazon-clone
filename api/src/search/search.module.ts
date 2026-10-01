import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

@Module({
  imports: [CatalogModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
