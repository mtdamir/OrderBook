import { Injectable,NotFoundException } from "@nestjs/common";
import { UserRepository } from "./repositories/user.repository";

@Injectable()
export class UserService {
    constructor(private readonly userRepository: UserRepository) {}

    async findOrThrow(id: string) {
        const user = await this.userRepository.findById(id);
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async getUserById(userId: string) {
        return this.userRepository.findById(userId);
    }
}