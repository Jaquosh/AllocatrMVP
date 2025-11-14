/**
 * Integration Tests for Stripe Checkout
 *
 * Tests the business logic of creating Stripe checkout sessions
 * integrating with the Stripe API (mocked)
 */

import {
  mockStripeSession,
  MockStripeError,
} from '@/test-utils/mocks';

// Create mock function
let mockStripeCheckoutCreate: jest.Mock;

// Mock Stripe BEFORE importing the handler
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: (...args: any[]) => mockStripeCheckoutCreate(...args),
      },
    },
  }));
});

// Import AFTER mocking
import { createCheckoutSession } from '@/lib/checkout/stripe-handler';

describe('Stripe Checkout Integration', () => {
  beforeEach(() => {
    // Initialize mock function
    mockStripeCheckoutCreate = jest.fn();
  });

  describe('Successful Checkout Session Creation', () => {
    it('should create checkout session with user email', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockResolvedValue(mockStripeSession);

      // ACT
      const result = await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.url).toBe('https://checkout.stripe.com/c/pay/test-session-url');
      }

      // Verify Stripe was called correctly
      expect(mockStripeCheckoutCreate).toHaveBeenCalledWith({
        customer_email: 'test@example.com',
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: 'http://localhost:3000/success?session_id={CHECKOUT_SESSION_ID}',
        cancel_url: 'http://localhost:3000/pricing',
        metadata: {
          user_id: 'user-123',
        },
      });
    });

    it('should include user_id in metadata', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockResolvedValue(mockStripeSession);

      // ACT
      await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'test-user-id-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      const callArgs = mockStripeCheckoutCreate.mock.calls[0][0];
      expect(callArgs.metadata.user_id).toBe('test-user-id-123');
    });

    it('should use correct origin for redirect URLs', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockResolvedValue(mockStripeSession);

      // ACT
      await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'https://allocatrmvp.vercel.app',
      });

      // ASSERT
      const callArgs = mockStripeCheckoutCreate.mock.calls[0][0];
      expect(callArgs.success_url).toBe(
        'https://allocatrmvp.vercel.app/success?session_id={CHECKOUT_SESSION_ID}'
      );
      expect(callArgs.cancel_url).toBe('https://allocatrmvp.vercel.app/pricing');
    });

    it('should use STRIPE_PRICE_ID from environment', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockResolvedValue(mockStripeSession);

      // ACT
      await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      const callArgs = mockStripeCheckoutCreate.mock.calls[0][0];
      expect(callArgs.line_items[0].price).toBe('price_123'); // From jest.setup.js
    });

    it('should set mode to subscription', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockResolvedValue(mockStripeSession);

      // ACT
      await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      const callArgs = mockStripeCheckoutCreate.mock.calls[0][0];
      expect(callArgs.mode).toBe('subscription');
    });
  });

  describe('Error Handling', () => {
    it('should handle Stripe authentication errors', async () => {
      // ARRANGE
      const stripeError = new MockStripeError(
        'Invalid API key provided',
        'StripeAuthenticationError',
        401
      );
      mockStripeCheckoutCreate.mockRejectedValue(stripeError);

      // ACT
      const result = await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Invalid API key provided');
      }
    });

    it('should handle invalid price ID errors', async () => {
      // ARRANGE
      const stripeError = new MockStripeError(
        'No such price: invalid_price_id',
        'StripeInvalidRequestError',
        400
      );
      mockStripeCheckoutCreate.mockRejectedValue(stripeError);

      // ACT
      const result = await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No such price');
      }
    });

    it('should handle unknown errors gracefully', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockRejectedValue('Unknown error');

      // ACT
      const result = await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Unknown error');
      }
    });

    it('should handle network errors', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockRejectedValue(
        new Error('Network connection failed')
      );

      // ACT
      const result = await createCheckoutSession({
        userEmail: 'test@example.com',
        userId: 'user-123',
        origin: 'http://localhost:3000',
      });

      // ASSERT
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Network connection failed');
      }
    });
  });

  describe('Input Validation', () => {
    it('should handle different email formats', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockResolvedValue(mockStripeSession);

      const emails = [
        'user@example.com',
        'user.name+tag@example.co.uk',
        'test123@subdomain.example.com',
      ];

      // ACT & ASSERT
      for (const email of emails) {
        await createCheckoutSession({
          userEmail: email,
          userId: 'user-123',
          origin: 'http://localhost:3000',
        });

        const callArgs = mockStripeCheckoutCreate.mock.calls[mockStripeCheckoutCreate.mock.calls.length - 1][0];
        expect(callArgs.customer_email).toBe(email);
      }
    });

    it('should handle different origin formats', async () => {
      // ARRANGE
      mockStripeCheckoutCreate.mockResolvedValue(mockStripeSession);

      const origins = [
        'http://localhost:3000',
        'https://allocatrmvp.vercel.app',
        'https://custom-domain.com',
      ];

      // ACT & ASSERT
      for (const origin of origins) {
        await createCheckoutSession({
          userEmail: 'test@example.com',
          userId: 'user-123',
          origin,
        });

        const callArgs = mockStripeCheckoutCreate.mock.calls[mockStripeCheckoutCreate.mock.calls.length - 1][0];
        expect(callArgs.success_url).toContain(origin);
        expect(callArgs.cancel_url).toContain(origin);
      }
    });
  });
});
