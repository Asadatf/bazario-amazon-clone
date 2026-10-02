import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CartService } from './cart.service';
import { AddCartItemDto, GuestCartDto, UpdateCartItemDto } from './dto/cart.dto';

@ApiTags('cart')
@ApiBearerAuth()
@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.cart.getCart(user.id);
  }

  @Public()
  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Price a signed-out shopper`s cart (ids + quantities only; prices come from the DB)' })
  quote(@Body() dto: GuestCartDto) {
    return this.cart.quote(dto.items);
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Merge a guest cart into the signed-in user`s cart (quantities clamped to stock)' })
  merge(@CurrentUser() user: AuthUser, @Body() dto: GuestCartDto) {
    return this.cart.merge(user.id, dto.items);
  }

  @Post('items')
  add(@CurrentUser() user: AuthUser, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(user.id, dto.productId, dto.quantity);
  }

  @Patch('items/:productId')
  update(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string, @Body() dto: UpdateCartItemDto) {
    return this.cart.updateItem(user.id, productId, dto.quantity);
  }

  @Delete('items/:productId')
  remove(@CurrentUser() user: AuthUser, @Param('productId', ParseUUIDPipe) productId: string) {
    return this.cart.removeItem(user.id, productId);
  }
}
