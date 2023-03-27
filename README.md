## Microservice workflow

- Connects to MinIO for storage.
- Uses `@nestjs/microservices` RabbitMQ and HTTP for internal communication between microservices.
- Employs JWT authentication for security.
- Retrieves user files (videos, images, and other files) and stores them in a temporary directory then request is end.
- Converts, resizes, compresses files in temporary directory and saves the files to MinIO.
- Notifies another system through queue about success or failure of file uploads.

## API

### Internal – between microservices

#### Messages

| Message Pattern      | Description                                         | Payload                                                 | Example response                                            |
|----------------------|-----------------------------------------------------|---------------------------------------------------------|-------------------------------------------------------------|
| create_upload_url    | Creates URL for upload file with default parameters | [CreateUploadUrlPayload](#createuploadurlpayload)       | { 'url': 'http://localhost:8080/storage/video/VGiVNhenzL' } |
| delete_objects       | Deletes list of objects from MinIO                  | [DeleteObjectsPayload](#deleteobjectspayload)           | { 'status': 'ok' }                                          |
| remove_temporary_tag | Removes tag 'temporary' from MinIO                  | [RemoveTemporaryTagPayload](#removetemporarytagpayload) | { 'status': 'ok' }                                          |


#### Payloads

##### CreateUploadUrlPayload

```typescript
export class CreateUploadUrlPayload {
  // Actions: "upload_image", "upload_video", "upload_file"
  @IsNotEmpty()
  @IsString()
  @IsIn(Object.values(actions))
  action: (typeof actions)[keyof typeof actions];

  @IsInt()
  @Transform(({ value }) => Number(value))
  user_id: number;

  @IsIn(
    process.env.MINIO_ADDITIONAL_BUCKETS ? splitByComma(process.env.MINIO_ADDITIONAL_BUCKETS) : [],
  )
  @IsOptional()
  bucket?: string;
}
```

##### DeleteObjectsPayload

```typescript
export class DeleteObjectsPayload {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMinSize(1)
  objects: string[];
}
```

##### RemoveTemporaryTagPayload

```typescript
export class RemoveTemporaryTagPayload {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @ArrayMinSize(1)
  objects: string[];
}
```

### REST endpoints

| Endpoint | Method | DTO                         |
|----------|--------|-----------------------------|
| /tasks   | POST   | [GetTasksDto](#gettasksdto) |

#### DTOs

##### GetTasksDto

```typescript
export class GetTasksDto {
  // Actions: "upload_image", "upload_video", "upload_file"
  @IsArray()
  @IsIn([actions.uploadFile, actions.uploadImage, actions.uploadVideo], { each: true })
  @IsOptional()
  actions?: Array<(typeof actions)[keyof typeof actions]>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  actors?: Array<string | number>;

  @IsOptional()
  originalnames?: string[];

  // Task statuses: "done", "in_progress", "error"
  @IsArray()
  @IsIn([taskStatus.done, taskStatus.error, taskStatus.inProgress], { each: true })
  @IsOptional()
  statuses?: Array<(typeof taskStatus)[keyof typeof taskStatus]>;

  @IsInt()
  @IsOptional()
  ids?: number[]
}
```

### External – with end user

You can see external communication by start application with enabled swagger documentation. To do that, you need to
set `IS_SWAGGER_ENABLED=y` in your `.env` file. Swagger will be available at `http://localhost:8080/openapi` by default.

## Setup testing

### Create JWT at https://jwt.io.

#### Example input

Payload:

```json
{"user_id": "70"}
```

Default secret: `jwt-secret`.

![Example JWT input](./docs/public/jwt-input.png).

### Create upload URL

> Be sure that environment containers are up and `.env` file are created referenced to `.env.example`.

If you use RabbitMQ and default settings go to http://localhost:15672, and login to RabbitMQ console with your credentials (you can find it at `.env`).

Post message to queue `msfiles` (also from `.env`).

```json
{
  "pattern": "create_upload_url",
  "data": {
    "action": "upload_file",
    "user_id": 666
  }
}
```

![Create upload url RabbitMQ message](./docs/public/create-upload-url-rmq.png).

After that in logs you can see something like:

```
[Nest] 11378  - 03/19/2023, 1:05:45 PM     LOG [InternalController] File upload URL generated [http://localhost:8080/storage/files/qSQgKI].
```

Now you can make request with created URL and token. Let do it with Postman. Specify authorization header with bearer token created above. Select body type form-data, create parameter `files` type file and pick few files to upload.

```
"Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNzAifQ.hej-qWRezg8L3olbhL_hQNjKRLFiKo7mfYpFm5CweP8"
```

![](./docs/public/postman-upload-files.png)

As a request result you should see at logs something like:

```
[Nest] 11378  - 03/19/2023, 1:16:00 PM     LOG [MinioService] File [header.key - header_P0-0is.key] successfully uploaded.
[Nest] 11378  - 03/19/2023, 1:16:00 PM     LOG [MinioService] File [masks.key - masks_oTD6XC.key] successfully uploaded.
[Nest] 11378  - 03/19/2023, 1:16:00 PM     LOG [MinioService] File [masks2.key - masks2_w_NqSI.key] successfully uploaded.
[Nest] 11378  - 03/19/2023, 1:16:00 PM     LOG [ExternalController] Successfully upload files: header_P0-0is.key, masks_oTD6XC.key, masks2_w_NqSI.key.
```

And you can see some errors if you are not setup your consumer - it's fine.

```
[Nest] 11378  - 03/19/2023, 1:16:00 PM   ERROR [Server] There is no matching event handler defined in the remote service. Event pattern: uploaded_file
[Nest] 11378  - 03/19/2023, 1:16:00 PM   ERROR [Server] There is no matching event handler defined in the remote service. Event pattern: uploaded_file
[Nest] 11378  - 03/19/2023, 1:16:00 PM   ERROR [Server] There is no matching event handler defined in the remote service. Event pattern: uploaded_file
```

Now, look at your minio storage – files should be there.

![](./docs/public/minio-objects-after-upload.png)