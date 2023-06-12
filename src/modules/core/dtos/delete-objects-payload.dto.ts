import { ArrayMinSize, IsArray, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DeleteObjectsPayload {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMinSize(1)
  @IsOptional()
  objects?: string[];

  @IsString()
  @IsOptional()
  bucket?: string;

  @IsInt()
  @IsOptional()
  taskIds?: number[];
}
