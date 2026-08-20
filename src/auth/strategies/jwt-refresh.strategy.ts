import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UserService } from 'src/user/user.service';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy,'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET')!,
      passReqToCallback: true,
    });
  }

  async validate(request: Request, payload: { sub: string }) {
    const refreshToken = ExtractJwt.fromAuthHeaderAsBearerToken()(request);

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const user = await this.userService.findOrThrow(payload.sub);

    return {
      ...user,
      refreshToken,
    };
  }
}
