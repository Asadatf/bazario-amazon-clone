import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthUser } from '../auth-user';

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<Request>().user;
  // Only reachable if a route is marked @Public but still asks for the user: a programming error, reported as 401.
  if (!user) throw new UnauthorizedException();
  return user;
});
