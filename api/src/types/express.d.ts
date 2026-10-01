import type { AuthUser } from '../common/auth-user';

declare global {
  namespace Express {
    // Passport attaches the JWT payload here; we narrow it to our shape.
    interface User extends AuthUser {}
    interface Request {
      requestId?: string;
      rawBody?: Buffer;
    }
  }
}

export {};
