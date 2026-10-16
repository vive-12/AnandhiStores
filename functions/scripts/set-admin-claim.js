const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

async function main() {
  const phone = String(process.argv[2] || '').replace(/\D/g, '').slice(-10);
  if (!/^\d{10}$/.test(phone)) throw new Error('Usage: node scripts/set-admin-claim.js <10-digit-admin-phone>');

  initializeApp({ credential: applicationDefault() });
  const auth = getAuth();
  const db = getFirestore();
  const profile = await db.collection('users').where('phone', '==', phone).where('role', '==', 'admin').limit(1).get();
  if (profile.empty) throw new Error('No admin profile found for that phone number.');
  const account = await auth.getUserByEmail(`${phone}@anandhi.app`);
  await auth.setCustomUserClaims(account.uid, { ...(account.customClaims || {}), admin: true });
  console.log(`Granted admin claim to Firebase Auth account ${account.uid}. Sign out and back in before using admin functions.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
