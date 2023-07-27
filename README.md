## Сообщения для интеграции

### Входящие сообщения между микросервисами

```ts
export const receivedMessages = {
  createUploadUrl: 'create_upload_url', // Создать ссылку на загрузку файла
  removeTemproraryTag: 'remove_temporary_tag', // Удалить временный тэг
  deleteObjects: 'delete_objects', // Удалить объекты из хранилища
} as const;
```

#### Создать ссылку на загрузку файла

```
{
  action: FileActionsEnum;
  bucket?: string;
  uid: string;
}
```

#### Удалить временный тэг

```
{
  objects?: string[];
  bucket?: string;
  taskId?: number;
}
```

#### Удалить объекты из хранилища

```
{
  objects?: string[];
  bucket?: string;
  taskUids?: string[];
}
```

#### Подтвердить сохранение метаданных файла. Завершить выполнение задачи (ack).

```
{
  uid: string;
}
```

### Исходящие сообщения между микросервисами

```ts
export const sentMessages = {
  uploadedFile: 'uploaded_file', // Файл загружен
  uploadedImage: 'uploaded_image', // Изображение загружено
  uploadedVideo: 'uploaded_video', // Видео загружено
  taskError: 'task_error', // Ошибка загрузки/конвертации
  taskCompleted: 'task_completed', // Загрузка/конвертация полностью выполнена
  taskStarted: 'task_start', // Началась загрузка/конвертация
} as const;
```

### Вспомогательные типы

```ts
export enum FileActionsEnum {
  UploadImage = 'UploadImage',
  UploadVideo = 'UploadVideo',
  UploadFile = 'UploadFile',
}

export enum TaskStatusEnum {
  Done = 'Done',
  InProgress = 'InProgress',
  Error = 'Error',
}

export enum FileTypeEnum {
  MainFile = 'MainFile',
  Thumbnail = 'Thumbnail',
  AltVideo = 'AltVideo',
  Preview = 'Preview',
  Part = 'Part', // На данный момент о загрузке части не уведомляется. Например .ts файлы при hls конвертации. В этом случае достаточно лишь манифеста .m3u8
}
```

#### Файл загружен

Сообщение `uploaded_file`.

```ts
export type MsgFileUpload = {
  action: FileActionsEnum;
  status: TaskStatusEnum;
  objectname: string; // название объекта в хранилище
  originalname: string; // название файла, который пришел от клиента
  size: string; // размер в байтах (нужно конвертить в BigInt)
  type: FileTypeEnum;
  metadata?: Record<string, unknown>;
  height?: number;
  width?: number;
  bucket: string;
  task_id: number;
  uid: string; // Уникальный идентификатор предоставленный управляющим сервисом, используется для различия обрабатываемых файлов. На основании его можно создавать Attachment.
  created_at: Date;
  thumbnail_alias?: string;
};
```

#### Изображение загружено

Сообщение `uploaded_image`.

Отправляется `MsgFileUpload`.

#### Видео загружено

Сообщение `uploaded_video`.

Отправляется `MsgFileUpload`.

#### Ошибка загрузки/конвертации

Сообщение `task_error`.

```ts
export type MsgTaskError = {
  task_id: number;
  action: FileActionsEnum;
  created_at: Date;
  actor: string | number;
  message?: string;
  metadata?: Record<string, unknown>;
  uid: string;
  status: TaskStatusEnum;
};
```

#### Началась загрузка/конвертация

Сообщение `task_start`.

```ts
export type MsgTaskStart = {
  task_id: number;
  uid: string;
  status: TaskStatusEnum;
  action: FileActionsEnum;
};
```

#### Загрузка/конвертация полностью выполнена

Сообщение `task_completed`.

```ts
export type MsgTaskCompleted = {
  task_id: number;
  uid: string;
  status: TaskStatusEnum;
  action: FileActionsEnum;
  /**
   * Size of attachments includes previews, alt videos, thumbnails, etc.
   */
  total_size: string;
};
```

## Входящие сообщения от клиента

Тут перечислен перечень эндпоинтов доступных клиенту. Но лучше запустить swagger. Для этого env переменная `IS_SWAGGER_ENABLED` должна иметь значение `y`. Swagger будет доступен по адресу `${APPLICATION_HOST}:${APPLICATION_PORT}/openapi`.

### Загрузить файл

Эндпоинт `POST /storage/uploadFile/:key`.

### Загрузить изображение

Эндпоинт `POST /storage/uploadImage/:key`.

### Загрузить видео

Эндпоинт `POST /storage/uploadVideo/:key`.

### Получить задачу конвертации

Эндпоинт `POST /storage/getUploadTask`.

С помощью этого эндпоинта можно узнать статус выполнения задачи.

## Тестирование

### Exchange

Для всех задач микросервиса используется один exchange (env переменная `RABBITMQ_MSFILES_EXCHANGE`).  Подразумевается, что consumer будет использовать другой exchange (env переменная `RABBITMQ_CONSUMER_EXCHANGE`). В этот exchange пакетный обработчик отправляет результат своей работы - данные загруженных файлов.

#### Создать ссылку на загрузку файла

Routing key
```
create_upload_url
```

Payload
```json
{
  "action": "UploadFile",
  "bucket": "msfiles",
  "uid": "7fc7c52b-3671-4385-9394-c7890a660b25"
}
```

#### Удаление временного тэга

Routing key
```
remove_temporary_tag
```

Payload (by objectnames)
```json
{
  "objects": [
    "masks_eXz6m7.key",
    "masks_F-unqr.key"
  ]
}
```

Payload (by task id)
```json
{ "taskId": 123 }
```


#### Удалить объекты из хранилища

Routing key
```
delete_objects
```

Payload (by objectnames)
```json
{ "objects": ["masks_eXz6m7.key"] }
```

Payload (by task id)
```json
{ "taskUids": ["7fc7c52b-3671-4385-9394-c7890a660b25"] }
```

#### Подтверждение загрузки файла

Отправляется в msfiles exhange. Используется на стороне consumer сервиса как подтверждение что метаданные файла сохранены. Благодаря этому достигается синхронный ответ клиенту.

Routing key
```
consumer_saved_result
```

Payload
```json
{ "uid": "7fc7c52b-3671-4385-9394-c7890a660b25" }
```

## Задачи

- [x] Делать thumbnail только если это обоснованно. Размер должен быть меньше оригинала.
- [ ] Добавить тест кейс на проверку ответа в случае не получения ответа consumer при синхронной загрузке с клиента.

[[msfiles]]
