import { Module } from '@nestjs/common';
import { PrismaModule } from '../foundation/prisma.module';
import { IdentityModule } from '../identity/identity.module';
import { StudentModule } from '../student/student.module';
import { ClassroomRepository } from './classroom.repository';
import { ClassroomService } from './classroom-service';
import { StudentClassroomController, TeacherClassroomController } from './classroom.controller';

@Module({
  imports: [PrismaModule, IdentityModule, StudentModule],
  controllers: [StudentClassroomController, TeacherClassroomController],
  providers: [ClassroomRepository, ClassroomService],
})
export class ClassroomsModule {}
