import { ApiProperty } from '@nestjs/swagger';

// Registration responds with a neutral message regardless of whether the email
// was new or already taken, so it cannot be used to enumerate accounts (W2.1).
// The user activates the account by clicking the verification link that is
// emailed to them — that is where the session (auto-login) is issued.
export class RegisterResponseDto {
  @ApiProperty({
    example: 'If that email can be used, check your inbox to finish creating your account.',
  })
  message!: string;
}
