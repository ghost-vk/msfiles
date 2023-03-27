import { Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

@Catch(HttpException)
export class RpcValidationFilter implements ExceptionFilter {
  private readonly logger = new Logger(RpcValidationFilter.name);

  catch(exception: HttpException) {
    this.logger.error(`Rpc Error: ${exception.message}. ${JSON.stringify(exception.getResponse(), null, 2)}`, exception.stack);

    return new RpcException(exception.getResponse());
  }
}
