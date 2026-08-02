import { Injectable,Logger } from "@nestjs/common";
import { PrismaService } from 'src/database/prisma.service';
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaTransaction } from 'src/database/prisma.types';


@Injectable()
export class WalletLogRepository {
    protected readonly logger = new Logger(WalletLogRepository.name);
    
    constructor(private readonly prisma: PrismaService) {}

    async create(data:Prisma.WalletLogCreateInput, tx?:PrismaTransaction){
        const client = tx ?? this.prisma;
        return client.walletLog.create({data})
    }
}