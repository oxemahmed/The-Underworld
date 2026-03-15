const { Pool } = require('pg');

const connectionString = 'postgresql://neondb_owner:npg_ZbFYi7RvVq5W@ep-lingering-bird-ab1zppu4-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false // ضروري للاتصال عبر SSL
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};