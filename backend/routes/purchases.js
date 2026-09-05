const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// --- GET Purchase Orders ---
router.get('/orders', async (req, res) => {
  try {
    const pool = getPool();
    const [orders] = await pool.query('SELECT * FROM purchase_orders ORDER BY order_date DESC, po_number DESC');
    const result = [];
    for (const po of orders) {
      const [lines] = await pool.query('SELECT * FROM purchase_order_lines WHERE po_id = ?', [po.id]);
      result.push({
        id: po.id,
        poNumber: po.po_number,
        vendorId: po.vendor_id,
        vendorName: po.vendor_name,
        orderDate: po.order_date,
        status: po.status,
        totalAmount: Number(po.total_amount),
        notes: po.notes,
        lines: lines.map(l => ({
          id: l.id,
          productId: l.product_id,
          productName: l.product_name,
          analyticAccountId: l.analytic_account_id,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          subtotal: Number(l.subtotal)
        }))
      });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Create Purchase Order ---
router.post('/orders', async (req, res) => {
  try {
    const pool = getPool();
    const { vendorId, orderDate, lines, notes } = req.body;
    
    // Validate vendor
    const [vendors] = await pool.query('SELECT * FROM contacts WHERE id = ? AND type = "Vendor"', [vendorId]);
    if (vendors.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid vendor ID or contact is not a vendor' });
    }

    const vendor = vendors[0];
    const poId = req.body.id || `po-${Date.now()}`;
    const [poCount] = await pool.query('SELECT COUNT(*) as cnt FROM purchase_orders');
    const poNumber = req.body.poNumber || `PO-${String(poCount[0].cnt + 1).padStart(4, '0')}`;

    let totalAmount = 0;
    const processedLines = [];

    for (const line of (lines || [])) {
      const qty = Number(line.quantity || 0);
      const price = Number(line.unitPrice || line.unit_price || 0);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
      }
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ success: false, message: 'Unit price must be a non-negative number' });
      }

      const [prods] = await pool.query('SELECT * FROM products WHERE id = ?', [line.productId]);
      const productName = prods.length > 0 ? prods[0].name : (line.productName || 'Unknown Product');
      const lineSubtotal = qty * price;
      totalAmount += lineSubtotal;

      processedLines.push({
        id: `pol-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        poId,
        productId: line.productId,
        productName,
        analyticAccountId: line.analyticAccountId || null,
        quantity: qty,
        unitPrice: price,
        subtotal: lineSubtotal
      });
    }

    await pool.query(
      'INSERT INTO purchase_orders (id, po_number, vendor_id, vendor_name, order_date, status, total_amount, notes) VALUES (?, ?, ?, ?, ?, "draft", ?, ?)',
      [poId, poNumber, vendorId, vendor.name, orderDate || new Date().toISOString().split('T')[0], totalAmount, notes || '']
    );

    for (const l of processedLines) {
      await pool.query(
        'INSERT INTO purchase_order_lines (id, po_id, product_id, product_name, analytic_account_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [l.id, l.poId, l.productId, l.productName, l.analyticAccountId, l.quantity, l.unitPrice, l.subtotal]
      );
    }

    const createdPO = {
      id: poId,
      poNumber,
      vendorId,
      vendorName: vendor.name,
      orderDate: orderDate || new Date().toISOString().split('T')[0],
      status: 'draft',
      totalAmount,
      notes: notes || '',
      lines: processedLines
    };

    res.status(201).json({ success: true, data: createdPO });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Confirm Purchase Order ---
router.post('/orders/:id/confirm', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;
    const [orders] = await pool.query('SELECT * FROM purchase_orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Purchase Order not found' });
    }

    await pool.query('UPDATE purchase_orders SET status = "confirmed" WHERE id = ?', [id]);
    res.json({ success: true, message: 'Purchase Order confirmed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- GET Vendor Bills ---
router.get('/bills', async (req, res) => {
  try {
    const pool = getPool();
    const [bills] = await pool.query('SELECT * FROM bills ORDER BY bill_date DESC, bill_number DESC');
    const result = [];
    for (const b of bills) {
      const [lines] = await pool.query('SELECT * FROM bill_lines WHERE bill_id = ?', [b.id]);
      result.push({
        id: b.id,
        billNumber: b.bill_number,
        poNumber: b.po_number,
        purchaseOrderId: b.purchase_order_id,
        vendorId: b.vendor_id,
        vendorName: b.vendor_name,
        billDate: b.bill_date,
        dueDate: b.due_date,
        status: b.status,
        totalAmount: Number(b.total_amount),
        amountPaid: Number(b.amount_paid),
        balanceDue: Number(b.balance_due),
        journalEntryId: b.journal_entry_id,
        notes: b.notes,
        lines: lines.map(l => ({
          id: l.id,
          productId: l.product_id,
          productName: l.product_name,
          analyticAccountId: l.analytic_account_id,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          subtotal: Number(l.subtotal)
        }))
      });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Create Vendor Bill from PO ---
router.post('/bills', async (req, res) => {
  try {
    const pool = getPool();
    const { poId, po_id, billDate, dueDate } = req.body;
    const targetPOId = poId || po_id;

    const [orders] = await pool.query('SELECT * FROM purchase_orders WHERE id = ?', [targetPOId]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Purchase Order not found' });
    }

    const po = orders[0];
    if (po.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: `PO must be 'confirmed' to generate bill. Current status: ${po.status}` });
    }

    const [existingBills] = await pool.query('SELECT * FROM bills WHERE purchase_order_id = ?', [targetPOId]);
    if (existingBills.length > 0) {
      return res.status(400).json({ success: false, message: `Bill already exists for Purchase Order ${po.po_number}` });
    }

    const [lines] = await pool.query('SELECT * FROM purchase_order_lines WHERE po_id = ?', [targetPOId]);
    const billId = req.body.id || `bill-${Date.now()}`;
    const [billCount] = await pool.query('SELECT COUNT(*) as cnt FROM bills');
    const billNumber = req.body.billNumber || `BILL-${String(billCount[0].cnt + 1).padStart(4, '0')}`;

    const totalAmount = Number(po.total_amount);

    await pool.query(
      'INSERT INTO bills (id, bill_number, po_number, purchase_order_id, vendor_id, vendor_name, bill_date, due_date, status, total_amount, amount_paid, balance_due, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [billId, billNumber, po.po_number, po.id, po.vendor_id, po.vendor_name, billDate || new Date().toISOString().split('T')[0], dueDate || billDate || new Date().toISOString().split('T')[0], 'draft', totalAmount, 0, totalAmount, po.notes || '']
    );

    const processedLines = [];
    for (const l of lines) {
      const blId = `bl-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      await pool.query(
        'INSERT INTO bill_lines (id, bill_id, product_id, product_name, analytic_account_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [blId, billId, l.product_id, l.product_name, l.analytic_account_id, l.quantity, l.unit_price, l.subtotal]
      );
      processedLines.push({
        id: blId,
        billId,
        productId: l.product_id,
        productName: l.product_name,
        analyticAccountId: l.analytic_account_id,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        subtotal: Number(l.subtotal)
      });
    }

    res.status(201).json({
      success: true,
      data: {
        id: billId,
        billNumber,
        poNumber: po.po_number,
        purchaseOrderId: po.id,
        vendorId: po.vendor_id,
        vendorName: po.vendor_name,
        billDate: billDate || new Date().toISOString().split('T')[0],
        dueDate: dueDate || billDate || new Date().toISOString().split('T')[0],
        status: 'draft',
        totalAmount,
        amountPaid: 0,
        balanceDue: totalAmount,
        lines: processedLines
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Confirm Vendor Bill ---
router.post('/bills/:id/confirm', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const [bills] = await pool.query('SELECT * FROM bills WHERE id = ?', [id]);
    if (bills.length === 0) {
      return res.status(404).json({ success: false, message: 'Vendor Bill not found' });
    }

    const bill = bills[0];
    if (bill.status !== 'draft') {
      return res.status(400).json({ success: false, message: `Bill is already ${bill.status}` });
    }

    const [lines] = await pool.query('SELECT * FROM bill_lines WHERE bill_id = ?', [id]);

    // 1. Stock Increment for physical goods
    for (const l of lines) {
      const [prods] = await pool.query('SELECT * FROM products WHERE id = ?', [l.product_id]);
      if (prods.length > 0 && prods[0].category !== 'Services') {
        await pool.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [l.quantity, l.product_id]);
      }
    }

    // 2. Post Journal Entry: Dr Purchase Expense / Cr Creditors
    const entryId = `je-bill-${Date.now()}`;
    const [jeCount] = await pool.query('SELECT COUNT(*) as cnt FROM journal_entries');
    const entryNumber = `JE-${String(jeCount[0].cnt + 1).padStart(4, '0')}`;
    const totalAmt = Number(bill.total_amount);

    await pool.query(
      'INSERT INTO journal_entries (id, entry_number, journal_id, date, reference, source_type, source_id, status, total_debit, total_credit) VALUES (?, ?, "jou-vendor-bills", ?, ?, "VendorBill", ?, "posted", ?, ?)',
      [entryId, entryNumber, bill.bill_date, `Vendor Bill ${bill.bill_number}`, bill.id, totalAmt, totalAmt]
    );

    // Dr Line: acc-purchase-expense
    await pool.query(
      'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, "acc-purchase-expense", ?, ?, ?, 0, ?)',
      [`jel-1-${Date.now()}`, entryId, bill.vendor_id, lines[0]?.analytic_account_id || null, totalAmt, `Bill ${bill.bill_number} - Purchase Expense`]
    );

    // Cr Line: acc-creditors
    await pool.query(
      'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, "acc-creditors", ?, ?, 0, ?, ?)',
      [`jel-2-${Date.now()}`, entryId, bill.vendor_id, null, totalAmt, `Bill ${bill.bill_number} - Accounts Payable`]
    );

    // Update Bill status and PO status
    await pool.query('UPDATE bills SET status = "posted", journal_entry_id = ? WHERE id = ?', [entryId, id]);
    if (bill.purchase_order_id) {
      await pool.query('UPDATE purchase_orders SET status = "billed" WHERE id = ?', [bill.purchase_order_id]);
    }

    const updatedBill = { ...bill, status: 'posted', journal_entry_id: entryId };
    const journalEntry = {
      id: entryId,
      entryNumber,
      journalId: 'jou-vendor-bills',
      date: bill.bill_date,
      reference: `Vendor Bill ${bill.bill_number}`,
      sourceType: 'VendorBill',
      sourceId: bill.id,
      totalDebit: totalAmt,
      totalCredit: totalAmt,
      lines: [
        { accountId: 'acc-purchase-expense', partnerId: bill.vendor_id, debit: totalAmt, credit: 0 },
        { accountId: 'acc-creditors', partnerId: bill.vendor_id, debit: 0, credit: totalAmt }
      ]
    };

    res.json({ success: true, data: { bill: updatedBill, journalEntry } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
