import { IsEmail, IsString,IsStrongPassword } from 'class-validator';

export class RegisterDto {
    @IsEmail()
    email: string;

    @IsString()
    @IsStrongPassword({minLength: 8})
    password: string;

    @IsString()
    firstName: string;

    @IsString()
    lastName: string;
}