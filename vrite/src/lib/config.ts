/**
 * Application configuration
 * Uses environment variables with fallbacks for local development
 */
const config = {
  /**
   * Backend API base URL
   * In production: set via NEXT_PUBLIC_BACKEND_API_URL
   * In development: defaults to http://localhost:8000
   */
  backendApiUrl: process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000',
} as const;

// Validate required environment variables in production
if (process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_BACKEND_API_URL) {
  console.warn('Warning: NEXT_PUBLIC_BACKEND_API_URL is not set in production environment');
}

export default config;
