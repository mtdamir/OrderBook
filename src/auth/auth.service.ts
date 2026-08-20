import {ConflictException,Injectable,UnauthorizedException} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { RedisService } from 'src/redis/redis.service';
import { UserService } from 'src/user/user.service';
import { WalletService } from 'src/wallet/wallet.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly walletService: WalletService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async generateTokens(userId: string) {
    const [access_token, refresh_token] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
          expiresIn: '15m',
        },
      ),

      this.jwtService.signAsync(
        { sub: userId },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
        },
      ),
    ]);

    const refreshTokenHash = this.hashToken(refresh_token);

    await this.redisService.set(
      `refresh_token:${userId}`,
      refreshTokenHash,
      7 * 24 * 60 * 60,
    );

    return {
      access_token,
      refresh_token,
    };
  }

  async register(data: RegisterDto) {
    const existingUser = await this.userService.findByEmail(data.email);

    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await this.userService.create({
      email: data.email,
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
    });

    await this.walletService.createWalletForUser(user.id);

    return this.generateTokens(user.id);
  }

  async login(data: LoginDto) {
    const user = await this.userService.findByEmail(data.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordIsValid = await bcrypt.compare(
      data.password,
      user.passwordHash,
    );

    if (!passwordIsValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(user.id);
  }

  async refresh(userId: string, refreshToken: string) {
    const storedRefreshTokenHash = await this.redisService.get(
      `refresh_token:${userId}`,
    );

    if (!storedRefreshTokenHash) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    const receivedRefreshTokenHash = this.hashToken(refreshToken);

    if (storedRefreshTokenHash !== receivedRefreshTokenHash) {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }

    return this.generateTokens(userId);
  }

  async logout(userId: string) {
    await this.redisService.del(`refresh_token:${userId}`);

    return {
      message: 'Logged out successfully',
    };
  }
}
