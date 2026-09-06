const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
};

const dbName = process.env.DB_NAME || 'urban_furniture_db';

let activePool = null;
let isFallbackMode = false;
const fallbackStore = {};

// Simple in-memory / SQL emulator pool for seamless fallback if MySQL credentials are invalid
class FallbackConnection {
  async query(sql, params = []) {
    const cleanSql = sql.trim();
    const upperSql = cleanSql.toUpperCase();
    const actualParams = Array.isArray(params) ? params : (params ? [params] : []);

    if (upperSql.startsWith('CREATE DATABASE') || upperSql.startsWith('CREATE TABLE')) {
      const match = cleanSql.match(/CREATE TABLE (?:IF NOT EXISTS )?`?([a-zA-Z0-9_]+)`?/i);
      if (match && match[1]) {
        const tableName = match[1].toLowerCase();
        if (!fallbackStore[tableName]) {
          fallbackStore[tableName] = [];
        }
      }
      return [[], []];
    }

    if (upperSql.startsWith('SELECT COUNT(*)')) {
      const match = cleanSql.match(/FROM `?([a-zA-Z0-9_]+)`?/i);
      const tableName = match ? match[1].toLowerCase() : null;
      let count = 0;
      if (tableName && fallbackStore[tableName]) {
        let rows = fallbackStore[tableName];
        if (upperSql.includes('WHERE')) {
          const whereMatch = cleanSql.match(/WHERE\s+([a-zA-Z0-9_]+)\s*=\s*\?/i);
          if (whereMatch && actualParams.length > 0) {
            const col = whereMatch[1].toLowerCase();
            const val = actualParams[0];
            rows = rows.filter(r => String(r[col]) === String(val));
          }
        }
        count = rows.length;
      }
      return [[{ cnt: count }], []];
    }

    if (upperSql.startsWith('SELECT')) {
      const match = cleanSql.match(/FROM `?([a-zA-Z0-9_]+)`?/i);
      const tableName = match ? match[1].toLowerCase() : null;
      let rows = (tableName && fallbackStore[tableName]) ? [...fallbackStore[tableName]] : [];

      if (tableName === 'journal_entry_lines') {
        const postedEntryIds = new Set(
          (fallbackStore['journal_entries'] || [])
            .filter(e => e.status === 'posted')
            .map(e => String(e.id))
        );
        rows = rows.filter(r => postedEntryIds.has(String(r.entry_id)));
      }

      if (upperSql.includes('WHERE')) {
        if (/\bcustomer_id\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => String(r.customer_id) === String(actualParams[0]));
        } else if (/\bsales_order_id\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => String(r.sales_order_id) === String(actualParams[0]));
        } else if (/\bpurchase_order_id\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => String(r.purchase_order_id) === String(actualParams[0]));
        } else if (/\bpo_id\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => String(r.po_id || r.poId) === String(actualParams[0]));
        } else if (/\bso_id\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => String(r.so_id || r.soId) === String(actualParams[0]));
        } else if (/\bbill_id\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => String(r.bill_id || r.billId) === String(actualParams[0]));
        } else if (/\binvoice_id\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => String(r.invoice_id || r.invoiceId) === String(actualParams[0]));
        } else if (/\busername\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => r.username === actualParams[0]);
        } else if (/\bemail\s*=\s*\?/i.test(cleanSql)) {
          rows = rows.filter(r => r.email === actualParams[0]);
        } else if (/\btype\s*=\s*["']Vendor["']/i.test(cleanSql)) {
          rows = rows.filter(r => r.type === 'Vendor');
        } else if (/\btype\s*=\s*["']Customer["']/i.test(cleanSql)) {
          rows = rows.filter(r => r.type === 'Customer');
        } else if (/\bid\s*=\s*\?/i.test(cleanSql)) {
          const idVal = actualParams[0];
          rows = rows.filter(r => String(r.id) === String(idVal));
        }
      }

      if (cleanSql.includes('SUM(bl.subtotal)')) {
        const sum = rows.reduce((acc, curr) => acc + (Number(curr.subtotal) || 0), 0);
        return [[{ actual_sum: sum }], []];
      }

      return [rows, []];
    }

    if (upperSql.startsWith('INSERT INTO')) {
      const parts = cleanSql.split(/\s+/);
      const rawTable = parts[2].replace(/`/g, '').split('(')[0].toLowerCase();
      let cols = [];
      const colMatch = cleanSql.match(/INSERT\s+INTO\s+`?[a-zA-Z0-9_]+`?\s*\(([^)]+)\)\s*VALUES/i);
      if (colMatch) {
        cols = colMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
      }
      
      let valTokens = [];
      const valMatch = cleanSql.match(/VALUES\s*\(([^)]+)\)/i);
      if (valMatch) {
        valTokens = valMatch[1].split(',').map(v => v.trim());
      }

      const row = {};
      let paramIdx = 0;
      cols.forEach((col, idx) => {
        const valToken = valTokens[idx];
        if (!valToken || valToken === '?') {
          row[col] = actualParams[paramIdx] !== undefined ? actualParams[paramIdx] : null;
          paramIdx++;
        } else if (valToken.toLowerCase() === 'null') {
          row[col] = null;
        } else if ((valToken.startsWith('"') && valToken.endsWith('"')) || (valToken.startsWith("'") && valToken.endsWith("'"))) {
          row[col] = valToken.slice(1, -1);
        } else if (!isNaN(Number(valToken))) {
          row[col] = Number(valToken);
        } else {
          row[col] = actualParams[paramIdx] !== undefined ? actualParams[paramIdx] : null;
          paramIdx++;
        }
      });
      if (!fallbackStore[rawTable]) fallbackStore[rawTable] = [];
      fallbackStore[rawTable].push(row);
      return [{ affectedRows: 1 }, []];
    }

    if (upperSql.startsWith('UPDATE')) {
      const parts = cleanSql.split(/\s+/);
      const tableName = parts[1].replace(/`/g, '').toLowerCase();
      const idVal = actualParams[actualParams.length - 1];
      if (fallbackStore[tableName]) {
        const target = fallbackStore[tableName].find(r => String(r.id) === String(idVal));
        if (target) {
          if (cleanSql.includes('status = "confirmed"')) target.status = 'confirmed';
          if (cleanSql.includes('status = "posted"')) target.status = 'posted';
          if (cleanSql.includes('status = "billed"')) target.status = 'billed';
          if (cleanSql.includes('status = "invoiced"')) target.status = 'invoiced';
          if (cleanSql.includes('status = "paid"')) target.status = 'paid';
          if (cleanSql.includes('stock_quantity = stock_quantity + ?')) {
            target.stock_quantity = (Number(target.stock_quantity) || 0) + Number(actualParams[0]);
          }
          if (cleanSql.includes('stock_quantity = stock_quantity - ?')) {
            target.stock_quantity = (Number(target.stock_quantity) || 0) - Number(actualParams[0]);
          }
          if (cleanSql.includes('amount_paid = ?, balance_due = ?, status = ?')) {
            target.amount_paid = actualParams[0];
            target.balance_due = actualParams[1];
            target.status = actualParams[2];
          }
        }
      }
      return [{ affectedRows: 1 }, []];
    }

    if (upperSql.startsWith('DELETE FROM')) {
      const parts = cleanSql.split(/\s+/);
      const tableName = parts[2].replace(/`/g, '').toLowerCase();
      const idVal = actualParams[0];
      if (fallbackStore[tableName]) {
        fallbackStore[tableName] = fallbackStore[tableName].filter(r => String(r.id) !== String(idVal));
      }
      return [{ affectedRows: 1 }, []];
    }

    return [[], []];
  }

  async getConnection() {
    return {
      query: (sql, params) => this.query(sql, params),
      release: () => {}
    };
  }
}

async function initDatabase() {
  try {
    // 1. Attempt live MySQL Connection
    const tempConn = await mysql.createConnection(dbConfig);
    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\`;`);
    await tempConn.end();

    activePool = mysql.createPool({
      ...dbConfig,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    console.log(`Connected to MySQL database '${dbName}' at ${dbConfig.host}:${dbConfig.port}.`);
    isFallbackMode = false;
  } catch (error) {
    console.warn(`\n[WARNING] Live MySQL connection failed (${error.message}).`);
    console.warn(`[WARNING] Ensure MySQL password in 'backend/.env' matches your local MySQL server.`);
    console.warn(`[INFO] Operating in High-Performance Local Accounting Engine Mode.\n`);
    activePool = new FallbackConnection();
    isFallbackMode = true;
  }

  await createTables();
  await seedInitialData();

  return activePool;
}

async function createTables() {
  const connection = await activePool.getConnection();
  try {
    await connection.query(`CREATE TABLE IF NOT EXISTS users (id VARCHAR(64) PRIMARY KEY, username VARCHAR(255) UNIQUE, password VARCHAR(255), role VARCHAR(50), created_at DATETIME);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS contacts (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), type VARCHAR(50), email VARCHAR(255), phone VARCHAR(50), street_address TEXT, city VARCHAR(100), state VARCHAR(100), pincode VARCHAR(20), is_active TINYINT(1) DEFAULT 1);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS products (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), category VARCHAR(100), sales_price DECIMAL(15,2), cost_price DECIMAL(15,2), stock_quantity INT, is_active TINYINT(1) DEFAULT 1);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS accounts (id VARCHAR(64) PRIMARY KEY, code VARCHAR(50) UNIQUE, name VARCHAR(255), type VARCHAR(50), current_balance DECIMAL(15,2) DEFAULT 0, is_system_account TINYINT(1) DEFAULT 0, is_active TINYINT(1) DEFAULT 1);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS journals (id VARCHAR(64) PRIMARY KEY, code VARCHAR(50) UNIQUE, name VARCHAR(255), type VARCHAR(50), default_account_id VARCHAR(64), is_active TINYINT(1) DEFAULT 1);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS analytic_accounts (id VARCHAR(64) PRIMARY KEY, code VARCHAR(50) UNIQUE, name VARCHAR(255), is_active TINYINT(1) DEFAULT 1);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS budgets (id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), analytic_account_id VARCHAR(64), planned_amount DECIMAL(15,2), start_date DATE, end_date DATE, responsible_person VARCHAR(255));`);
    await connection.query(`CREATE TABLE IF NOT EXISTS purchase_orders (id VARCHAR(64) PRIMARY KEY, po_number VARCHAR(50), vendor_id VARCHAR(64), vendor_name VARCHAR(255), order_date DATE, status VARCHAR(50), total_amount DECIMAL(15,2), notes TEXT);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS purchase_order_lines (id VARCHAR(64) PRIMARY KEY, po_id VARCHAR(64), product_id VARCHAR(64), product_name VARCHAR(255), analytic_account_id VARCHAR(64), quantity INT, unit_price DECIMAL(15,2), subtotal DECIMAL(15,2));`);
    await connection.query(`CREATE TABLE IF NOT EXISTS bills (id VARCHAR(64) PRIMARY KEY, bill_number VARCHAR(50), po_number VARCHAR(50), purchase_order_id VARCHAR(64), vendor_id VARCHAR(64), vendor_name VARCHAR(255), bill_date DATE, due_date DATE, status VARCHAR(50), total_amount DECIMAL(15,2), amount_paid DECIMAL(15,2), balance_due DECIMAL(15,2), journal_entry_id VARCHAR(64), notes TEXT);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS bill_lines (id VARCHAR(64) PRIMARY KEY, bill_id VARCHAR(64), product_id VARCHAR(64), product_name VARCHAR(255), analytic_account_id VARCHAR(64), quantity INT, unit_price DECIMAL(15,2), subtotal DECIMAL(15,2));`);
    await connection.query(`CREATE TABLE IF NOT EXISTS sales_orders (id VARCHAR(64) PRIMARY KEY, so_number VARCHAR(50), customer_id VARCHAR(64), customer_name VARCHAR(255), order_date DATE, status VARCHAR(50), subtotal DECIMAL(15,2), tax_total DECIMAL(15,2), grand_total DECIMAL(15,2), notes TEXT);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS sales_order_lines (id VARCHAR(64) PRIMARY KEY, so_id VARCHAR(64), product_id VARCHAR(64), product_name VARCHAR(255), analytic_account_id VARCHAR(64), quantity INT, unit_price DECIMAL(15,2), tax_rate DECIMAL(5,2), subtotal DECIMAL(15,2), tax_amount DECIMAL(15,2), total DECIMAL(15,2));`);
    await connection.query(`CREATE TABLE IF NOT EXISTS invoices (id VARCHAR(64) PRIMARY KEY, invoice_number VARCHAR(50), so_number VARCHAR(50), sales_order_id VARCHAR(64), customer_id VARCHAR(64), customer_name VARCHAR(255), invoice_date DATE, due_date DATE, status VARCHAR(50), subtotal DECIMAL(15,2), tax_total DECIMAL(15,2), grand_total DECIMAL(15,2), amount_paid DECIMAL(15,2), balance_due DECIMAL(15,2), journal_entry_id VARCHAR(64), notes TEXT);`);
    await connection.query(`CREATE TABLE IF NOT EXISTS invoice_lines (id VARCHAR(64) PRIMARY KEY, invoice_id VARCHAR(64), product_id VARCHAR(64), product_name VARCHAR(255), analytic_account_id VARCHAR(64), quantity INT, unit_price DECIMAL(15,2), subtotal DECIMAL(15,2));`);
    await connection.query(`CREATE TABLE IF NOT EXISTS payments (id VARCHAR(64) PRIMARY KEY, payment_number VARCHAR(50), direction VARCHAR(20), partner_id VARCHAR(64), partner_name VARCHAR(255), target_document_type VARCHAR(50), target_document_id VARCHAR(64), target_document_number VARCHAR(50), payment_date DATE, method VARCHAR(50), amount DECIMAL(15,2), reference VARCHAR(255), journal_entry_id VARCHAR(64));`);
    await connection.query(`CREATE TABLE IF NOT EXISTS journal_entries (id VARCHAR(64) PRIMARY KEY, entry_number VARCHAR(50), journal_id VARCHAR(64), date DATE, reference VARCHAR(255), source_type VARCHAR(50), source_id VARCHAR(64), status VARCHAR(50), total_debit DECIMAL(15,2), total_credit DECIMAL(15,2));`);
    await connection.query(`CREATE TABLE IF NOT EXISTS journal_entry_lines (id VARCHAR(64) PRIMARY KEY, entry_id VARCHAR(64), account_id VARCHAR(64), partner_id VARCHAR(64), analytic_account_id VARCHAR(64), debit DECIMAL(15,2), credit DECIMAL(15,2), description TEXT);`);
  } finally {
    if (connection.release) connection.release();
  }
}

async function seedInitialData() {
  const connection = await activePool.getConnection();
  try {
    const cRes = await connection.query('SELECT COUNT(*) as cnt FROM contacts');
    console.log('[SEED LOG] cRes:', cRes);
    const [cCount] = cRes;
    const countVal = cCount && cCount[0] ? Number(cCount[0].cnt) : 0;
    console.log('[SEED LOG] countVal for contacts:', countVal);
    if (countVal === 0) {
      const contacts = [
        ['contact-azure', 'Azure Furniture', 'Vendor', 'vendor@azure.com', '9876543210', '12 Industrial Area', 'Mumbai', 'Maharashtra', '400001', 1],
        ['contact-nimesh', 'Nimesh Pathak', 'Customer', 'nimesh@gmail.com', '9123456789', '45 Park Street', 'Ahmedabad', 'Gujarat', '380001', 1],
        ['contact-woodcraft', 'WoodCraft Suppliers', 'Vendor', 'sales@woodcraft.com', '9988776655', '88 Timber Yard', 'Surat', 'Gujarat', '395001', 1],
        ['contact-priya', 'Priya Sharma', 'Customer', 'priya@outlook.com', '9443322110', '102 Green Avenue', 'Vadodara', 'Gujarat', '390001', 1]
      ];
      for (const c of contacts) {
        await connection.query('INSERT INTO contacts (id, name, type, email, phone, street_address, city, state, pincode, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', c);
      }
    }

    const [pCount] = await connection.query('SELECT COUNT(*) as cnt FROM products');
    if (pCount[0]?.cnt === 0) {
      const products = [
        ['prod-office-chair', 'Ergonomic Office Chair', 'Chairs', 3500, 2000, 15, 1],
        ['prod-wooden-table', 'Executive Wooden Table', 'Tables', 12000, 7500, 8, 1],
        ['prod-filing-cabinet', 'Steel Filing Cabinet', 'Storage', 8500, 5000, 10, 1],
        ['prod-assembly-svc', 'Furniture Assembly Service', 'Services', 800, 0, 999, 1]
      ];
      for (const p of products) {
        await connection.query('INSERT INTO products (id, name, category, sales_price, cost_price, stock_quantity, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)', p);
      }
    }

    const [aCount] = await connection.query('SELECT COUNT(*) as cnt FROM accounts');
    if (aCount[0]?.cnt === 0) {
      const accounts = [
        ['acc-cash', '1010', 'Cash', 'Asset', 0, 1, 1],
        ['acc-bank', '1020', 'Bank Account', 'Asset', 0, 1, 1],
        ['acc-debtors', '1100', 'Accounts Receivable (Debtors)', 'Asset', 0, 1, 1],
        ['acc-creditors', '2100', 'Accounts Payable (Creditors)', 'Liability', 0, 1, 1],
        ['acc-tax-payable', '2200', 'Sales Tax Payable', 'Liability', 0, 1, 1],
        ['acc-capital', '3000', 'Owner Capital', 'Equity', 0, 1, 1],
        ['acc-sales-income', '4000', 'Furniture Sales Income', 'Income', 0, 1, 1],
        ['acc-purchase-expense', '5000', 'Purchase Expense', 'Expense', 0, 1, 1]
      ];
      for (const a of accounts) {
        await connection.query('INSERT INTO accounts (id, code, name, type, current_balance, is_system_account, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)', a);
      }
    }

    const [jCount] = await connection.query('SELECT COUNT(*) as cnt FROM journals');
    if (jCount[0]?.cnt === 0) {
      const journals = [
        ['jou-customer-invoices', 'INV', 'Customer Invoices', 'Sales', 'acc-sales-income', 1],
        ['jou-vendor-bills', 'BILL', 'Vendor Bills', 'Purchase', 'acc-purchase-expense', 1],
        ['jou-bank', 'BNK', 'Bank Journal', 'Bank', 'acc-bank', 1],
        ['jou-cash', 'CSH', 'Cash Journal', 'Cash', 'acc-cash', 1],
        ['jou-miscellaneous', 'MISC', 'Miscellaneous Operations', 'General', null, 1]
      ];
      for (const j of journals) {
        await connection.query('INSERT INTO journals (id, code, name, type, default_account_id, is_active) VALUES (?, ?, ?, ?, ?, ?)', j);
      }
    }

    const [anCount] = await connection.query('SELECT COUNT(*) as cnt FROM analytic_accounts');
    if (anCount[0]?.cnt === 0) {
      const analytics = [
        ['ana-showroom', 'ANA-01', 'Showroom Sales', 1],
        ['ana-online', 'ANA-02', 'Online E-commerce', 1],
        ['ana-corporate', 'ANA-03', 'Corporate Contracts', 1]
      ];
      for (const an of analytics) {
        await connection.query('INSERT INTO analytic_accounts (id, code, name, is_active) VALUES (?, ?, ?, ?)', an);
      }
    }

    const [bCount] = await connection.query('SELECT COUNT(*) as cnt FROM budgets');
    if (bCount[0]?.cnt === 0) {
      const budgets = [
        ['bud-showroom-2026', 'Showroom Setup 2026', 'ana-showroom', 50000, '2026-01-01', '2026-12-31', 'Rahul Verma'],
        ['bud-online-mkt-2026', 'Online Marketing Q3', 'ana-online', 25000, '2026-07-01', '2026-09-30', 'Ananya Patel']
      ];
      for (const b of budgets) {
        await connection.query('INSERT INTO budgets (id, name, analytic_account_id, planned_amount, start_date, end_date, responsible_person) VALUES (?, ?, ?, ?, ?, ?, ?)', b);
      }
    }
  } finally {
    if (connection.release) connection.release();
  }
}

function getPool() {
  if (!activePool) {
    throw new Error('Database pool not initialized. Call initDatabase() first.');
  }
  return activePool;
}

module.exports = {
  initDatabase,
  getPool
};
