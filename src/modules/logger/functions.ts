import pino, { MultiStreamRes } from 'pino';
import pretty from 'pino-pretty';
import tee from 'pino-tee';

const isErrorLog = (line: { level: number }): boolean => line.level >= 50;

const isNonErrorLog = (line: { level: number }): boolean => line.level < 50;

function createPinoFilteredStream(
  filter: (line: { level: number }) => boolean,
  target: NodeJS.WritableStream,
): NodeJS.WritableStream {
  const stream = tee(process.stdin);

  stream.tee(target, filter);

  return stream;
}

function createPinoMainStream(extendedLogs: boolean): pretty.PrettyStream | NodeJS.WritableStream {
  return extendedLogs
    ? pretty({ colorize: true })
    : createPinoFilteredStream(isNonErrorLog, process.stdout);
}

export function preparePinoMultistream(extendedLogs: boolean): MultiStreamRes {
  const streams = [
    createPinoFilteredStream(isErrorLog, process.stderr),
    createPinoMainStream(extendedLogs),
  ].filter((v) => v);

  return pino.multistream(streams);
}
