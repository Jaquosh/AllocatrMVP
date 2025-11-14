import '@testing-library/jest-dom'

// Mock environment variables for testing
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.STRIPE_SECRET_KEY = 'sk_test_123'
process.env.STRIPE_PRICE_ID = 'price_123'

// Mock Next.js cookies for server components
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    getAll: jest.fn(() => []),
    get: jest.fn(() => undefined),
    set: jest.fn(),
    delete: jest.fn(),
  })),
  headers: jest.fn(() => ({
    get: jest.fn(() => null),
  })),
}))
