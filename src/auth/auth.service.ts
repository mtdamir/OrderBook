import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from 'src/redis/redis.service';
import { UserRepository } from 'src/user/repositories/user.repository';
import { UserService } from 'src/user/user.service';
import { RegisterDto } from './dto/register.dto';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { WalletService } from 'src/wallet/wallet.service';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
    private redisService: RedisService,
    private configService: ConfigService,
    private walletService: WalletService,
  ) {}

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

    await this.redisService.set(
      `refresh_token: ${userId}`,
      refresh_token,
      7 * 24 * 60 * 60,
    );

    return { access_token, refresh_token };
  }

  async register(data: RegisterDto) {
    const existUser = await this.userService.findByEmail(data.email);
    if (existUser) {
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
    const finduser = await this.userService.findByEmail(data.email);
    if (!finduser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const checkPassword = await bcrypt.compare(
      data.password,
      finduser.passwordHash,
    );

    if (!checkPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.generateTokens(finduser.id);
  }


  async logout(userId:string){
    return await this.redisService.del(`refresh_token:${userId}`)
  }
}
