import { Injectable, NotFoundException } from '@nestjs/common';
import { Address, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAddressDto } from './dto/address.dto';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

const publicUserSelect = { id: true, email: true, name: true, role: true, createdAt: true } as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Includes the password hash: only the auth module should call this. */
  findCredentialsByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  create(input: { email: string; name: string; passwordHash: string; role?: Role }): Promise<PublicUser> {
    return this.prisma.user.create({
      data: { email: normalizeEmail(input.email), name: input.name.trim(), passwordHash: input.passwordHash, role: input.role },
      select: publicUserSelect,
    });
  }

  listAddresses(userId: string): Promise<Address[]> {
    return this.prisma.address.findMany({ where: { userId }, orderBy: { id: 'asc' } });
  }

  addAddress(userId: string, dto: CreateAddressDto): Promise<Address> {
    return this.prisma.address.create({ data: { ...dto, userId } });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
