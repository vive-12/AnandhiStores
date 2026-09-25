const db = require('../db/schema');

function checkEmptyCans() {
  console.log(`[EmptyCanChecker] ${new Date().toLocaleString()} — scanning...`);
  const { urgent } = db.getEmptyCanAlerts();
  if (urgent.length === 0) {
    console.log('[EmptyCanChecker] No overdue empty cans.');
    return;
  }
  urgent.forEach(o => {
    console.log(`[EmptyCanChecker] ⚠️  Order #${o.id} — ${o.customer_name} (${o.customer_phone}) — ${o.days_since_delivery} days overdue`);
  });
  console.log(`[EmptyCanChecker] ${urgent.length} alert(s) flagged for admin.`);
}

checkEmptyCans();
setInterval(checkEmptyCans, 60 * 60 * 1000);

module.exports = { checkEmptyCans };
