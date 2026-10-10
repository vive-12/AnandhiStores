// mobile/scripts/seed_500_products.js
// Seeds 500 realistic, unique grocery and water products into Firestore for Anandhi Stores.

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  writeBatch,
  doc,
  serverTimestamp,
  Timestamp,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyBkFWe2PEcJpJh_V51C6sYyuEvueLXGs4k",
  authDomain: "anandhi-stores.firebaseapp.com",
  projectId: "anandhi-stores",
  storageBucket: "anandhi-stores.firebasestorage.app",
  messagingSenderId: "36431070330",
  appId: "1:36431070330:web:ae9fd7ddb350c9b3d967c3",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Catalog base definitions
const CATALOG_TEMPLATES = [
  // 1. Water
  {
    category: "Water",
    unit: "can",
    items: [
      { name: "20L Mineral Water Can (Bisleri)", price: 80 },
      { name: "20L Pure RO Water Can (Anandhi)", price: 40 },
      { name: "20L AquaSure Purified Can", price: 45 },
      { name: "20L Kinley Spring Water Can", price: 75 },
      { name: "20L Clear Water Can with Tap", price: 65 },
      { name: "20L Alkaline Ionized Water Can", price: 95 },
      { name: "20L Premium Mountain Spring Can", price: 110 },
      { name: "10L Mineral Water Jar", price: 50 },
      { name: "5L Packaged Mineral Can", price: 35 },
      { name: "20L Natural Glacier Water Can", price: 120 },
      { name: "20L Copper Ionized Water Can", price: 85 },
      { name: "20L Smart Dispenser Water Can", price: 55 },
      { name: "20L AquaFresh RO Water Can", price: 40 },
      { name: "20L HealthPlus Mineral Water Can", price: 70 },
      { name: "20L EcoClean Pure Can", price: 45 },
      { name: "20L OxyPure Oxygenated Can", price: 90 },
      { name: "20L BlueDrop Purified Can", price: 40 },
      { name: "20L HydroFresh Spring Can", price: 60 },
      { name: "20L GlacierDrop Cool Can", price: 50 },
      { name: "20L PureLife Daily Can", price: 42 },
    ],
  },
  // 2. Vegetables
  {
    category: "Vegetables",
    unit: "kg",
    items: [
      { name: "Country Tomato (Nattu Thakkali)", price: 32 },
      { name: "Bangalore Hybrid Tomato", price: 28 },
      { name: "Bellary Big Onion", price: 45 },
      { name: "Small Sambar Onion (Shallots)", price: 65 },
      { name: "Jyoti New Potato", price: 38 },
      { name: "Baby Potato", price: 42 },
      { name: "Fresh Green Chilli (Pachai Milagai)", price: 55, unit: "g" },
      { name: "Ooty Tender Carrot", price: 58 },
      { name: "Country Green Beans", price: 64 },
      { name: "Round Purple Brinjal (Kathirikai)", price: 42 },
      { name: "Ujala Long Brinjal", price: 38 },
      { name: "Tender Drumstick (Murungakkai)", price: 60, unit: "piece" },
      { name: "Fresh Bottle Gourd (Sorakkai)", price: 30, unit: "piece" },
      { name: "Snake Gourd (Pudalangai)", price: 35 },
      { name: "Ridge Gourd (Peerkangai)", price: 48 },
      { name: "Bitter Gourd (Pavakkai)", price: 52 },
      { name: "Ash Gourd (Kalyana Poosanikai)", price: 26 },
      { name: "Yellow Pumpkin (Parangikai)", price: 24 },
      { name: "Lady's Finger (Vendakkai)", price: 46 },
      { name: "Fresh Beetroot", price: 40 },
      { name: "Green Cabbage", price: 32 },
      { name: "White Cauliflower", price: 45, unit: "piece" },
      { name: "Green Capsicum / Bell Pepper", price: 68 },
      { name: "Yellow Capsicum", price: 120 },
      { name: "Red Capsicum", price: 130 },
      { name: "English Cucumber", price: 36 },
      { name: "Country Cucumber (Vellarikai)", price: 28 },
      { name: "Fresh Ginger (Inji)", price: 110, unit: "g" },
      { name: "Hill Garlic (Malai Poondu)", price: 180, unit: "g" },
      { name: "Desi Country Garlic", price: 150, unit: "g" },
      { name: "Coriander Leaves (Kothamalli)", price: 15, unit: "bunch" },
      { name: "Fresh Mint Leaves (Pudhina)", price: 12, unit: "bunch" },
      { name: "Curry Leaves (Karuveppilai)", price: 10, unit: "bunch" },
      { name: "Palak Spinach (Pasalai Keerai)", price: 20, unit: "bunch" },
      { name: "Arai Keerai Bunch", price: 18, unit: "bunch" },
      { name: "Siru Keerai Bunch", price: 18, unit: "bunch" },
      { name: "Mulaikeerai Bunch", price: 18, unit: "bunch" },
      { name: "Methi Leaves (Vendhaya Keerai)", price: 22, unit: "bunch" },
      { name: "Raw Banana (Vazhaikkai)", price: 12, unit: "piece" },
      { name: "Banana Stem (Vazhai Thandu)", price: 25, unit: "piece" },
      { name: "Banana Flower (Vazhaipoo)", price: 30, unit: "piece" },
      { name: "Chayote Squash (Chow Chow)", price: 34 },
      { name: "Colocasia (Seppankizhangu)", price: 54 },
      { name: "Elephant Foot Yam (Senai Kizhangu)", price: 48 },
      { name: "Sweet Potato (Sakkaravalli)", price: 44 },
      { name: "Radish White (Mullangi)", price: 35 },
      { name: "Broad Beans (Avarakkai)", price: 58 },
      { name: "Cluster Beans (Kothavarangai)", price: 42 },
      { name: "Ivy Gourd (Kovakkai)", price: 46 },
      { name: "Spring Onion Bunch", price: 25, unit: "bunch" },
    ],
  },
  // 3. Fruits
  {
    category: "Fruits",
    unit: "kg",
    items: [
      { name: "Shimla Royal Delicious Apple", price: 180 },
      { name: "Washington Red Apple", price: 220 },
      { name: "Kashmir Green Apple", price: 195 },
      { name: "Fuji Sweet Apple", price: 210 },
      { name: "Robusta Yellow Banana", price: 48 },
      { name: "Red Banana (Sevvazhai)", price: 85 },
      { name: "Yellaki Banana (Elaichi)", price: 72 },
      { name: "Poovan Banana", price: 50 },
      { name: "Rasthali Sweet Banana", price: 65 },
      { name: "Nagpur Sweet Orange", price: 80 },
      { name: "Kashmir Pomegranate (Madulai)", price: 160 },
      { name: "Arakta Deep Red Pomegranate", price: 190 },
      { name: "Seedless Green Grapes (Sonaka)", price: 95 },
      { name: "Seedless Black Grapes (Sharad)", price: 120 },
      { name: "Red Globe Imported Grapes", price: 180 },
      { name: "Honey Sweet Papaya", price: 40 },
      { name: "Red Lady Sweet Papaya", price: 45 },
      { name: "Alphonso Mango (Hapus)", price: 280 },
      { name: "Banganapalli Sweet Mango", price: 120 },
      { name: "Imam Pasand Royal Mango", price: 260 },
      { name: "Totapuri Tangy Mango", price: 65 },
      { name: "Malgova Sweet Mango", price: 190 },
      { name: "Allahabad White Guava", price: 60 },
      { name: "Taiwan Pink Guava", price: 85 },
      { name: "Sweet Watermelon (Tharpoosani)", price: 28 },
      { name: "Kiran Striped Watermelon", price: 32 },
      { name: "Kasturi Sweet Muskmelon", price: 42 },
      { name: "Kinnellu Muskmelon", price: 46 },
      { name: "Juicy Queen Pineapple", price: 55, unit: "piece" },
      { name: "Mosambi Sweet Lime", price: 75 },
      { name: "Fresh Green Kiwi Fruit", price: 35, unit: "piece" },
      { name: "Imported Gold Kiwi Fruit", price: 50, unit: "piece" },
      { name: "Thai Dragon Fruit (Red Flesh)", price: 95, unit: "piece" },
      { name: "White Flesh Dragon Fruit", price: 75, unit: "piece" },
      { name: "Fresh Avocado (Butter Fruit)", price: 140 },
      { name: "Sweet Brown Sapota (Chikoo)", price: 58 },
      { name: "Cricket Ball Large Sapota", price: 65 },
      { name: "Fresh Indian Custard Apple (Seetha Pazham)", price: 110 },
      { name: "Fresh Fig (Athi Pazham)", price: 160, unit: "packet" },
      { name: "Fresh Blueberries Cup (125g)", price: 180, unit: "packet" },
    ],
  },
  // 4. Groceries & Staples
  {
    category: "Groceries",
    unit: "kg",
    items: [
      { name: "Ponni Boiled Rice (Deluxe 5kg)", price: 310, unit: "packet" },
      { name: "Sona Masoori Raw Rice (5kg)", price: 295, unit: "packet" },
      { name: "Daawat Rozana Basmati Rice (1kg)", price: 95, unit: "packet" },
      { name: "India Gate Feast Basmati Rice (1kg)", price: 135, unit: "packet" },
      { name: "Fortune Biryani Special Basmati Rice", price: 145, unit: "packet" },
      { name: "Aashirvaad Shudh Chakki Atta (5kg)", price: 245, unit: "packet" },
      { name: "Aashirvaad Select Sharbati Atta (5kg)", price: 315, unit: "packet" },
      { name: "Pillsbury Chakki Fresh Atta (5kg)", price: 240, unit: "packet" },
      { name: "Tata Sampann Toor Dal Unpolished", price: 165 },
      { name: "Premium Country Toor Dal", price: 155 },
      { name: "Tata Sampann Moong Dal Yellow", price: 135 },
      { name: "Whole Green Moong Dal", price: 125 },
      { name: "Tata Sampann Urad Dal Gota (Whole White)", price: 145 },
      { name: "Split Black Urad Dal (Chilka)", price: 130 },
      { name: "Premium Chana Dal", price: 92 },
      { name: "White Kabuli Chana (Garbanzo)", price: 140 },
      { name: "Brown Desi Chana (Kala Chana)", price: 88 },
      { name: "Red Rajma Jammu Special", price: 155 },
      { name: "Chitra Kidney Beans (Rajma)", price: 145 },
      { name: "Fried Gram (Pottukadalai)", price: 110 },
      { name: "Pure Refined Sugar (Sakarai 1kg)", price: 46, unit: "packet" },
      { name: "Country Brown Sugar (Nattu Sakkarai)", price: 78, unit: "packet" },
      { name: "Round Jaggery Balls (Mandai Vellam)", price: 68 },
      { name: "Tata Salt Vacuum Evaporated (1kg)", price: 28, unit: "packet" },
      { name: "Tata Rock Salt (Sendha Namak)", price: 40, unit: "packet" },
      { name: "Crystal Sea Salt (Kal Uppu 1kg)", price: 18, unit: "packet" },
      { name: "Gold Winner Sunflower Oil (1L Pouch)", price: 132, unit: "packet" },
      { name: "Fortune Sunlite Sunflower Oil (1L)", price: 130, unit: "packet" },
      { name: "Idhayam Sesame Gingelly Oil (500ml)", price: 195, unit: "packet" },
      { name: "Anandhi Cold Pressed Groundnut Oil (1L)", price: 210, unit: "packet" },
      { name: "Parachute 100% Pure Coconut Oil (500ml)", price: 165, unit: "packet" },
      { name: "KLF Coconad Pure Coconut Oil (1L)", price: 280, unit: "packet" },
      { name: "GRB Pure Ghee Jar (200ml)", price: 175, unit: "piece" },
      { name: "Aavin Premium Cow Ghee (500ml)", price: 340, unit: "piece" },
      { name: "Nandini Pure Cow Ghee (500ml)", price: 330, unit: "piece" },
      { name: "Aachi Sambar Powder (100g)", price: 36, unit: "packet" },
      { name: "Aachi Rasam Powder (100g)", price: 38, unit: "packet" },
      { name: "Aachi Kulambu Chilli Powder (200g)", price: 62, unit: "packet" },
      { name: "Everest Red Chilli Powder (100g)", price: 45, unit: "packet" },
      { name: "Tata Sampann Turmeric Powder (100g)", price: 34, unit: "packet" },
      { name: "Everest Coriander Powder (100g)", price: 32, unit: "packet" },
      { name: "Aachi Garam Masala (50g)", price: 28, unit: "packet" },
      { name: "Catch Black Pepper Powder (50g)", price: 68, unit: "packet" },
      { name: "Whole Cumin Seeds (Jeeragam 100g)", price: 42, unit: "packet" },
      { name: "Mustard Seeds (Kadugu 100g)", price: 20, unit: "packet" },
      { name: "Fenugreek Seeds (Vendhayam 100g)", price: 18, unit: "packet" },
      { name: "Fennel Seeds (Sombu 100g)", price: 26, unit: "packet" },
      { name: "Green Cardamom (Elakkai 25g)", price: 95, unit: "packet" },
      { name: "Cloves (Lavangam 50g)", price: 72, unit: "packet" },
      { name: "Cinnamon Sticks (Pattai 50g)", price: 48, unit: "packet" },
      { name: "Star Anise (Muku 50g)", price: 58, unit: "packet" },
      { name: "Bay Leaves (Biryani Ilai 20g)", price: 15, unit: "packet" },
      { name: "Kashmiri Dry Red Chilli (100g)", price: 65, unit: "packet" },
      { name: "Guntur Hot Dry Chilli (100g)", price: 48, unit: "packet" },
      { name: "Tamarind Seedless (Puli 500g)", price: 92, unit: "packet" },
      { name: "LG Compounded Asafoetida Powder (50g)", price: 48, unit: "piece" },
      { name: "MTR Ready Vermicelli (Semiya 400g)", price: 36, unit: "packet" },
      { name: "Anandhi Roasted Rava / Sooji (500g)", price: 42, unit: "packet" },
      { name: "Naga Maida Wheat Flour (500g)", price: 32, unit: "packet" },
      { name: "Rice Flour / Idiyappam Mavu (500g)", price: 38, unit: "packet" },
      { name: "Ragi Finger Millet Flour (500g)", price: 35, unit: "packet" },
      { name: "Bajra Pearl Millet Flour (500g)", price: 36, unit: "packet" },
      { name: "Quaker Rolled Oats (1kg Pouch)", price: 175, unit: "packet" },
      { name: "Kellogg's Real Almond Corn Flakes (475g)", price: 220, unit: "packet" },
      { name: "Sago Pearls (Javvarisi 250g)", price: 32, unit: "packet" },
    ],
  },
  // 5. Dairy
  {
    category: "Dairy",
    unit: "packet",
    items: [
      { name: "Aavin Toned Milk Green (500ml)", price: 22 },
      { name: "Aavin Full Cream Milk Orange (500ml)", price: 30 },
      { name: "Aavin Standardized Milk Blue (500ml)", price: 24 },
      { name: "Amul Taaza Homogenised Toned Milk (1L)", price: 74 },
      { name: "Amul Gold Full Cream Milk (1L)", price: 82 },
      { name: "Milky Mist Fresh Curd Cup (400g)", price: 42 },
      { name: "Aavin Premium Thick Curd Pouch (500g)", price: 32 },
      { name: "Amul Masti Dahi Pouch (400g)", price: 35 },
      { name: "Milky Mist Malai Paneer Pack (200g)", price: 105 },
      { name: "Amul Fresh Paneer Cube (200g)", price: 98 },
      { name: "Amul Salted Table Butter (100g)", price: 58 },
      { name: "Amul Unsalted Butter (100g)", price: 60 },
      { name: "Milky Mist Cooking Butter (200g)", price: 120 },
      { name: "Britannia Cheese Slices (10 Slices 200g)", price: 145 },
      { name: "Amul Processed Cheese Block (200g)", price: 135 },
      { name: "Amul Mozzarella Pizza Cheese (200g)", price: 140 },
      { name: "Milky Mist Greek Yogurt Blueberry (100g)", price: 45 },
      { name: "Epigamia Natural Greek Yogurt (85g)", price: 40 },
      { name: "Mother Dairy Fresh Sweetened Lassi (200ml)", price: 25 },
      { name: "Amul Kool Kesar Badam Milk Can (180ml)", price: 35 },
      { name: "Cavins Chocolate Milkshake (180ml)", price: 35 },
      { name: "Cavins Strawberry Milkshake (180ml)", price: 35 },
      { name: "Cavins Vanilla Milkshake (180ml)", price: 35 },
      { name: "Farm Fresh Brown Country Eggs (6 Pack)", price: 65 },
      { name: "Fresh White Table Eggs (6 Pack)", price: 42 },
      { name: "Fresh White Table Eggs (12 Pack Tray)", price: 82 },
      { name: "Fresh White Table Eggs (30 Pack Crate)", price: 195 },
      { name: "Modern White Sandwich Bread (400g)", price: 38 },
      { name: "Britannia 100% Whole Wheat Bread (400g)", price: 45 },
      { name: "English Oven Multigrain Bread (400g)", price: 55 },
    ],
  },
  // 6. Snacks & Packaged Foods
  {
    category: "Snacks",
    unit: "packet",
    items: [
      { name: "Parle-G Original Glucose Biscuits (250g)", price: 25 },
      { name: "Britannia Good Day Butter Biscuits (200g)", price: 35 },
      { name: "Britannia Good Day Cashew Cookies (200g)", price: 40 },
      { name: "Britannia Bourbon Chocolate Cream (150g)", price: 30 },
      { name: "Oreo Original Vanilla Creme Cookies (120g)", price: 35 },
      { name: "Sunfeast Dark Fantasy Choco Fills (75g)", price: 40 },
      { name: "Britannia Marie Gold Biscuits (300g)", price: 38 },
      { name: "Sunfeast Farmlite Digestive Oats (150g)", price: 45 },
      { name: "Britannia Milk Bikis Cream Biscuits (100g)", price: 20 },
      { name: "Unibic Choco Chip Cookies (150g)", price: 50 },
      { name: "Lay's Classic Salted Potato Chips (50g)", price: 20 },
      { name: "Lay's Magic Masala Chips (50g)", price: 20 },
      { name: "Lay's Spanish Tomato Tango Chips (50g)", price: 20 },
      { name: "Kurkure Masala Munch Crunchy Snack (90g)", price: 20 },
      { name: "Kurkure Chilli Chatka (90g)", price: 20 },
      { name: "Bingo Mad Angles Achaari Masti (66g)", price: 20 },
      { name: "Haldiram's Nagpur Bhujia Sev (150g)", price: 48 },
      { name: "Haldiram's All in One Mixture (150g)", price: 50 },
      { name: "Grand Sweets Chennai Mixture (200g)", price: 85 },
      { name: "Anandhi Butter Murukku Crunchy (200g)", price: 65 },
      { name: "Anandhi Ribbon Pakoda (200g)", price: 65 },
      { name: "Anandhi Thattai Spicy Crackers (200g)", price: 60 },
      { name: "Anandhi Seedai Traditional Snacks (150g)", price: 55 },
      { name: "Haldiram's Salted Roasted Cashews (100g)", price: 140 },
      { name: "Haldiram's Roasted Salted Almonds (100g)", price: 135 },
      { name: "Maggi 2-Minute Masala Noodles (Pack of 4)", price: 56 },
      { name: "Yippee! Magic Masala Noodles (Pack of 4)", price: 54 },
      { name: "Ching's Secret Schezwan Hakka Noodles", price: 42 },
      { name: "Knorr Classic Sweet Corn Chicken Soup", price: 60 },
      { name: "Knorr Thick Tomato Soup Mix", price: 55 },
      { name: "Act II Instant Butter Popcorn (70g)", price: 35 },
      { name: "Act II Golden Sizzle Popcorn (70g)", price: 35 },
    ],
  },
  // 7. Beverages
  {
    category: "Beverages",
    unit: "packet",
    items: [
      { name: "AVT Premium Dust Strong Tea (500g)", price: 185 },
      { name: "3 Roses Dust Tea Powder (250g)", price: 155 },
      { name: "Tata Tea Gold Fine Blend (250g)", price: 145 },
      { name: "Red Label Strong Tea Leaf (500g)", price: 230 },
      { name: "Wagh Bakri Premium CTC Tea (500g)", price: 210 },
      { name: "Bru Instant Coffee Jar (100g)", price: 195, unit: "piece" },
      { name: "Nescafe Classic Pure Coffee Jar (100g)", price: 210, unit: "piece" },
      { name: "Narasu's Udhayam Filter Coffee (500g)", price: 245 },
      { name: "Cothas Filter Coffee Blend (500g)", price: 265 },
      { name: "Bru Green Label Filter Coffee (200g)", price: 92 },
      { name: "Horlicks Health Drink Malt Pouch (500g)", price: 240 },
      { name: "Boost Energy Drink Refill Pack (500g)", price: 255 },
      { name: "Bournvita Cadbury Chocolate Drink (500g)", price: 235 },
      { name: "Complan Royal Chocolate Health Drink (500g)", price: 275 },
      { name: "Tropicana 100% Orange Juice (1L)", price: 125, unit: "piece" },
      { name: "Real Fruit Power Mixed Fruit Juice (1L)", price: 115, unit: "piece" },
      { name: "Real Fruit Power Guava Juice (1L)", price: 115, unit: "piece" },
      { name: "Maaza Mango Pulp Drink Bottle (1.2L)", price: 65, unit: "piece" },
      { name: "Frooti Fresh 'N' Juicy Mango (1L)", price: 60, unit: "piece" },
      { name: "Paper Boat Aamras Mango Juice (250ml)", price: 35, unit: "piece" },
      { name: "Paper Boat Jaljeera Tangy Drink (250ml)", price: 35, unit: "piece" },
      { name: "Coca Cola Chilled Bottle (750ml)", price: 40, unit: "piece" },
      { name: "Thums Up Toofani Soda (750ml)", price: 40, unit: "piece" },
      { name: "Sprite Refreshing Lime Drink (750ml)", price: 40, unit: "piece" },
      { name: "Kinley Club Soda Bottle (750ml)", price: 20, unit: "piece" },
    ],
  },
  // 8. Household & Personal Care
  {
    category: "Household",
    unit: "piece",
    items: [
      { name: "Surf Excel Easy Wash Detergent Powder (1kg)", price: 142, unit: "packet" },
      { name: "Surf Excel Matic Front Load Liquid (1L)", price: 230 },
      { name: "Ariel Complete Washing Powder (1kg)", price: 155, unit: "packet" },
      { name: "Tide Plus Double Power Jasmine (1kg)", price: 110, unit: "packet" },
      { name: "Rin Advanced Detergent Bar Soap (250g)", price: 25 },
      { name: "Vim Lemon Dishwash Gel Pouch (500ml)", price: 105 },
      { name: "Vim Dishwash Lemon Bar Soap (300g)", price: 32 },
      { name: "Pril Lime Active Dishwash Liquid (425ml)", price: 115 },
      { name: "Lizol Disinfectant Floor Cleaner Citrus (1L)", price: 195 },
      { name: "Colin Glass and Surface Cleaner Spray (500ml)", price: 108 },
      { name: "Harpic Power Plus Toilet Cleaner Blue (1L)", price: 185 },
      { name: "Comfort After Wash Fabric Conditioner (860ml)", price: 220 },
      { name: "Dettol Antiseptic Liquid Bottle (500ml)", price: 180 },
      { name: "Dettol Original Germ Protection Soap (125g)", price: 48 },
      { name: "Lifebuoy Total Germ Protection Soap (125g)", price: 38 },
      { name: "Hamam Neem and Tulsi Ayurvedic Soap (100g)", price: 36 },
      { name: "Medimix Ayurvedic 18 Herbs Soap (125g)", price: 45 },
      { name: "Dove Cream Beauty Bathing Bar (100g)", price: 68 },
      { name: "Pears Pure & Gentle Glycerine Soap (125g)", price: 72 },
      { name: "Colgate Strong Teeth Toothpaste (200g)", price: 115 },
      { name: "Close Up Red Hot Gel Toothpaste (150g)", price: 105 },
      { name: "Sensodyne Fresh Mint Sensitivity Paste (100g)", price: 195 },
      { name: "Dabur Red Ayurvedic Toothpaste (200g)", price: 120 },
      { name: "Oral-B Shiny Clean Medium Toothbrush (Buy 2 Get 1)", price: 65, unit: "packet" },
      { name: "Head & Shoulders Cool Menthol Shampoo (340ml)", price: 285 },
      { name: "Clinic Plus Strong & Long Health Shampoo (340ml)", price: 195 },
      { name: "Dove Intense Repair Hair Shampoo (340ml)", price: 295 },
      { name: "Parachute Advanced Aloe Vera Hair Oil (250ml)", price: 125 },
      { name: "Dabur Amla Nourishing Hair Oil (275ml)", price: 140 },
      { name: "Godrej Good Knight Gold Flash Machine + Refill", price: 110 },
      { name: "All Out Ultra Mosquito Repellent Refill (Twin Pack)", price: 155, unit: "packet" },
      { name: "Odonil Room Air Freshener Lavender Block (50g)", price: 58 },
      { name: "Gala Dustpan with Hand Broom Cleaning Set", price: 160 },
      { name: "Scotch-Brite Heavy Duty Kitchen Scrub Sponge (Pack of 3)", price: 75, unit: "packet" },
      { name: "Origami Soft 2-Ply Facial Tissues (Box of 100)", price: 75, unit: "box" },
      { name: "Anandhi Heavy Duty Garbage Trash Bags (30 Bags)", price: 95, unit: "packet" },
    ],
  },
];

