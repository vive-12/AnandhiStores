const { initializeApp } = require("firebase/app");
const { getFirestore, collection, getDocs } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyBkFWe2PEcJpJh_V51C6sYyuEvueLXGs4k",
  authDomain: "anandhi-stores.firebaseapp.com",
  projectId: "anandhi-stores",
  storageBucket: "anandhi-stores.firebasestorage.app",
  messagingSenderId: "36431070330",
  appId: "1:36431070330:web:ae9fd7ddb350c9b3d967c3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function testRead() {
  try {
    const snap = await getDocs(collection(db, 'orders'));
    console.log("Read success! Found:", snap.size, "orders");
  } catch (err) {
    console.error("Read failed:", err.message);
  }
  process.exit(0);
}

testRead();
