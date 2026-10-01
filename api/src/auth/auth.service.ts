import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicUser, UsersService } from '../users/users.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { AccessTokenPayload } from './jwt.strategy';

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
  /** Raw refresh token: goes into the httpOnly cookie, never into a response body. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

// A real argon2 hash of a random string, verified against when the email doesn't exist so that
// "unknown email" and "wrong password" take the same time (no user enumeration via timing).
const DUMMY_HASH_PROMISE = argon2.hash(randomBytes(16).toString('hex'));

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.users.findCredentialsByEmail(dto.email);
    if (existing) throw new ConflictException('An account with this email already exists');
    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    // New accounts are always customers: roles are never taken from client input.
    const user = await this.users.create({ email: dto.email, name: dto.name, passwordHash });
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.users.findCredentialsByEmail(dto.email);
    const valid = await argon2.verify(user?.passwordHash ?? (await DUMMY_HASH_PROMISE), dto.password);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');
    const { passwordHash: _omit, ...publicUser } = user;
    return this.issueTokens(publicUser);
  }

  /**
   * Rotation: every refresh token is single-use. Presenting one that was already rotated means it was
   * copied (stolen) or replayed, so we revoke every token the user has and force a fresh login.
   */
  async refresh(rawToken: string | undefined): Promise<AuthResult> {
    if (!rawToken) throw new UnauthorizedException('Missing refresh token');
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.revokedAt) {
      this.logger.warn(JSON.stringify({ event: 'refresh_token_reuse', userId: stored.userId }));
      await this.revokeAllForUser(stored.userId);
      throw new UnauthorizedException('Refresh token reuse detected; please sign in again');
    }
    if (stored.expiresAt <= new Date()) throw new UnauthorizedException('Refresh token expired');

    // Conditional update = compare-and-swap: if two requests race with the same token, only one wins.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('Refresh token already used');

    const user = await this.users.findById(stored.userId);
    return this.issueTokens(user);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private async issueTokens(user: PublicUser): Promise<AuthResult> {
    const payload: AccessTokenPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwt.signAsync(payload);

    const refreshToken = randomBytes(32).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 24 * 60 * 60 * 1000);
    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });
    return { user, accessToken, refreshToken, refreshExpiresAt };
  }
}

/**
 * SHA-256, not argon2: refresh tokens are 256 random bits, so they can't be brute-forced and don't need a
 * slow hash. A fast deterministic hash also lets us look the token up by an indexed column.
 */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
