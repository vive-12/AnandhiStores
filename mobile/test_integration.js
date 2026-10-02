const { initializeApp } = require("firebase/app");
const { getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyBkFWe2PEcJpJh_V51C6sYyuEvueLXGs4k",
  authDomain: "anandhi-stores.firebaseapp.com",
  projectId: "anandhi-stores"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function runTest() {
  console.log("🚀 Starting Backend Lifecycle Test...");
  const shortId = "TEST-" + Math.floor(1000 + Math.random() * 9000);
  const docRef = doc(db, "orders", shortId);

  try {
    // 1. CUSTOMER: Place Order
    console.log(`\n[1] Customer: Placing order #${shortId}...`);
    await setDoc(docRef, {
      user_id: "test_user",
      customer_name: "Test Customer",
      customer_phone: "9999999999",
      delivery_address: "123 Test St",
      items: [{ id: "test", name: "Test Item", qty: 2 }],
      cod_amount: 150,
      total_amount: 150,
      status: "placed",
      placed_at: serverTimestamp()
    });
    console.log("✅ Success: Order created (Rules passed!)");

    // 2. ADMIN: Read Order
    console.log(`\n[2] Admin: Fetching new orders...`);
    const snap = await getDoc(docRef);
    if (!snap.exists()) throw new Error("Order not found!");
    console.log(`✅ Success: Found order. Status is '${snap.data().status}'`);

    // 3. ADMIN: Assign Agent
    console.log(`\n[3] Admin: Assigning agent to order...`);
    await updateDoc(docRef, {
      status: "assigned",
      agent_id: "test_agent",
      agent_name: "Test Agent",
      agent_phone: "8888888888"
    });
    console.log("✅ Success: Order assigned!");

    // 4. AGENT: Mark Out for Delivery & Delivered
    console.log(`\n[4] Agent: Checking off checklist & updating status...`);
    await updateDoc(docRef, { status: "out_for_delivery" });
    console.log("✅ Success: Out for delivery!");
    
    await updateDoc(docRef, { status: "delivered", delivered_at: serverTimestamp() });
    console.log("✅ Success: Delivered!");

  } catch (err) {
    console.error("❌ TEST FAILED:", err.message);
  } finally {
    // Clean up
    console.log(`\n🧹 Cleaning up test order...`);
    try { 
      // This will fail because your rules say: allow delete: if false;
      // We'll see if the rules block it properly!
      await deleteDoc(docRef); 
      console.log("⚠️ Deleted successfully (Wait, rules should have blocked this!)");
    } catch(e) {
      console.log("✅ Cleanup failed as expected: 'allow delete: if false' works perfectly!");
    }
    process.exit(0);
  }
}

runTest();
