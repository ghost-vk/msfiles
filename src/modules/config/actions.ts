export const actions = {
  uploadImage: 'uploadImage',
  uploadVideo: 'uploadVideo',
  uploadFile: 'uploadFile',
} as const;

export const taskStatus = {
  done: 'done',
  inProgress: 'inProgress',
  error: 'error',
} as const;