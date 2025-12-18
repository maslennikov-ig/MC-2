#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Read migration SQL
const migrationPath = join(
  __dirname,
  '../supabase/migrations/20251111000000_fix_test_auth_user_role_metadata.sql'
);
const migrationSQL = readFileSync(migrationPath, 'utf-8');

console.log('Applying migration: 20251111000000_fix_test_auth_user_role_metadata.sql');
console.log('Migration SQL length:', migrationSQL.length);

// Execute migration via RPC
const { data, error } = await supabase.rpc('exec_sql', {
  sql_query: migrationSQL,
}).single();

if (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}

console.log('Migration applied successfully!');
console.log('Result:', data);
