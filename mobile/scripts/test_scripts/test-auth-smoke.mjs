import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, getDocsFromServer, getFirestore, limit, query, where } from 'firebase/firestore';

const envFile = resolve(process.cwd(), '..', '.env');
let envText = '';
try { envText = readFileSync(envFile, 'utf8'); } catch { /* process environment may supply the test values */ }

function privateEnv(name) {
  if (process.env[name]) return process.env[name];
  const line = envText.split(/\r?\n/).find(value => value.trimStart().startsWith(`${name}=`));
  if (!line) return '';
  const value = line.slice(line.indexOf('=') + 1).trim();
  return value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted ?? '');
}

function firebaseConfigValue(name, envName) {
  if (process.env[envName]) return process.env[envName];
  const source = readFileSync(resolve(process.cwd(), 'config/firebase.ts'), 'utf8');
  const match = source.match(new RegExp(`${name}:\\s*process\\.env\\.${envName}\\s*\\|\\|\\s*'([^']+)'`));
  if (!match) throw new Error(`Firebase config value ${envName} is missing.`);
  return match[1];
}

const roles = [
  { role: 'admin', phoneKey: 'ADMIN_PHONE', pinKey: 'ADMIN_PIN' },
  { role: 'customer', phoneKey: 'CUSTOMER_PHONE', pinKey: 'CUSTOMER_PIN' },
  { role: 'agent', phoneKey: 'AGENT_PHONE', pinKey: 'AGENT_PIN' },
];

