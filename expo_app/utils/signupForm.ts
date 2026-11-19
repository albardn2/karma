/**
 * The company sign-up form: what it needs before it may be sent, and the body
 * POST /auth/signup takes. The rules match the backend's SignupRequest, so a
 * form that passes here is only refused for reasons the server alone can know
 * (a username or email already taken).
 */

export const MIN_PASSWORD_LENGTH = 6;

export interface SignupForm {
  companyName: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
}

export interface SignupPayload {
  company_name: string;
  username: string;
  first_name: string;
  last_name: string;
  password: string;
  email?: string;
  phone_number?: string;
  language: string;
}

export const EMPTY_SIGNUP_FORM: SignupForm = {
  companyName: '',
  firstName: '',
  lastName: '',
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
};

export type SignupProblem =
  | 'signup.fillRequired'
  | 'signup.usernameNoAt'
  | 'signup.passwordTooShort'
  | 'signup.passwordMismatch';

export function requiredFilled(form: SignupForm): boolean {
  return (
    !!form.companyName.trim() &&
    !!form.firstName.trim() &&
    !!form.lastName.trim() &&
    !!form.username.trim() &&
    !!form.password &&
    !!form.confirmPassword
  );
}

/** The first problem with the form, as a translation key; null when it may be sent. */
export function signupProblem(form: SignupForm): SignupProblem | null {
  if (!requiredFilled(form)) return 'signup.fillRequired';
  if (form.username.includes('@')) return 'signup.usernameNoAt';
  if (form.password.length < MIN_PASSWORD_LENGTH) return 'signup.passwordTooShort';
  if (form.password !== form.confirmPassword) return 'signup.passwordMismatch';
  return null;
}

/** Optional fields left blank are omitted: the backend validates an email it is given. */
export function toSignupPayload(form: SignupForm, language: string): SignupPayload {
  const email = form.email.trim();
  const phone = form.phone.trim();
  return {
    company_name: form.companyName.trim(),
    username: form.username.trim(),
    first_name: form.firstName.trim(),
    last_name: form.lastName.trim(),
    password: form.password,
    ...(email ? { email } : {}),
    ...(phone ? { phone_number: phone } : {}),
    language,
  };
}
