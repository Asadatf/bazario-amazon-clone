import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MockPaymentProvider } from './providers/mock-payment.provider';
import { PAYMENT_PROVIDER, PaymentProvider } from './providers/payment-provider';
import { StripePaymentProvider } from './providers/stripe-payment.provider';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): PaymentProvider =>
        config.get('PAYMENT_PROVIDER') === 'stripe'
          ? // Presence is guaranteed by the env schema's refine() when PAYMENT_PROVIDER=stripe.
            new StripePaymentProvider(config.get('STRIPE_SECRET_KEY') as string, config.get('STRIPE_WEBHOOK_SECRET') as string)
          : new MockPaymentProvider(config.get('MOCK_WEBHOOK_SECRET')),
    },
  ],
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
