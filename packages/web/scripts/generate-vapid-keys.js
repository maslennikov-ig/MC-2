/**
 * Script to generate VAPID keys for Web Push notifications
 *
 * Run with: node scripts/generate-vapid-keys.js
 *
 * Add the output to your .env.local file:
 * - WEB_PUSH_EMAIL - Your admin email for push service identification
 * - WEB_PUSH_PRIVATE_KEY - Keep this secret, server-side only
 * - NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY - Safe to expose to clients
 */

import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('\n=== VAPID Keys Generated ===\n');
console.log('Add these to your .env.local file:\n');
console.log(`WEB_PUSH_EMAIL=admin@megacampus.ru`);
console.log(`WEB_PUSH_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log('\n============================\n');
console.log('IMPORTANT: Keep WEB_PUSH_PRIVATE_KEY secret!');
console.log('The public key can be safely exposed to clients.\n');
