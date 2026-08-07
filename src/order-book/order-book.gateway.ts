
import { Logger } from '@nestjs/common';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class OrderBookGateway {
  private readonly logger = new Logger(OrderBookGateway.name);

  @WebSocketServer()
  server: Server;

  @SubscribeMessage('join-room')
  handleJoinRoom(client: Socket, @MessageBody() room: string) {
    client.join(room);
    this.logger.log(`Client ${client.id} joined room: ${room}`);
  }

  broadcastOrderBook(data: any, room: string) {
    this.server.to(room).emit('order-book-update', data);
  }
}