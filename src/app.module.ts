import { Module } from '@nestjs/common';
import { DownloadModule } from './download/download.module';
import { HealthController } from './health.controller';

@Module({
  imports: [DownloadModule],
  controllers: [HealthController],
})
export class AppModule {}
