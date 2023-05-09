export const receivedMessages = {
  createUploadUrl: 'create_upload_url',
  removeTemproraryTag: 'remove_temporary_tag',
  deleteObjects: 'delete_objects',
} as const;

export const sentMessages = {
  uploadedFile: 'msfiles.uploaded_file',
  uploadedImage: 'msfiles.uploaded_image',
  uploadedVideo: 'msfiles.uploaded_video',
  uploadError: 'msfiles.upload_error',
  taskCompleted: 'msfiles.task_completed',
} as const;
