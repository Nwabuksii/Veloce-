export const VERIFICATION_WINDOW_MINUTES = 10;

export function formatVerificationWindowText(minutesLeft: number): string {
  return `This link expires in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`;
}
