export const receivedMessages = {
  createUploadUrl: 'create_upload_url',
  removeTemproraryTag: 'remove_temporary_tag',
  deleteObjects: 'delete_objects',
} as const;

export const sentMessages = {
  uploadedFile: 'uploaded_file',
  uploadedImage: 'uploaded_image',
  uploadedVideo: 'uploaded_video',
  uploadError: 'upload_error',
} as const;