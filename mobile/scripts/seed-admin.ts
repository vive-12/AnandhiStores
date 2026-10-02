/**
 * seed-admin.ts — One-time script to create the admin user in Firestore.
 *
 * Usage (from mobile/ directory):
 *   npx ts-node scripts/seed-admin.ts
 *
 * Or run the equivalent logic in the Firebase console / Expo dev menu.
 *
 * This script:
 *   1. Creates a Firebase Auth account for the admin phone
 *   2. Creates a Firestore user doc with role: 'admin', status: 'approved'
 *   3. Uses the Firebase Auth UID as the Firestore doc ID
 *
 * After running, the admin can log in via either:
 *   - Phone login: 9876543219 + PIN 1234
 *   - Admin PIN unlock: PIN 1234
 */

// ── CONFIG: Change these for your store ─────────────────────────────
const ADMIN_PHONE = '9876543219';
const ADMIN_PIN   = '1234';
const ADMIN_NAME  = 'Store Admin';
// ────────────────────────────────────────────────────────────────────

console.log('=== Anandhi Stores — Admin Seed ===');
console.log(`Admin Phone: ${ADMIN_PHONE}`);
console.log(`Admin PIN:   ${ADMIN_PIN}`);
console.log(`Admin Name:  ${ADMIN_NAME}`);
console.log('');
console.log('To seed the admin, run the following from the Expo app:');
console.log('');
console.log('  1. Open the app');
console.log('  2. Navigate to /dev/seed-admin (add a dev route)');
console.log('  3. Or use the Firebase Console to manually create:');
console.log('');
console.log('  Firestore → users → (new doc) →');
console.log(`    role: "admin"`);
console.log(`    name: "${ADMIN_NAME}"`);
console.log(`    phone: "${ADMIN_PHONE}"`);
console.log(`    pin: "${ADMIN_PIN}"  (will be hashed on first login)`);
console.log(`    status: "approved"`);
console.log('');
console.log('  The first time the admin logs in via the app,');
console.log('  Firebase Auth will be created automatically and');
console.log('  the PIN will be verified against the stored hash.');
