const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs, doc, updateDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyBkFWe2PEcJpJh_V51C6sYyuEvueLXGs4k",
  authDomain: "anandhi-stores.firebaseapp.com",
  projectId: "anandhi-stores"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function syncCans() {
  console.log("Starting to sync pending cans...");
  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    const ordersSnap = await getDocs(collection(db, 'orders'));
    
    const users = {};
    usersSnap.forEach(u => {
      users[u.id] = 0; // reset to 0
    });

    // Calculate from orders
    ordersSnap.forEach(oSnap => {
      const o = oSnap.data();
      if (o.status === 'delivered' && o.user_id && users[o.user_id] !== undefined) {
        
        let cansDelivered = 0;
        if (o.items) {
           cansDelivered = o.items.filter(i => i.name.toLowerCase().includes('can')).reduce((sum, i) => sum + (i.qty||0), 0);
        }
        // if they ordered cans in the old structure, it was cans_qty
        if (o.cans_qty) {
          cansDelivered += o.cans_qty;
        }

        const collected = o.empty_cans_collected || 0;
        const netCans = cansDelivered - collected;
        
        users[o.user_id] += netCans;
      }
    });

    console.log("Calculated balances. Updating DB...");
    let updated = 0;
    for (const [userId, balance] of Object.entries(users)) {
      if (balance > 0) {
        await updateDoc(doc(db, 'users', userId), { pending_cans: balance });
        console.log(`Updated user ${userId} to ${balance} cans.`);
        updated++;
      }
    }
    
    console.log(`Done! Updated ${updated} users.`);
  } catch (err) {
    console.error("Error:", err.message);
  }
  process.exit(0);
}

syncCans();
