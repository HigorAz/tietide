import { ApiProperty } from '@nestjs/swagger';

// Forgot-password responds with the same neutral message whether or not the email
// is registered, so it cannot be used to enumerate accounts. The reset link is
// emailed only if an account exists.
export class ForgotPasswordResponseDto {
  @ApiProperty({
    example: 'If that email is registered, we’ve sent a link to reset your password.',
  })
  message!: string;
}
