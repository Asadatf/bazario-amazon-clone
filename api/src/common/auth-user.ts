import { Role } from '@prisma/client';

/** What the access token carries. Kept small: anything else is looked up when needed. */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}
