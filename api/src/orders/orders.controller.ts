import { Body, Controller, Get, Headers, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import type { Response } from 'express';
import { AuthUser } from '../common/auth-user';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CursorQueryDto } from '../common/pagination/cursor';
import { CreateOrderDto, MockPayDto, UpdateOrderStatusDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

@ApiTags('orders')
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders')
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'Unique per checkout attempt; retries reuse it' })
  @ApiConflictResponse({ description: 'An item does not have enough stock' })
  async checkout(
    @CurrentUser() user: AuthUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateOrderDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.orders.checkout(user, idempotencyKey, dto.shippingAddress);
    // 201 for a new order, 200 + a marker header for a replay, so clients and logs can tell them apart.
    res.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return { order: result.order, payment: result.payment };
  }

  @Get('orders')
  list(@CurrentUser() user: AuthUser, @Query() query: CursorQueryDto) {
    return this.orders.list(user, query);
  }

  @Get('orders/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.get(user, id);
  }

  @Post('orders/:id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.cancel(user, id);
  }

  /** Stand-in for the provider's hosted payment page when PAYMENT_PROVIDER=mock (404 otherwise). */
  @Post('orders/:id/mock-pay')
  mockPay(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: MockPayDto) {
    return this.orders.simulatePayment(user, id, dto.outcome);
  }

  @Roles(Role.ADMIN)
  @Patch('admin/orders/:id/status')
  advance(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.advanceStatus(id, dto.status);
  }
}
