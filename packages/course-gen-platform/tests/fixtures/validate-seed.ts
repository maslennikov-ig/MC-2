#!/usr/bin/env ts-node

/**
 * Validation script to check if seed functions are properly exported
 */

import { seedDatabase, cleanDatabase } from './seed-database';

console.log('✅ Seed functions imported successfully');
console.log('Available functions:');
console.log('  - seedDatabase:', typeof seedDatabase);
console.log('  - cleanDatabase:', typeof cleanDatabase);

// Check if environment variables would be loaded
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.log('\n⚠️  Warning: Supabase environment variables not configured');
  console.log('Please create a .env file with:');
  console.log('  SUPABASE_URL=<your-supabase-url>');
  console.log('  SUPABASE_SERVICE_KEY=<your-service-key>');
} else {
  console.log('\n✅ Environment variables configured');
  console.log(`  SUPABASE_URL: ${supabaseUrl.substring(0, 30)}...`);
  console.log(`  Service Key: ${supabaseServiceKey.substring(0, 10)}...`);
}

console.log('\nValidation complete!');
process.exit(0);
