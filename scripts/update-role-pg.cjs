const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function main() {
  try {
    const res = await pool.query(`
      UPDATE users 
      SET role_id = (SELECT id FROM roles WHERE upper(name) = 'DIRECTOR' LIMIT 1) 
      WHERE email = 'apexdigital70@gmail.com'
      RETURNING id, email, role_id;
    `);
    console.log('Update result:', res.rows);
  } catch (err) {
    console.error('Error updating DB:', err);
  } finally {
    await pool.end();
  }
}

main();
