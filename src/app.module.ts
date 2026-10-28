import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { DatabaseModule } from './database/database.module';
import { DownloadModule } from './download/download.module';
import { FriendsModule } from './friends/friends.module';
import { HealthController } from './health.controller';
import { PresenceModule } from './presence/presence.module';
import { PushModule } from './push/push.module';

@Module({
  imports: [DatabaseModule, PresenceModule, PushModule, DownloadModule, AuthModule, ChatModule, FriendsModule],
  controllers: [HealthController],
})
export class AppModule {}
