/**
 * Business logic for Stripe checkout
 * Extracted for easier testing
 */

import Stripe from 'stripe';

// Create stripe instance - can be mocked in tests
export const createStripeInstance = () => {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2025-09-30.clover',
  });
};

const stripe = createStripeInstance();

export interface CheckoutSessionInput {
  userEmail: string;
  userId: string;
  origin: string;
}

export type CheckoutSessionResult =
  | {
      success: true;
      url: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Create a Stripe checkout session for subscription
 */
export async function createCheckoutSession(
  input: CheckoutSessionInput
): Promise<CheckoutSessionResult> {
  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: input.userEmail,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${input.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${input.origin}/pricing`,
      metadata: {
        user_id: input.userId,
      },
    });

    return {
      success: true,
      url: session.url!,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
