import { Logger } from '@nestjs/common';

beforeAll(() => {
  // Override the log levels to display all logs during tests
  console.log('Overwrite logger.');
  Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']);
});