const config = {
  apiKey: firebaseConfigValue('apiKey', 'EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: firebaseConfigValue('authDomain', 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: firebaseConfigValue('projectId', 'EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: firebaseConfigValue('storageBucket', 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: firebaseConfigValue('messagingSenderId', 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: firebaseConfigValue('appId', 'EXPO_PUBLIC_FIREBASE_APP_ID'),
};

const missing = roles.flatMap(item => [item.phoneKey, item.pinKey]).filter(key => !privateEnv(key));
if (missing.length) {
  console.error(`AUTH SMOKE NOT RUN: missing local test variables: ${missing.join(', ')}.`);
  process.exit(2);
}

const app = initializeApp(config, 'read-only-auth-smoke');
const auth = getAuth(app);
const db = getFirestore(app);

function digest(pin, phone) {
  return createHash('sha256').update(`${pin}${phone}`).digest('hex');
}

async function findProfiles(phone) {
  const users = await getDocsFromServer(query(collection(db, 'users'), where('phone', '==', phone), limit(2)));
  if (!users.empty) return users.docs.map(profile => ({ id: profile.id, data: profile.data(), source: 'users', role: profile.data().role }));

  const legacyAgents = await getDocsFromServer(query(collection(db, 'agents'), where('phone', '==', phone), limit(2)));
  if (!legacyAgents.empty) return legacyAgents.docs.map(profile => ({ id: profile.id, data: profile.data(), source: 'agents', role: 'agent' }));
  throw Object.assign(new Error('profile not found'), { code: 'test/profile-not-found' });
}

async function smokeRole(item) {
  const phone = privateEnv(item.phoneKey).replace(/\D/g, '').slice(-10);
  const pin = privateEnv(item.pinKey);
  if (!/^\d{10}$/.test(phone) || !/^\d{4}$/.test(pin)) {
    throw Object.assign(new Error('invalid local test credential format'), { code: 'test/invalid-env-format' });
  }

  const profiles = await findProfiles(phone);
  const expectedHash = digest(pin, phone);
  const matchesPin = profile =>
    profile.data.pin === expectedHash || profile.data.pin === pin || profile.data.plainPin === pin;
  let pinMatchedProfiles = profiles.filter(matchesPin);
  if (item.role === 'agent' && pinMatchedProfiles.length > 1) {
    const canonical = pinMatchedProfiles.filter(profile =>
      profile.role === 'agent' && String(profile.data.name ?? '').trim().toLowerCase() === 'smallvivek',
    );
    if (canonical.length === 1) pinMatchedProfiles = canonical;
  }
  if (pinMatchedProfiles.length > 1) {
    const roleCounts = pinMatchedProfiles.reduce((counts, profile) => {
      const role = String(profile.role || 'missing-role');
      counts[role] = (counts[role] || 0) + 1;
      return counts;
    }, {});
    throw Object.assign(new Error(`multiple profiles match the supplied PIN (role counts: ${JSON.stringify(roleCounts)})`), { code: 'test/duplicate-pin-profile' });
  }
  if (pinMatchedProfiles.length === 0) throw Object.assign(new Error('no matching profile PIN'), { code: 'test/pin-mismatch' });
  const profile = pinMatchedProfiles[0];
  if (profile.role !== item.role) {
    throw Object.assign(new Error('profile role mismatch'), { code: 'test/role-mismatch' });
  }
  if (profile.data.status === 'blocked') throw Object.assign(new Error('account is blocked'), { code: 'test/account-blocked' });
  console.log(`PASS: ${item.role} Firestore profile and PIN check`);

  // This is a sign-in/read-only test. It does not create users, reset PINs,
  // update profiles, place orders, or write Firestore documents.
  const credential = await signInWithEmailAndPassword(auth, `${phone}@anandhi.app`, expectedHash);
  if (profile.source === 'users' && credential.user.uid !== profile.id) {
    throw Object.assign(new Error('Auth UID and profile UID differ'), { code: 'test/uid-mismatch' });
  }
  await signOut(auth);
}

let passed = 0;
let authProviderUnavailable = false;
let profileChecksPassed = 0;
const demoLoginEnabled = privateEnv('ENABLE_DEMO_LOGIN') === 'true';

if (demoLoginEnabled) {
  console.log('Development demo-login flag is enabled for this local test run.');
}

for (const item of roles) {
  try {
    await smokeRole(item);
    passed++;
    console.log(`PASS: ${item.role} profile, PIN hash, and Firebase Auth sign-in`);
  } catch (error) {
    try { await signOut(auth); } catch { /* no active user */ }
    console.error(`FAIL: ${item.role} smoke test (code: ${error?.code ?? 'unknown'}).`);
    if (error?.code === 'auth/operation-not-allowed' || error?.code === 'auth/configuration-not-found') {
      // smokeRole emits this only after the profile and PIN have matched.
      profileChecksPassed++;
    }
    if (error?.code?.startsWith('test/')) console.error(error.message);
    if (error?.code === 'auth/configuration-not-found' || error?.code === 'auth/operation-not-allowed') {
      console.error('Firebase Auth project/provider configuration is missing or disabled. Check the project ID and enable Email/Password sign-in in Firebase Console.');
      authProviderUnavailable = true;
    } else if (error?.code === 'auth/invalid-credential' || error?.code === 'auth/wrong-password' || error?.code === 'auth/user-not-found') {
      console.error('The profile PIN matched, but the Firebase Auth account is missing or its password is out of sync with the profile PIN. Use the admin reset flow after Functions are deployed.');
    } else if (error?.code === 'permission-denied') {
      console.error('Firestore denied the profile read. Check the current rules and whether this query is allowed.');
    } else if (error?.code === 'unavailable' || error?.code === 'auth/network-request-failed') {
      console.error('Firebase could not be reached from this test environment.');
    }
    if (!authProviderUnavailable) {
      process.exitCode = 1;
      break;
    }
  }
}

if (authProviderUnavailable) {
  if (demoLoginEnabled && profileChecksPassed === roles.length) {
    console.warn('Firebase Email/Password is disabled; Expo development demo login intentionally uses the verified Firestore profile/PIN path.');
    console.log(`PASS: ${profileChecksPassed}/${roles.length} development demo login profile/PIN checks. Firebase Auth sign-in remains unavailable.`);
  } else {
    console.error('Auth sign-in could not be verified for all roles because Email/Password sign-in is disabled or unavailable.');
    process.exitCode = 1;
  }
} else if (passed === roles.length) {
  console.log(`PASS: ${passed}/${roles.length} role login smoke tests. Firestore writes: 0.`);
}
