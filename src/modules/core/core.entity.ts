import { ApiHideProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class Task {
  id: number;
  actor: string;
  status: string;
  action: string;
  originalname: string;
  objectname?: string | null;
  @Exclude()
  @ApiHideProperty()
  linked_objects?: string | null;
  bucket: string;
  parameters: string | null;
  @Exclude()
  @ApiHideProperty()
  error_message: string | null;
  created_at: Date;
  updated_at: Date;

  constructor(partial: Partial<Task>) {
    Object.assign(this, partial);
  }
}
