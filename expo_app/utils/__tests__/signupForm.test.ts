// imported explicitly: @types/jest is not a dependency of this project
import { describe, expect, it } from '@jest/globals';
import {
  EMPTY_SIGNUP_FORM,
  MIN_PASSWORD_LENGTH,
  type SignupForm,
  requiredFilled,
  signupProblem,
  toSignupPayload,
} from '@/utils/signupForm';

const PASSWORD = 'secret12';
const LANGUAGE = 'ar';

const VALID: SignupForm = {
  companyName: '  Karma Group  ',
  firstName: ' Abu ',
  lastName: ' Mohammad ',
  username: ' abumohammad ',
  email: '',
  password: PASSWORD,
  confirmPassword: PASSWORD,
  phone: '',
};

describe('signupProblem', () => {
  it('accepts a complete form', () => {
    expect(signupProblem(VALID)).toBeNull();
  });

  it.each(['companyName', 'firstName', 'lastName', 'username', 'password', 'confirmPassword'] as const)(
    'asks for the required field %s',
    (field) => {
      expect(signupProblem({ ...VALID, [field]: field.includes('assword') ? '' : '   ' })).toBe(
        'signup.fillRequired',
      );
    },
  );

  it('does not require email or phone', () => {
    expect(requiredFilled({ ...VALID, email: '', phone: '' })).toBe(true);
  });

  it('refuses a username that looks like an email', () => {
    expect(signupProblem({ ...VALID, username: 'abu@karma.com' })).toBe('signup.usernameNoAt');
  });

  it('refuses a password shorter than the backend minimum', () => {
    const short = 'x'.repeat(MIN_PASSWORD_LENGTH - 1);
    expect(signupProblem({ ...VALID, password: short, confirmPassword: short })).toBe(
      'signup.passwordTooShort',
    );
  });

  it('refuses passwords that do not match', () => {
    expect(signupProblem({ ...VALID, confirmPassword: `${PASSWORD}x` })).toBe('signup.passwordMismatch');
  });

  it('reports a blank form as missing fields', () => {
    expect(signupProblem(EMPTY_SIGNUP_FORM)).toBe('signup.fillRequired');
  });
});

describe('toSignupPayload', () => {
  it('trims the text fields and keeps the password as typed', () => {
    expect(toSignupPayload({ ...VALID, password: ' pass word ', confirmPassword: ' pass word ' }, LANGUAGE)).toEqual({
      company_name: 'Karma Group',
      username: 'abumohammad',
      first_name: 'Abu',
      last_name: 'Mohammad',
      password: ' pass word ',
      language: LANGUAGE,
    });
  });

  it('omits blank optional fields', () => {
    const payload = toSignupPayload({ ...VALID, email: '   ', phone: '' }, LANGUAGE);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('phone_number');
  });

  it('sends the optional fields when given', () => {
    const payload = toSignupPayload({ ...VALID, email: ' abu@karma.com ', phone: ' 0999 ' }, LANGUAGE);
    expect(payload.email).toBe('abu@karma.com');
    expect(payload.phone_number).toBe('0999');
  });
});
