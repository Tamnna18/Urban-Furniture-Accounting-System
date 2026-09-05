const { initDatabase, getPool } = require('./config/db');

async function test() {
  const pool = await initDatabase();
  const [contacts] = await pool.query('SELECT * FROM contacts');
  console.log('TEST CONTACTS COUNT:', contacts.length);
  console.log('TEST CONTACTS:', contacts);
}

test();
