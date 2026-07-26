import { Injectable,Logger } from "@nestjs/common";
import { PrismaService } from 'src/database/prisma.service';
import { Prisma, PrismaClient } from '@prisma/client'

@Injectable()
export class WalletLogRepo {
    protected readonly logger = new Logger(WalletLogRepo.name);
    
    constructor(private readonly prisma: PrismaService) {}

    async create(data:Prisma.WalletLogCreateInput, tx?:PrismaClient){
        const client = tx ?? this.prisma;
        return client.walletLog.create({data})
    }
}