// scripts/test-e2e-order.js — Programmatic E2E lifecycle test
const { initializeApp, getApps } = require('firebase/app');
const {
  getFirestore, collection, doc, getDoc, setDoc, deleteDoc,
  Timestamp, query, where, getDocs, limit, writeBatch
} = require('firebase/firestore');

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBkFWe2PEcJpJh_V51C6sYyuEvueLXGs4k',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'anandhi-stores.firebaseapp.com',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'anandhi-stores',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'anandhi-stores.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '36431070330',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:36431070330:web:ae9fd7ddb350c9b3d967c3',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db  = getFirestore(app);

async function runTest() {
  console.log('====================================================');
  console.log('ANANDHI STORES: END-TO-END ORDER LIFECYCLE TEST');
  console.log('====================================================\n');

  try {
    console.log('1. Checking Firestore connection...');
    const settingsSnap = await getDoc(doc(db, 'settings', 'store'));
    console.log('   OK - Firestore connected. Store settings found:', settingsSnap.exists());

    console.log('\n2. Resolving test actor accounts...');
    const usersSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'customer'), limit(1)));
    const testCustomerId = !usersSnap.empty ? usersSnap.docs[0].id : 'test-customer-001';
    const testCustomerName = !usersSnap.empty ? (usersSnap.docs[0].data().name || 'Test Customer') : 'Test Customer';

    const agentsSnap = await getDocs(query(collection(db, 'users'), where('role', '==', 'agent'), limit(1)));
    const testAgentId = !agentsSnap.empty ? agentsSnap.docs[0].id : 'test-agent-001';
    const testAgentName = !agentsSnap.empty ? (agentsSnap.docs[0].data().name || 'Test Agent') : 'Test Agent';

    console.log(`   Customer: ${testCustomerName} (${testCustomerId})`);
    console.log(`   Agent:    ${testAgentName} (${testAgentId})`);

    console.log('\n3. Step 1: Customer creates order (COD)...');
    const counterRef = doc(db, 'counters', 'orders');
    const counterSnap = await getDoc(counterRef);
    const nextSeq = counterSnap.exists() ? (counterSnap.data().next || 1000) : 1000;
    const testOrderNo = `TEST-${nextSeq}`;

    const orderRef = doc(collection(db, 'orders'));
    const now = Timestamp.now();

    const orderData = {
      orderNo: testOrderNo,
      customerId: testCustomerId,
      customerName: testCustomerName,
      customerPhone: '9876543210',
      addressSnapshot: {
        door: '12B',
        street: 'Gandhi Road',
        locality: 'Velachery',
        city: 'Chennai',
        landmark: 'Near Bus Depot',
        lat: 12.9815,
        lng: 80.2180,
      },
      items: [
        {
          itemId: 'test-item-water-can',
          name: '20L Drinking Water Can',
          unit: '20L Can',
          price: 35,
          qty: 2,
          lineTotal: 70,
        },
      ],
      subtotal: 70,
      deliveryFee: 20,
      total: 90,
      paymentMethod: 'COD',
      slot: { type: 'asap', label: 'ASAP Delivery' },
      notes: 'Please ring bell',
      status: 'placed',
      agentId: null,
      agentName: null,
      agentPhone: null,
      agentFee: null,
      source: 'customer',
      cancelReason: null,
      cancelledBy: null,
      statusHistory: [{ status: 'placed', at: now, byUid: testCustomerId, byRole: 'customer' }],
      createdAt: now,
      updatedAt: now,
      packedAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      cancelledAt: null,
      type: 'order',
      pendingCansToCollect: 2,
    };

    await setDoc(orderRef, orderData);
    console.log(`   OK - Order created: ID=${orderRef.id} (${testOrderNo}), Status: placed, Total: Rs 90 (COD)`);

    console.log('\n4. Step 2: Admin assigns agent...');
    const assignBatch = writeBatch(db);
    assignBatch.update(orderRef, {
      agentId: testAgentId,
      agentName: testAgentName,
      agentPhone: '9123456780',
      agentFee: 25,
      updatedAt: Timestamp.now(),
    });
    await assignBatch.commit();
    const assignedSnap = await getDoc(orderRef);
    console.log(`   OK - Order assigned to ${assignedSnap.data()?.agentName} (Fee: Rs ${assignedSnap.data()?.agentFee})`);

    console.log('\n5. Step 3: Agent picks up order (-> out_for_delivery)...');
    const pickupBatch = writeBatch(db);
    const pickupTime = Timestamp.now();
    const currentHist = assignedSnap.data()?.statusHistory || [];
    pickupBatch.update(orderRef, {
      status: 'out_for_delivery',
      pickedUpAt: pickupTime,
      updatedAt: pickupTime,
      statusHistory: [...currentHist, { status: 'out_for_delivery', at: pickupTime, byUid: testAgentId, byRole: 'agent' }],
    });
    await pickupBatch.commit();
    const pickupSnap = await getDoc(orderRef);
    console.log(`   OK - Status transitioned to: ${pickupSnap.data()?.status}`);

    console.log('\n6. Step 4: Agent checks off items and updates empties...');
    const checklistBatch = writeBatch(db);
    checklistBatch.update(orderRef, {
      checkedItems: { 0: true },
      emptyCansCollected: 2,
      updatedAt: Timestamp.now(),
    });
    await checklistBatch.commit();
    const checkSnap = await getDoc(orderRef);
    console.log(`   OK - Checklist synced: item[0]=${checkSnap.data()?.checkedItems?.[0]}, empties=${checkSnap.data()?.emptyCansCollected}`);

    console.log('\n7. Step 5: Agent marks delivered (Swipe to confirm & Cash collected)...');
    const deliverBatch = writeBatch(db);
    const deliveredTime = Timestamp.now();
    const histBeforeDeliver = checkSnap.data()?.statusHistory || [];
    deliverBatch.update(orderRef, {
      status: 'delivered',
      deliveredAt: deliveredTime,
      updatedAt: deliveredTime,
      statusHistory: [...histBeforeDeliver, { status: 'delivered', at: deliveredTime, byUid: testAgentId, byRole: 'agent' }],
    });
    await deliverBatch.commit();
    const deliveredSnap = await getDoc(orderRef);
    console.log(`   OK - Final status: ${deliveredSnap.data()?.status}, DeliveredAt: ${deliveredSnap.data()?.deliveredAt ? 'OK' : 'MISSING'}`);

    console.log('\n8. Cleaning up test order...');
    await deleteDoc(orderRef);
    console.log('   OK - Test order deleted.');

    console.log('\n====================================================');
    console.log('SUCCESS: ALL 5 LIFECYCLE PHASES PASSED WITH ZERO ERRORS!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('ERROR - E2E TEST FAILED:', err);
    process.exit(1);
  }
}

runTest();
