import { Controller, Get, Headers, HttpCode, HttpStatus, Post, RawBodyRequest, Req } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MOCK_SIGNATURE_HEADER } from './providers/mock-payment.provider';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Get('config')
  config() {
    return this.payments.publicConfig();
  }

  /** Authenticated by signature, not JWT: the caller is the payment provider, not a user. */
  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers(MOCK_SIGNATURE_HEADER) mockSignature: string | undefined,
  ) {
    // The signature covers the exact bytes sent; re-serialising parsed JSON could change them, so use rawBody.
    return this.payments.handleWebhook(req.rawBody ?? Buffer.alloc(0), stripeSignature ?? mockSignature);
  }
}
