/**
 * Vitest setup file - runs before each test file
 * For global setup (worker startup), see global-setup.ts
 */
import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env
config({ path: path.resolve(__dirname, '../.env') });

// Verify critical environment variables are loaded
console.log('=== TEST FILE SETUP ===');
console.log(
  'SUPABASE_URL:',
  process.env.SUPABASE_URL
    ? 'SET (' + process.env.SUPABASE_URL.substring(0, 30) + '...)'
    : 'MISSING'
);
console.log(
  'SUPABASE_SERVICE_KEY:',
  process.env.SUPABASE_SERVICE_KEY
    ? 'SET (' + process.env.SUPABASE_SERVICE_KEY.substring(0, 30) + '...)'
    : 'MISSING'
);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}