// Helper to expand catalog into exactly 500 unique products
function generate500Products() {
  const allGenerated = [];
  const nameSet = new Set();
  let count = 0;

  // Flatten templates
  for (const group of CATALOG_TEMPLATES) {
    for (const item of group.items) {
      if (allGenerated.length >= 500) break;
      const baseName = item.name;
      if (!nameSet.has(baseName)) {
        nameSet.add(baseName);
        count++;
        allGenerated.push({
          id: `item_gen_${String(count).padStart(3, "0")}`,
          name: baseName,
          category: group.category,
          price: item.price,
          unit: item.unit || group.unit || "kg",
          inStock: count % 22 !== 0, // ~4.5% out-of-stock items to test out-of-stock sorting
          sortOrder: count,
          isDeleted: false,
          isSeeded: true,
          // Staggered timestamps over the past 30 days
          daysAgo: (count % 30) + 1,
        });
      }
    }
  }

  // Now create variations with pack sizes / brands to reach exactly 500
  const packVariants = [
    { suffix: "Value Pack", priceMult: 1.8, unitOverride: null },
    { suffix: "Economy Family Pack", priceMult: 2.7, unitOverride: null },
    { suffix: "Trial Mini Pack", priceMult: 0.55, unitOverride: null },
    { suffix: "Jumbo Saver", priceMult: 3.4, unitOverride: null },
    { suffix: "Combo Twin Pack", priceMult: 1.9, unitOverride: "pack" },
  ];

  let variantIndex = 0;
  while (allGenerated.length < 500) {
    const sourceItem = allGenerated[variantIndex % allGenerated.length];
    const variant = packVariants[variantIndex % packVariants.length];
    const newName = `${sourceItem.name} (${variant.suffix})`;

    if (!nameSet.has(newName)) {
      nameSet.add(newName);
      count++;
      const adjustedPrice = Math.max(15, Math.round(sourceItem.price * variant.priceMult));
      allGenerated.push({
        id: `item_gen_${String(count).padStart(3, "0")}`,
        name: newName,
        category: sourceItem.category,
        price: adjustedPrice,
        unit: variant.unitOverride || sourceItem.unit,
        inStock: count % 19 !== 0,
        sortOrder: count,
        isDeleted: false,
        isSeeded: true,
        daysAgo: (count % 30) + 1,
      });
    }
    variantIndex++;
  }

  return allGenerated.slice(0, 500);
}

