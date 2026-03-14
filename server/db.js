const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',          // اسم مستخدم قاعدة البيانات
  host: 'localhost',         // عنوان الخادم
  database: 'underworld_db', // اسم قاعدة البيانات
  password: 'i2',            // كلمة المرور التي حددتها
  port: 5432,                // منفذ PostgreSQL الافتراضي
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};