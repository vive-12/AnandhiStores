import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

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

async function testWrite() {
  try {
    const docRef = await addDoc(collection(db, 'orders'), {
      user_id: 'test',
      items: [],
      status: 'placed',
      delivery_fee: 0,
      placed_at: serverTimestamp()
    });
    console.log("Write success! ID:", docRef.id);
  } catch (err) {
    console.error("Write failed:", err.message);
  }
  process.exit(0);
}

testWrite();
