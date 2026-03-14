const db = require('./db.js');

async function testConnection() {
  try {
    const result = await db.query('SELECT NOW()');
    console.log('✅ Connected to database. Server time:', result.rows[0].now);
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
  }
}

testConnection();