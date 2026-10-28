import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { SERVER_CONFIG } from '../../config/config.module';
import { type ServerConfig } from '../../config/config.schema';
import { PrismaService } from '../foundation/prisma.service';
import { PreviewController } from './preview.controller';
import { PreviewService, previewEnabled, PREVIEW_TARGET_VERIFIED } from './preview.service';

@Module({
  imports: [IdentityModule],
  controllers: [PreviewController],
  providers: [
    PreviewService,
    {
      provide: PREVIEW_TARGET_VERIFIED,
      inject: [SERVER_CONFIG, PrismaService],
      useFactory: async (config: Readonly<ServerConfig>, prisma: PrismaService) => {
        if (!previewEnabled(config)) return false;
        const rows = await prisma.$queryRaw<{ database: string; port: number; host: string }[]>`
      SELECT current_database() AS database, inet_server_port() AS port, host(inet_server_addr()) AS host`;
        return (
          rows.length === 1 &&
          rows[0].database === 'clp_lc03b_test' &&
          rows[0].port === 55438 &&
          rows[0].host === '127.0.0.1'
        );
      },
    },
  ],
})
export class PreviewModule {}
