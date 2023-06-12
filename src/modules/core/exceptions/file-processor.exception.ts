export type FileProcessorExceptionSetup = {
  folderToDelete: string;
  taskId: number;
}

export class FileProcessorException extends Error {
  public folderToDelete: string;
  public taskId: number;

  constructor(message: string, setup: FileProcessorExceptionSetup) {
    super(message);

    this.folderToDelete = setup.folderToDelete;
    this.taskId = setup.taskId;
  }
}
