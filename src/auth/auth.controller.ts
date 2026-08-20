import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

type RefreshUser = {
  id: string;
  refreshToken: string;
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({
    status: 200,
    description: 'User logged in successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshAuthGuard)
  @ApiBearerAuth('refresh-token')
  @ApiOperation({ summary: 'Generate new access and refresh tokens' })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token is invalid or expired',
  })
  refresh(@CurrentUser() user: RefreshUser) {
    return this.authService.refresh(user.id, user.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'User logged out successfully',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  logout(@CurrentUser() user: { id: string }) {
    return this.authService.logout(user.id);
  }
}
