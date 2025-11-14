// Test utilities for mocking external services

/**
 * Mock Supabase User (authenticated)
 */
export const mockAuthenticatedUser = {
  id: 'test-user-id-123',
  email: 'test@example.com',
  created_at: '2024-01-01T00:00:00.000Z',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  role: 'authenticated',
};

/**
 * Mock Supabase Auth Success Response
 */
export const mockSupabaseAuthSuccess = {
  data: {
    user: mockAuthenticatedUser,
  },
  error: null,
};

/**
 * Mock Supabase Auth Failure Response (no user)
 */
export const mockSupabaseAuthFailure = {
  data: {
    user: null,
  },
  error: null,
};

/**
 * Mock Stripe Checkout Session
 */
export const mockStripeSession = {
  id: 'cs_test_123456789',
  object: 'checkout.session',
  url: 'https://checkout.stripe.com/c/pay/test-session-url',
  customer_email: 'test@example.com',
  payment_status: 'unpaid',
  status: 'open',
  mode: 'subscription',
  metadata: {
    user_id: 'test-user-id-123',
  },
  line_items: {
    data: [
      {
        price: {
          id: 'price_123',
        },
        quantity: 1,
      },
    ],
  },
};

/**
 * Mock Stripe Error
 */
export class MockStripeError extends Error {
  type: string;
  statusCode: number;

  constructor(message: string, type = 'StripeInvalidRequestError', statusCode = 400) {
    super(message);
    this.name = 'StripeError';
    this.type = type;
    this.statusCode = statusCode;
  }
}
