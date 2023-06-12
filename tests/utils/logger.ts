import { LoggerService } from '@nestjs/common';

export class ConsoleLogger implements LoggerService {
  log(message: string, context?: string): void {
    console.log(this.formatMessage(message, context));
  }

  error(message: string, trace?: string, context?: string): void {
    console.error(this.formatMessage(message, context));
    if (trace) {
      console.error(trace);
    }
  }

  warn(message: string, context?: string): void {
    console.warn(this.formatMessage(message, context));
  }

  debug(message: string, context?: string): void {
    console.debug(this.formatMessage(message, context));
  }

  verbose(message: string, context?: string): void {
    console.log(this.formatMessage(message, context));
  }

  private formatMessage(message: string, context?: string): string {
    if (context) {
      return `[${context}] ${message}`;
    }

    return message;
  }
}
