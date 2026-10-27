import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ProfileController } from './profile.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    JwtModule.register({
      // Falls back to a dev-only secret so the app still boots locally
      // without extra setup; set JWT_SECRET in production (Render env var).
      secret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
      signOptions: { expiresIn: '30d' },
    }),
  ],
  controllers: [AuthController, ProfileController],
  providers: [AuthService, UsersService, JwtAuthGuard],
  exports: [AuthService, UsersService, JwtAuthGuard],
})
export class AuthModule {}
