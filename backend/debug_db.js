const { initDatabase, getPool } = require('./config/db');

async function test() {
  await initDatabase();
  const pool = getPool();
  const [contacts] = await pool.query('SELECT * FROM contacts');
  console.log('CONTACTS IN STORE:', JSON.stringify(contacts, null, 2));
}

test().catch(console.error);
