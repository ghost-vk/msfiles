import { IsUUID } from 'class-validator';

export class UploadResPayload {
  @IsUUID()
  uid: string;
}
