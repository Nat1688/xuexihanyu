import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { CourseAccessService } from './course-access.service';
@Module({
  imports: [IdentityModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService, CourseAccessService],
  exports: [CourseAccessService],
})
export class AdmissionsModule {}
