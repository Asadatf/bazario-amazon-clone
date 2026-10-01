import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CatalogService } from './catalog.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }

  @ApiBearerAuth()
  @Roles(Role.SELLER)
  @Get('seller/products')
  sellerProducts(@CurrentUser() user: AuthUser) {
    return this.catalog.listSellerProducts(user);
  }

  @Public()
  @Get('products/:id')
  product(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalog.getProduct(id);
  }

  @ApiBearerAuth()
  @Roles(Role.SELLER)
  @Post('products')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    return this.catalog.createProduct(user, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.SELLER)
  @ApiForbiddenResponse({ description: 'Not a seller, or not this product`s seller' })
  @Patch('products/:id')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(user, id, dto);
  }

  @ApiBearerAuth()
  @Roles(Role.SELLER)
  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.catalog.deleteProduct(user, id);
  }
}
