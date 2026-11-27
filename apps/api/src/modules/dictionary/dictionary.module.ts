import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { DictionaryController } from './controller';
import { DictionaryRepository } from './repository';
import { DictionaryRateLimiter, DictionaryService } from './service';

@Module({
  imports: [IdentityModule],
  controllers: [DictionaryController],
  providers: [DictionaryRepository, DictionaryService, DictionaryRateLimiter],
})
export class DictionaryModule {}
