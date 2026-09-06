const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// Helper to sanitize row data
function sanitizeRow(row) {
  if (!row) return row;
  const newRow = { ...row };
  for (const key of Object.keys(newRow)) {
    if (typeof newRow[key] === 'bigint') {
      newRow[key] = Number(newRow[key]);
    }
  }
  return newRow;
}

// ==================== CONTACTS ====================
router.get('/contacts', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM contacts ORDER BY name ASC');
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      email: r.email,
      phone: r.phone,
      city: r.city,
      state: r.state,
      pincode: r.pincode,
      streetAddress: r.street_address,
      street_address: r.street_address,
      address: {
        streetAddress: r.street_address,
        city: r.city,
        state: r.state,
        pincode: r.pincode
      },
      isActive: Boolean(r.is_active),
      is_active: r.is_active
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/contacts', async (req, res) => {
  try {
    const pool = getPool();
    const { name, type, email, phone, city, state, pincode, streetAddress, street_address } = req.body;
    const id = req.body.id || `contact-${Date.now()}`;
    const street = streetAddress || street_address || '';
    await pool.query(
      'INSERT INTO contacts (id, name, type, email, phone, street_address, city, state, pincode, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)',
      [id, name, type || 'Customer', email || '', phone || '', street, city || '', state || '', pincode || '']
    );
    res.status(201).json({ success: true, data: { id, name, type, email, phone, city, state, pincode, streetAddress: street, isActive: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/contacts/:id', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { name, type, email, phone, city, state, pincode, streetAddress, street_address, isActive, is_active } = req.body;
    const active = isActive !== undefined ? (isActive ? 1 : 0) : (is_active !== undefined ? (is_active ? 1 : 0) : 1);
    const street = streetAddress || street_address || '';

    await pool.query(
      'UPDATE contacts SET name=?, type=?, email=?, phone=?, street_address=?, city=?, state=?, pincode=?, is_active=? WHERE id=?',
      [name, type, email, phone, street, city, state, pincode, active, id]
    );
    res.json({ success: true, message: 'Contact updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/contacts/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM contacts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== PRODUCTS ====================
router.get('/products', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM products ORDER BY name ASC');
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      category: r.category,
      salesPrice: Number(r.sales_price),
      costPrice: Number(r.cost_price),
      cost: Number(r.cost_price),
      stockQuantity: Number(r.stock_quantity),
      stock: Number(r.stock_quantity),
      isActive: Boolean(r.is_active)
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/products', async (req, res) => {
  try {
    const pool = getPool();
    const { name, category, salesPrice, costPrice, stockQuantity, sales_price, cost_price, stock_quantity } = req.body;
    const id = req.body.id || `prod-${Date.now()}`;
    const sp = Number(salesPrice !== undefined ? salesPrice : sales_price || 0);
    const cp = Number(costPrice !== undefined ? costPrice : cost_price || 0);
    const sq = Number(stockQuantity !== undefined ? stockQuantity : stock_quantity || 0);

    await pool.query(
      'INSERT INTO products (id, name, category, sales_price, cost_price, stock_quantity, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, name, category || 'General', sp, cp, sq]
    );
    res.status(201).json({ success: true, data: { id, name, category, salesPrice: sp, costPrice: cp, stockQuantity: sq, isActive: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/products/:id', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { name, category, salesPrice, costPrice, stockQuantity, sales_price, cost_price, stock_quantity, isActive } = req.body;
    const sp = Number(salesPrice !== undefined ? salesPrice : sales_price || 0);
    const cp = Number(costPrice !== undefined ? costPrice : cost_price || 0);
    const sq = Number(stockQuantity !== undefined ? stockQuantity : stock_quantity || 0);
    const active = isActive !== false ? 1 : 0;

    await pool.query(
      'UPDATE products SET name=?, category=?, sales_price=?, cost_price=?, stock_quantity=?, is_active=? WHERE id=?',
      [name, category, sp, cp, sq, active, id]
    );
    res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/products/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== ACCOUNTS ====================
router.get('/accounts', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM accounts ORDER BY code ASC');
    const data = rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      currentBalance: Number(r.current_balance),
      isSystemAccount: Boolean(r.is_system_account),
      isActive: Boolean(r.is_active)
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts', async (req, res) => {
  try {
    const pool = getPool();
    const { code, name, type, currentBalance, isSystemAccount } = req.body;
    const id = req.body.id || `acc-${Date.now()}`;
    await pool.query(
      'INSERT INTO accounts (id, code, name, type, current_balance, is_system_account, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [id, code, name, type, Number(currentBalance || 0), isSystemAccount ? 1 : 0]
    );
    res.status(201).json({ success: true, data: { id, code, name, type, currentBalance: Number(currentBalance || 0), isSystemAccount: Boolean(isSystemAccount), isActive: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/accounts/:id', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const { code, name, type, currentBalance, isSystemAccount, isActive } = req.body;
    await pool.query(
      'UPDATE accounts SET code=?, name=?, type=?, current_balance=?, is_system_account=?, is_active=? WHERE id=?',
      [code, name, type, Number(currentBalance || 0), isSystemAccount ? 1 : 0, isActive !== false ? 1 : 0, id]
    );
    res.json({ success: true, message: 'Account updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/accounts/:id', async (req, res) => {
  try {
    const pool = getPool();
    await pool.query('DELETE FROM accounts WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== JOURNALS ====================
router.get('/journals', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM journals ORDER BY code ASC');
    const data = rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      type: r.type,
      defaultAccountId: r.default_account_id,
      isActive: Boolean(r.is_active)
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/journals', async (req, res) => {
  try {
    const pool = getPool();
    const { code, name, type, defaultAccountId } = req.body;
    const id = req.body.id || `jou-${Date.now()}`;
    await pool.query(
      'INSERT INTO journals (id, code, name, type, default_account_id, is_active) VALUES (?, ?, ?, ?, ?, 1)',
      [id, code, name, type, defaultAccountId || null]
    );
    res.status(201).json({ success: true, data: { id, code, name, type, defaultAccountId: defaultAccountId || null, isActive: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== ANALYTICS ====================
router.get('/analytics', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM analytic_accounts ORDER BY code ASC');
    const data = rows.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      isActive: Boolean(r.is_active)
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/analytics', async (req, res) => {
  try {
    const pool = getPool();
    const { code, name } = req.body;
    const id = req.body.id || `ana-${Date.now()}`;
    await pool.query(
      'INSERT INTO analytic_accounts (id, code, name, is_active) VALUES (?, ?, ?, 1)',
      [id, code, name]
    );
    res.status(201).json({ success: true, data: { id, code, name, isActive: true } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ==================== BUDGETS ====================
router.get('/budgets', async (req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM budgets ORDER BY name ASC');
    const data = rows.map(r => ({
      id: r.id,
      name: r.name,
      analyticAccountId: r.analytic_account_id,
      plannedAmount: Number(r.planned_amount),
      startDate: r.start_date,
      endDate: r.end_date,
      responsiblePerson: r.responsible_person
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/budgets', async (req, res) => {
  try {
    const pool = getPool();
    const { name, analyticAccountId, plannedAmount, startDate, endDate, responsiblePerson } = req.body;
    const id = req.body.id || `bud-${Date.now()}`;
    await pool.query(
      'INSERT INTO budgets (id, name, analytic_account_id, planned_amount, start_date, end_date, responsible_person) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, analyticAccountId, Number(plannedAmount || 0), startDate, endDate, responsiblePerson || '']
    );
    res.status(201).json({ success: true, data: { id, name, analyticAccountId, plannedAmount: Number(plannedAmount || 0), startDate, endDate, responsiblePerson: responsiblePerson || '' } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
