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
      sessionVersion: FieldValue.increment(1),
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
      sessionVersion: 0,
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
  const caller = requireAdmin(request);
  const { uid } = request.data || {};
  if (typeof uid !== 'string' || !uid || uid === caller.uid) throw new HttpsError('invalid-argument', 'Choose a delivery agent.');
  const ref = db.collection('users').doc(uid);
  await db.runTransaction(async tx => {
    const profile = await tx.get(ref);
    const active = await tx.get(db.collection('orders').where('agentId', '==', uid).where('status', 'in', ['placed', 'packed', 'out_for_delivery']).limit(1));
    if (!profile.exists || profile.get('role') !== 'agent') throw new HttpsError('failed-precondition', 'This is not an agent profile.');
    if (!active.empty || Number(profile.get('assignedRunCount') || profile.get('activeOrderCount') || 0) > 0) throw new HttpsError('failed-precondition', 'Reassign all active delivery and recovery work first.');
    tx.update(ref, { status: 'blocked', isOnline: false, isArchived: true, sessionVersion: FieldValue.increment(1), deactivatedAt: Timestamp.now() });
  });
  // Profile remains blocked if Auth is unavailable; retry is safe, never report silent success.
  const profile = await ref.get();
  const account = await auth.getUser(profile.get('authUid') || uid).catch(error => {
    if (error.code === 'auth/user-not-found') return null;
    throw error;
  });
  if (account) { await auth.updateUser(account.uid, { disabled: true }); await auth.revokeRefreshTokens(account.uid); }
  return { ok: true };
});

exports.changeOwnPin = onCall(async request => {
  const caller = requireSignedIn(request);
  const { uid, phone, hashedPin, oldHashedPin } = request.data || {};
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

  const expected = previousPassword(profile, phone);
  if (!validHash(oldHashedPin) || !expected || !crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(oldHashedPin, 'hex'))) throw new HttpsError('permission-denied', 'Current PIN is incorrect. Ask admin if you forgot it.');
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


/** Admin-assisted phone change; no SMS OTP and no new UID/order migration. */
exports.adminChangePhone = onCall(async request => {
  requireAdmin(request);
  const { uid, phone, hashedPin } = request.data || {};
  if (typeof uid !== 'string' || !/^[6-9]\d{9}$/.test(phone || '') || !validHash(hashedPin)) throw new HttpsError('invalid-argument', 'Choose an account, valid new phone and temporary PIN.');
  const ref = db.collection('users').doc(uid);
  const profile = await ref.get();
  if (!profile.exists) throw new HttpsError('not-found', 'Account not found.');
  const duplicate = await db.collection('users').where('phone', '==', phone).limit(2).get();
  if (duplicate.docs.some(d => d.id !== uid)) throw new HttpsError('already-exists', 'This phone belongs to another account.');
  const account = await auth.getUser(profile.get('authUid') || uid);
  const oldEmail = account.email;
  await auth.updateUser(account.uid, { email: phone + '@anandhi.app', password: hashedPin });
  try {
    await ref.update({ phone, pin: hashedPin, plainPin: FieldValue.delete(), mustChangePin: true, sessionVersion: FieldValue.increment(1) });
  } catch (error) {
    const oldPassword = previousPassword(profile, String(profile.get('phone')));
    await auth.updateUser(account.uid, { email: oldEmail, ...(oldPassword ? { password: oldPassword } : {}) }).catch(() => {});
    throw error;
  }
  await auth.revokeRefreshTokens(account.uid);
  return { ok: true };
});

// Optional background delivery. Off by default: adding this code does not enable
// billing, deploy a function, or introduce a paid scheduler.
if (process.env.ENABLE_BACKGROUND_PUSH === 'true') {
  const { onDocumentCreated } = require('firebase-functions/v2/firestore');
  exports.dispatchNotification = onDocumentCreated({ document: 'notifications/{notificationId}', retry: true }, async event => {
    const ref = event.data.ref;
    const claimed = await db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists || snapshot.get('pushStatus') !== 'pending') return null;
      if (Number(snapshot.get('leaseUntil') || 0) > Date.now()) throw new Error('Push record is leased; retry later.');
      const data = snapshot.data();
      tx.update(ref, { leaseUntil: Date.now() + 60_000, pushAttempts: FieldValue.increment(1) });
      return data;
    });
    if (!claimed) return;
    try {
      const profileRef = db.collection('users').doc(claimed.toUid);
      const profile = await profileRef.get();
      const tokens = [...new Set(profile.get('pushTokens') || [profile.get('pushToken')])].filter(token => typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[/.test(token));
      if (!tokens.length) { await ref.update({ pushStatus: 'failed', pushError: 'No registered device; in-app notice retained.', leaseUntil: 0 }); return; }
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tokens.map(to => ({ to, title: claimed.title, body: claimed.body, data: { orderId: claimed.orderId || null, notificationId: event.params.notificationId, type: claimed.type }, sound: 'default', channelId: 'default' }))),
      });
      if (!response.ok) throw new Error('Expo HTTP ' + response.status);
      const result = await response.json();
      const tickets = Array.isArray(result.data) ? result.data : [result.data];
      let temporary = false;
      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        if (ticket?.details?.error === 'DeviceNotRegistered') await profileRef.update({ pushTokens: FieldValue.arrayRemove(tokens[i]), ...(profile.get('pushToken') === tokens[i] ? { pushToken: null } : {}) });
        else if (!ticket || ticket.status !== 'ok') temporary = true;
      }
      if (temporary) throw new Error('Expo rejected one or more tickets.');
      await ref.update({ pushStatus: 'sent', leaseUntil: 0, pushAcceptedAt: Timestamp.now(), pushTickets: tickets.filter(t => t?.id).map(t => t.id) });
    } catch (error) {
      const exhausted = Number(claimed.pushAttempts || 0) >= 4;
      await ref.update({ leaseUntil: 0, pushStatus: exhausted ? 'failed' : 'pending', pushError: String(error.message || error) });
      if (!exhausted) throw error;
    }
  });
}
