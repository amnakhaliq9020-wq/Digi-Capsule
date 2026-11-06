import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { cookieOptions, SESSION_COOKIE } from './auth.constants';
import { LoginDto, RegisterDto } from './dto';

const publicUser = {
  id: true,
  email: true,
  name: true,
} as const;

@Injectable()
export class AuthService {
  private readonly dummyHash = bcrypt.hashSync('not-a-real-password', 10);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto, response: Response) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
      },
      select: publicUser,
    });

    this.setSession(response, user.id, user.email);
    return { user };
  }

  async login(dto: LoginDto, response: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const hash = user?.passwordHash ?? this.dummyHash;
    const matches = await bcrypt.compare(dto.password, hash);

    if (!user || !matches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    this.setSession(response, user.id, user.email);
    return { user: { id: user.id, email: user.email, name: user.name } };
  }

  logout(response: Response) {
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: cookieOptions.httpOnly,
      sameSite: cookieOptions.sameSite,
      secure: cookieOptions.secure,
      path: cookieOptions.path,
    });
    return { ok: true };
  }

  private setSession(response: Response, userId: string, email: string) {
    const token = this.jwt.sign({ sub: userId, email });
    response.cookie(SESSION_COOKIE, token, cookieOptions);
  }
}
