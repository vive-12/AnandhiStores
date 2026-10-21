const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue, Timestamp } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

initializeApp();
setGlobalOptions({ region: 'asia-south1' });

const auth = getAuth();
const db = getFirestore();

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to continue.');
  return request.auth;
}

function requireAdmin(request) {
  const user = requireSignedIn(request);
  if (user.token.admin !== true) {
    throw new HttpsError('permission-denied', 'An administrator account is required.');
  }
  return user;
}

function validPhone(phone) {
  return typeof phone === 'string' && /^\d{10}$/.test(phone);
}

function validHash(hash) {
  return typeof hash === 'string' && /^[a-f0-9]{64}$/i.test(hash);
}

function previousPassword(profile, phone) {
  const storedPin = profile.get('pin');
  if (validHash(storedPin)) return storedPin;
  const legacyPin = typeof storedPin === 'string' && /^\d{4}$/.test(storedPin)
    ? storedPin
    : profile.get('plainPin');
  return typeof legacyPin === 'string' && /^\d{4}$/.test(legacyPin)
    ? crypto.createHash('sha256').update(legacyPin + phone).digest('hex')
    : null;
}

exports.adminResetPin = onCall(async request => {
  requireAdmin(request);
  const { uid, phone, hashedPin } = request.data || {};
  if (typeof uid !== 'string' || !validPhone(phone) || !validHash(hashedPin)) {
    throw new HttpsError('invalid-argument', 'A user ID, valid phone and hashed PIN are required.');
  }

  let profileRef = db.collection('users').doc(uid);
  let profile = await profileRef.get();
  let legacyAgentProfile = false;
  if (!profile.exists) {
    profileRef = db.collection('agents').doc(uid);
    profile = await profileRef.get();
    legacyAgentProfile = profile.exists;
  }
  if (!profile.exists || String(profile.get('phone') || '').replace(/\D/g, '').slice(-10) !== phone) {
    throw new HttpsError('failed-precondition', 'The user profile does not match the requested account.');
  }
  const email = `${phone}@anandhi.app`;
  let account = await auth.getUserByEmail(email).catch(() => null);
  const createdAuthAccount = !account;
  if (account) {
    await auth.updateUser(account.uid, { password: hashedPin, disabled: false });
  } else {
    account = await auth.createUser({ email, password: hashedPin, disabled: false });
  }
  try {
    await profileRef.set({
      pin: hashedPin,
      plainPin: FieldValue.delete(),
      mustChangePin: true,
      ...(legacyAgentProfile ? {} : { status: 'approved' }),
    }, { merge: true });
  } catch (error) {
    if (createdAuthAccount) {
      await auth.deleteUser(account.uid).catch(() => {});
    } else {
      const previousPin = previousPassword(profile, phone);
      if (previousPin) await auth.updateUser(account.uid, { password: previousPin }).catch(() => {});
    }
    throw error;
  }
  await auth.revokeRefreshTokens(account.uid);
  return { uid: account.uid };
});

exports.adminCreateAgent = onCall(async request => {
  requireAdmin(request);
  const { name, phone, hashedPin } = request.data || {};
  if (typeof name !== 'string' || !name.trim() || !validPhone(phone) || !validHash(hashedPin)) {
    throw new HttpsError('invalid-argument', 'A name, valid phone and hashed PIN are required.');
  }

  const email = `${phone}@anandhi.app`;
  let account;
  try {
    account = await auth.createUser({ email, password: hashedPin, displayName: name.trim(), disabled: false });
  } catch (error) {
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', 'An Auth account already uses this phone number.');
    }
    throw error;
  }

  try {
    await db.collection('users').doc(account.uid).create({
      role: 'agent', name: name.trim(), phone, pin: hashedPin,
      mustChangePin: true,
      status: 'approved', isOnline: false,
      address: { door: '', street: '', locality: '', city: 'Chennai', landmark: '', lat: null, lng: null },
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    await auth.deleteUser(account.uid).catch(() => {});
    throw error;
  }
  return { uid: account.uid };
});

exports.adminDeleteAgent = onCall(async request => {
  requireAdmin(request);
  const { uid, phone } = request.data || {};
  if (typeof uid !== 'string' || !uid) {
    throw new HttpsError('invalid-argument', 'A user ID is required.');
  }

  // 1. Delete Firestore user document
  await db.collection('users').doc(uid).delete().catch(() => {});
  await db.collection('agents').doc(uid).delete().catch(() => {});

  // 2. Delete Auth user if exists
  try {
    await auth.deleteUser(uid);
  } catch (err) {
    if (validPhone(phone)) {
      const email = `${phone}@anandhi.app`;
      const account = await auth.getUserByEmail(email).catch(() => null);
      if (account) await auth.deleteUser(account.uid).catch(() => {});
    }
  }

  return { ok: true };
});

exports.changeOwnPin = onCall(async request => {
  const caller = requireSignedIn(request);
  const { uid, phone, hashedPin } = request.data || {};
  if (typeof uid !== 'string' || !validPhone(phone) || !validHash(hashedPin)) {
    throw new HttpsError('permission-denied', 'You can only update your own account PIN.');
  }

  const callerAccount = await auth.getUser(caller.uid);
  if (callerAccount.email !== `${phone}@anandhi.app`) {
    throw new HttpsError('permission-denied', 'You can only update your own account PIN.');
  }

  let profileRef = db.collection('users').doc(uid);
  let profile = await profileRef.get();
  if (!profile.exists) {
    profileRef = db.collection('agents').doc(uid);
    profile = await profileRef.get();
  }
  if (!profile.exists) {
    const matchingUser = await db.collection('users').where('phone', '==', phone).limit(1).get();
    if (!matchingUser.empty) {
      profileRef = matchingUser.docs[0].ref;
      profile = matchingUser.docs[0];
    }
  }
  if (!profile.exists) {
    const matchingAgent = await db.collection('agents').where('phone', '==', phone).limit(1).get();
    if (!matchingAgent.empty) {
      profileRef = matchingAgent.docs[0].ref;
      profile = matchingAgent.docs[0];
    }
  }
  if (!profile.exists || String(profile.get('phone') || '').replace(/\D/g, '').slice(-10) !== phone) {
    throw new HttpsError('failed-precondition', 'The signed-in account does not match this profile.');
  }

  await auth.updateUser(caller.uid, { password: hashedPin });
  try {
    await profileRef.set({ pin: hashedPin, plainPin: FieldValue.delete(), mustChangePin: false }, { merge: true });
  } catch (error) {
    const previousPin = previousPassword(profile, phone);
    if (previousPin) await auth.updateUser(caller.uid, { password: previousPin }).catch(() => {});
    throw error;
  }
  await auth.revokeRefreshTokens(caller.uid);
  return { ok: true };
});

