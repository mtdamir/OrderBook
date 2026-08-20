import { Logger } from '@nestjs/common';

import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

import { OrderBookDepth } from './interfaces/order-book-depth.interface';

const ORDER_BOOK_ROOM_PREFIX = 'order-book:';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class OrderBookGateway {
  private readonly logger = new Logger(OrderBookGateway.name);

  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('join-room')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,

    @MessageBody()
    marketSymbol: string,
  ) {
    const normalizedMarketSymbol = this.normalizeMarketSymbol(marketSymbol);

    const room = this.getMarketRoom(normalizedMarketSymbol);

    await client.join(room);

    this.logger.log(`Client ${client.id} joined ${room}`);

    return {
      event: 'joined-room',

      data: {
        marketSymbol: normalizedMarketSymbol,
      },
    };
  }

  broadcastOrderBook(data: OrderBookDepth): void {
    const marketSymbol = this.normalizeMarketSymbol(data.marketSymbol);

    const room = this.getMarketRoom(marketSymbol);

    this.server.to(room).emit('order-book-update', data);
  }

  private getMarketRoom(marketSymbol: string): string {
    return `${ORDER_BOOK_ROOM_PREFIX}${marketSymbol}`;
  }

  private normalizeMarketSymbol(value: unknown): string {
    if (typeof value !== 'string') {
      throw new WsException('Market symbol is required');
    }

    const marketSymbol = value.trim().toUpperCase();

    if (!/^[A-Z0-9]{4,40}$/.test(marketSymbol)) {
      throw new WsException('Market symbol is invalid');
    }

    return marketSymbol;
  }
}
