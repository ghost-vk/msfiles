import { Channel } from 'amqplib';

export type ConsumeMessagesFromExchangeOptions = {
  exchange: string;
  queue?: string;
  routingKey?: string;
  messages?: string[]; // Сюда добавляем новые сообщения
};
export async function consumeMessagesFromExchange(
  channel: Channel,
  options: ConsumeMessagesFromExchangeOptions = { exchange: 'core' },
): Promise<void> {
  await channel.consume(options.queue ?? '', (message) => {
    if (message) {
      const parsedMessage = JSON.parse(message.content.toString());

      if (options.messages) {
        options.messages.push(parsedMessage);
      }

      channel.ack(message);
    }
  });
}
