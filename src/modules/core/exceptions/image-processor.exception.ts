export type ImageProcessorExceptionSetup = {
  folderToDelete: string;
  taskId: number;
}

export class ImageProcessorException extends Error {
  public folderToDelete: string;
  public taskId: number;

  constructor(message: string, setup: ImageProcessorExceptionSetup) {
    super(message);

    this.folderToDelete = setup.folderToDelete;
    this.taskId = setup.taskId;
  }
}