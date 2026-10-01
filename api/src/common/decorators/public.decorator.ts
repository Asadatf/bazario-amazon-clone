import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Opt a route out of the global JWT guard. Secure-by-default: forgetting this makes a route private, not public. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
