import { Injectable, HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../foundation/prisma.service';
import { ScryptPasswordHasher } from '../infrastructure/scrypt-password-hasher';
import { normalizeLogin } from '../domain/login';
import { LoginRateLimiter } from './login-rate-limiter';

@Injectable()
export class RegistrationService {
  private readonly loginPeerLimits = new LoginRateLimiter({
    windowMs: 3_600_000,
    maxAttempts: 10,
    maxKeys: 5000,
  });
  private readonly globalLimits = new LoginRateLimiter({
    windowMs: 60_000,
    maxAttempts: 30,
    maxKeys: 1,
  });
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: ScryptPasswordHasher,
  ) {}
  async register(
    body: { login?: unknown; password?: unknown; confirmPassword?: unknown },
    ip: string,
  ) {
    if (!this.globalLimits.hit('signup').allowed)
      throw new HttpException(
        {
          error: {
            code: 'REGISTRATION_RATE_LIMITED',
            message: 'Bạn đã thử đăng ký quá nhiều lần. Vui lòng thử lại sau.',
          },
        },
        429,
      );
    let login: string;
    try {
      login = normalizeLogin(body.login as string);
    } catch {
      return this.invalid();
    }
    // The peer may be nginx: never impose a ten-user cap on a shared proxy IP.
    if (!this.loginPeerLimits.hit(`${login}|${ip}`).allowed)
      throw new HttpException(
        {
          error: {
            code: 'REGISTRATION_RATE_LIMITED',
            message: 'Bạn đã thử đăng ký email này quá nhiều lần. Vui lòng thử lại sau.',
          },
        },
        429,
      );
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(login) ||
      typeof body.password !== 'string' ||
      body.password.length < 8 ||
      body.password.length > 128 ||
      body.password !== body.confirmPassword
    )
      return this.invalid();
    const hash = await this.hasher.hash(body.password);
    try {
      await this.prisma.user.create({
        data: {
          login,
          loginNormalized: login,
          state: 'ACTIVE',
          roles: { create: { role: 'STUDENT' } },
          credential: {
            create: {
              algorithm: hash.algorithm,
              parameters: { ...hash.parameters },
              hash: hash.hash,
            },
          },
        },
        select: { publicId: true },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        throw new HttpException(
          {
            error: {
              code: 'REGISTRATION_UNAVAILABLE',
              message:
                'Không thể đăng ký email này. Hãy kiểm tra lại hoặc đăng nhập nếu đã có tài khoản.',
            },
          },
          409,
        );
      throw e;
    }
    return { login, password: body.password };
  }
  private invalid(): never {
    throw new HttpException(
      {
        error: {
          code: 'REGISTRATION_INVALID',
          message: 'Nhập email hợp lệ, mật khẩu 8–128 ký tự và xác nhận khớp nhau.',
        },
      },
      422,
    );
  }
}
