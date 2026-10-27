import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(username: string, password: string): Promise<{ token: string }> {
    if (await this.users.find(username)) {
      throw new ConflictException('Username already taken');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await this.users.create({ username, passwordHash });
    return { token: this.jwt.sign({ sub: username }) };
  }

  async login(username: string, password: string): Promise<{ token: string }> {
    const user = await this.users.find(username);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return { token: this.jwt.sign({ sub: user.username }) };
  }

  verify(token: string): string {
    try {
      const payload = this.jwt.verify<{ sub: string }>(token);
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
