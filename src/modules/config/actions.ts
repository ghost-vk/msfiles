export const actions = {
  uploadImage: 'upload_image',
  uploadVideo: 'upload_video',
  uploadFile: 'upload_file',
} as const;

export const taskStatus = {
  done: 'done',
  inProgress: 'in_progress',
  error: 'error',
} as const;