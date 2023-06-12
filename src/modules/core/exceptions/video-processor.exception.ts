export type VideoProcessorExceptionSetup = {
  folderToDelete: string;
  taskId: number;
}

export class VideoProcessorException extends Error {
  public folderToDelete: string;
  public taskId: number;

  constructor(message: string, setup: VideoProcessorExceptionSetup) {
    super(message);

    this.folderToDelete = setup.folderToDelete;
    this.taskId = setup.taskId;
  }
}