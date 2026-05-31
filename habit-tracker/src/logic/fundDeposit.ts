export type ValidationResult = { valid: boolean; error?: string };

export function validateDeposit(amount: number): ValidationResult {
  if (isNaN(amount) || amount <= 0) {
    return { valid: false, error: 'Số tiền phải lớn hơn 0' };
  }
  if (amount > 200_000_000) {
    return { valid: false, error: 'Số tiền vượt quá giới hạn cho phép' };
  }
  return { valid: true };
}
