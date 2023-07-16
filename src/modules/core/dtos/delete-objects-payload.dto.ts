import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class DeleteObjectsPayload {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @IsOptional()
  objects?: string[];

  @IsString()
  @IsOptional()
  bucket?: string;

  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  taskUids?: string[];
}