const { execSync } = require("child_process");

// Helper to obtain fresh OAuth access token from gcloud
function getAccessToken() {
  try {
    return execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim();
  } catch (err) {
    console.error("Failed to get gcloud access token:", err.message);
    process.exit(1);
  }
}

async function seedProducts() {
  console.log("🔑 Fetching Google Cloud OAuth token for anandhi-stores...");
  const token = getAccessToken();
  console.log("Token obtained successfully.");

  console.log("🌱 Generating 500 unique realistic products...");
  const products = generate500Products();
  console.log(`Generated ${products.length} products across ${CATALOG_TEMPLATES.length} categories.`);

  const BATCH_SIZE = 100; // 100 per batch for safe HTTP payload size
  const nowMs = Date.now();

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const chunk = products.slice(i, i + BATCH_SIZE);
    const writes = chunk.map(p => {
      const pastIso = new Date(nowMs - p.daysAgo * 24 * 60 * 60 * 1000).toISOString();
      return {
        update: {
          name: `projects/anandhi-stores/databases/(default)/documents/items/${p.id}`,
          fields: {
            name: { stringValue: p.name },
            category: { stringValue: p.category },
            price: { doubleValue: Number(p.price) },
            unit: { stringValue: p.unit },
            inStock: { booleanValue: p.inStock },
            sortOrder: { integerValue: String(p.sortOrder) },
            isDeleted: { booleanValue: false },
            isSeeded: { booleanValue: true },
            createdAt: { timestampValue: pastIso },
            updatedAt: { timestampValue: pastIso },
          },
        },
      };
    });

    console.log(`Writing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(products.length / BATCH_SIZE)} (${chunk.length} items)...`);

    const res = await fetch(
      "https://firestore.googleapis.com/v1/projects/anandhi-stores/databases/(default)/documents:commit",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ writes }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Firestore REST error ${res.status}: ${errText}`);
    }
  }

  console.log("✅ Successfully seeded 500 unique products into Firestore!");
  process.exit(0);
}

seedProducts().catch((err) => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
