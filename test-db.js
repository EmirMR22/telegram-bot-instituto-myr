require('dotenv').config();
const db = require('./db');

(async () => {
  try {
    const [rows] = await db.query('SELECT COUNT(*) total FROM usuarios');
    console.log('✅ DB conectada, usuarios:', rows[0].total);
  } catch (err) {
    console.error('❌ Error DB:', err.message);
  }
})();
