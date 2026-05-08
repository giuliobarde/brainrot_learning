export interface FieldErrors {
  email?: string;
  password?: string;
  displayName?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLogin(input: { email: string; password: string }): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_RE.test(input.email)) errors.email = 'Enter a valid email';
  if (input.password.length < 1) errors.password = 'Password is required';
  return errors;
}

export function validateSignUp(input: {
  email: string;
  password: string;
  displayName: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!EMAIL_RE.test(input.email)) errors.email = 'Enter a valid email';
  if (input.password.length < 8) errors.password = 'At least 8 characters';
  if (input.displayName.trim().length < 1) errors.displayName = 'Display name is required';
  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((v) => Boolean(v));
}
