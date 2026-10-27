import { IsString } from 'class-validator';

export class SendMessageDto {
  @IsString()
  to: string;

  // Ciphertext produced client-side; the server never sees plaintext or the shared code.
  @IsString()
  ciphertext: string;
}
