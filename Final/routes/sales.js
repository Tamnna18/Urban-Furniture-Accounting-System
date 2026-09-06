const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// --- GET Sales Orders ---
router.get('/orders', async (req, res) => {
  try {
    const pool = getPool();
    const { customerId } = req.query;
    let queryStr = 'SELECT * FROM sales_orders';
    const params = [];
    if (customerId) {
      queryStr += ' WHERE customer_id = ?';
      params.push(customerId);
    }
    queryStr += ' ORDER BY order_date DESC, so_number DESC';

    const [orders] = await pool.query(queryStr, params);
    const result = [];
    for (const so of orders) {
      const [lines] = await pool.query('SELECT * FROM sales_order_lines WHERE so_id = ?', [so.id]);
      result.push({
        id: so.id,
        soNumber: so.so_number,
        customerId: so.customer_id,
        customerName: so.customer_name,
        orderDate: so.order_date,
        status: so.status,
        subtotal: Number(so.subtotal),
        taxTotal: Number(so.tax_total),
        grandTotal: Number(so.grand_total),
        notes: so.notes,
        lines: lines.map(l => ({
          id: l.id,
          productId: l.product_id,
          productName: l.product_name,
          analyticAccountId: l.analytic_account_id,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          taxRate: Number(l.tax_rate),
          subtotal: Number(l.subtotal),
          taxAmount: Number(l.tax_amount),
          total: Number(l.total)
        }))
      });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Create Sales Order ---
router.post('/orders', async (req, res) => {
  try {
    const pool = getPool();
    const { customerId, orderDate, lines, notes } = req.body;

    const [customers] = await pool.query('SELECT * FROM contacts WHERE id = ? AND type = "Customer"', [customerId]);
    if (customers.length === 0) {
      return res.status(400).json({ success: false, message: 'Invalid customer ID or contact is not a customer' });
    }

    const customer = customers[0];
    const soId = req.body.id || `so-${Date.now()}`;
    const [soCount] = await pool.query('SELECT COUNT(*) as cnt FROM sales_orders');
    const soNumber = req.body.soNumber || `SO-${String(soCount[0].cnt + 1).padStart(4, '0')}`;

    let subtotal = 0;
    let taxTotal = 0;
    const processedLines = [];

    for (const line of (lines || [])) {
      const qty = Number(line.quantity || 0);
      const price = Number(line.unitPrice || line.unit_price || 0);
      const taxRate = Number(line.taxRate !== undefined ? line.taxRate : line.tax_rate || 0);

      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: 'Quantity must be a positive number' });
      }
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ success: false, message: 'Unit price must be a non-negative number' });
      }

      const [prods] = await pool.query('SELECT * FROM products WHERE id = ?', [line.productId]);
      const productName = prods.length > 0 ? prods[0].name : (line.productName || 'Unknown Product');

      const lineSubtotal = qty * price;
      const lineTax = (lineSubtotal * taxRate) / 100;
      const lineTotal = lineSubtotal + lineTax;

      subtotal += lineSubtotal;
      taxTotal += lineTax;

      processedLines.push({
        id: `sol-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        soId,
        productId: line.productId,
        productName,
        analyticAccountId: line.analyticAccountId || null,
        quantity: qty,
        unitPrice: price,
        taxRate,
        subtotal: lineSubtotal,
        taxAmount: lineTax,
        total: lineTotal
      });
    }

    const grandTotal = subtotal + taxTotal;

    await pool.query(
      'INSERT INTO sales_orders (id, so_number, customer_id, customer_name, order_date, status, subtotal, tax_total, grand_total, notes) VALUES (?, ?, ?, ?, ?, "draft", ?, ?, ?, ?)',
      [soId, soNumber, customerId, customer.name, orderDate || new Date().toISOString().split('T')[0], subtotal, taxTotal, grandTotal, notes || '']
    );

    for (const l of processedLines) {
      await pool.query(
        'INSERT INTO sales_order_lines (id, so_id, product_id, product_name, analytic_account_id, quantity, unit_price, tax_rate, subtotal, tax_amount, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [l.id, l.soId, l.productId, l.productName, l.analyticAccountId, l.quantity, l.unitPrice, l.taxRate, l.subtotal, l.taxAmount, l.total]
      );
    }

    res.status(201).json({
      success: true,
      data: {
        id: soId,
        soNumber,
        customerId,
        customerName: customer.name,
        orderDate: orderDate || new Date().toISOString().split('T')[0],
        status: 'draft',
        subtotal,
        taxTotal,
        grandTotal,
        notes: notes || '',
        lines: processedLines
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Confirm Sales Order ---
router.post('/orders/:id/confirm', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const [orders] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [id]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Sales Order not found' });
    }

    const [lines] = await pool.query('SELECT * FROM sales_order_lines WHERE so_id = ?', [id]);

    // Stock invariant check
    for (const l of lines) {
      const [prods] = await pool.query('SELECT * FROM products WHERE id = ?', [l.product_id]);
      if (prods.length > 0 && prods[0].category !== 'Services') {
        const prod = prods[0];
        if (prod.stock_quantity < l.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product '${prod.name}'. Requested ${l.quantity}, available ${prod.stock_quantity}.`
          });
        }
      }
    }

    await pool.query('UPDATE sales_orders SET status = "confirmed" WHERE id = ?', [id]);
    res.json({ success: true, message: 'Sales Order confirmed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- GET Invoices ---
router.get('/invoices', async (req, res) => {
  try {
    const pool = getPool();
    const { customerId } = req.query;
    let queryStr = 'SELECT * FROM invoices';
    const params = [];
    if (customerId) {
      queryStr += ' WHERE customer_id = ?';
      params.push(customerId);
    }
    queryStr += ' ORDER BY invoice_date DESC, invoice_number DESC';

    const [invoices] = await pool.query(queryStr, params);
    const result = [];
    for (const inv of invoices) {
      const [lines] = await pool.query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [inv.id]);
      result.push({
        id: inv.id,
        invoiceNumber: inv.invoice_number,
        soNumber: inv.so_number,
        salesOrderId: inv.sales_order_id,
        customerId: inv.customer_id,
        customerName: inv.customer_name,
        invoiceDate: inv.invoice_date,
        dueDate: inv.due_date,
        status: inv.status,
        subtotal: Number(inv.subtotal),
        taxTotal: Number(inv.tax_total),
        grandTotal: Number(inv.grand_total),
        amountPaid: Number(inv.amount_paid),
        balanceDue: Number(inv.balance_due),
        journalEntryId: inv.journal_entry_id,
        notes: inv.notes,
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

// --- POST Create Invoice from SO ---
router.post('/invoices', async (req, res) => {
  try {
    const pool = getPool();
    const { soId, so_id, invoiceDate, dueDate } = req.body;
    const targetSOId = soId || so_id;

    const [orders] = await pool.query('SELECT * FROM sales_orders WHERE id = ?', [targetSOId]);
    if (orders.length === 0) {
      return res.status(404).json({ success: false, message: 'Sales Order not found' });
    }

    const so = orders[0];
    if (so.status !== 'confirmed') {
      return res.status(400).json({ success: false, message: `SO must be 'confirmed' to generate invoice. Current status: ${so.status}` });
    }

    const [existingInvoices] = await pool.query('SELECT * FROM invoices WHERE sales_order_id = ?', [targetSOId]);
    if (existingInvoices.length > 0) {
      return res.status(400).json({ success: false, message: `Invoice already exists for Sales Order ${so.so_number}` });
    }

    const [lines] = await pool.query('SELECT * FROM sales_order_lines WHERE so_id = ?', [targetSOId]);
    const invId = req.body.id || `inv-${Date.now()}`;
    const [invCount] = await pool.query('SELECT COUNT(*) as cnt FROM invoices');
    const invoiceNumber = req.body.invoiceNumber || `INV-${String(invCount[0].cnt + 1).padStart(4, '0')}`;

    const subtotal = Number(so.subtotal);
    const taxTotal = Number(so.tax_total);
    const grandTotal = Number(so.grand_total);

    await pool.query(
      'INSERT INTO invoices (id, invoice_number, so_number, sales_order_id, customer_id, customer_name, invoice_date, due_date, status, subtotal, tax_total, grand_total, amount_paid, balance_due, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [invId, invoiceNumber, so.so_number, so.id, so.customer_id, so.customer_name, invoiceDate || new Date().toISOString().split('T')[0], dueDate || invoiceDate || new Date().toISOString().split('T')[0], 'draft', subtotal, taxTotal, grandTotal, 0, grandTotal, so.notes || '']
    );

    const processedLines = [];
    for (const l of lines) {
      const ilId = `il-${Date.now()}-${Math.floor(Math.random()*1000)}`;
      await pool.query(
        'INSERT INTO invoice_lines (id, invoice_id, product_id, product_name, analytic_account_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [ilId, invId, l.product_id, l.product_name, l.analytic_account_id, l.quantity, l.unit_price, l.subtotal]
      );
      processedLines.push({
        id: ilId,
        invoiceId: invId,
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
        id: invId,
        invoiceNumber,
        soNumber: so.so_number,
        salesOrderId: so.id,
        customerId: so.customer_id,
        customerName: so.customer_name,
        invoiceDate: invoiceDate || new Date().toISOString().split('T')[0],
        dueDate: dueDate || invoiceDate || new Date().toISOString().split('T')[0],
        status: 'draft',
        subtotal,
        taxTotal,
        grandTotal,
        amountPaid: 0,
        balanceDue: grandTotal,
        lines: processedLines
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Confirm Customer Invoice ---
router.post('/invoices/:id/confirm', async (req, res) => {
  try {
    const pool = getPool();
    const { id } = req.params;

    const [invoices] = await pool.query('SELECT * FROM invoices WHERE id = ?', [id]);
    if (invoices.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }

    const inv = invoices[0];
    if (inv.status !== 'draft') {
      return res.status(400).json({ success: false, message: `Invoice is already ${inv.status}` });
    }

    const [lines] = await pool.query('SELECT * FROM invoice_lines WHERE invoice_id = ?', [id]);

    // 1. Stock Check & Decrement
    for (const l of lines) {
      const [prods] = await pool.query('SELECT * FROM products WHERE id = ?', [l.product_id]);
      if (prods.length > 0 && prods[0].category !== 'Services') {
        const prod = prods[0];
        if (prod.stock_quantity < l.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for product '${prod.name}'. Requested ${l.quantity}, available ${prod.stock_quantity}.`
          });
        }
      }
    }

    for (const l of lines) {
      const [prods] = await pool.query('SELECT * FROM products WHERE id = ?', [l.product_id]);
      if (prods.length > 0 && prods[0].category !== 'Services') {
        await pool.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [l.quantity, l.product_id]);
      }
    }

    // 2. Post Sales Journal Entry: Dr Debtors grandTotal / Cr Sales Income subtotal / Cr Tax Payable taxTotal
    const entryId = `je-inv-${Date.now()}`;
    const [jeCount] = await pool.query('SELECT COUNT(*) as cnt FROM journal_entries');
    const entryNumber = `JE-${String(jeCount[0].cnt + 1).padStart(4, '0')}`;

    const subtotal = Number(inv.subtotal);
    const taxTotal = Number(inv.tax_total);
    const grandTotal = Number(inv.grand_total);

    await pool.query(
      'INSERT INTO journal_entries (id, entry_number, journal_id, date, reference, source_type, source_id, status, total_debit, total_credit) VALUES (?, ?, "jou-customer-invoices", ?, ?, "CustomerInvoice", ?, "posted", ?, ?)',
      [entryId, entryNumber, inv.invoice_date, `Customer Invoice ${inv.invoice_number}`, inv.id, grandTotal, grandTotal]
    );

    // Dr Line: acc-debtors
    await pool.query(
      'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, "acc-debtors", ?, ?, ?, 0, ?)',
      [`jel-1-${Date.now()}`, entryId, inv.customer_id, null, grandTotal, `Invoice ${inv.invoice_number} - Accounts Receivable`]
    );

    // Cr Line: acc-sales-income
    await pool.query(
      'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, "acc-sales-income", ?, ?, 0, ?, ?)',
      [`jel-2-${Date.now()}`, entryId, inv.customer_id, lines[0]?.analytic_account_id || null, subtotal, `Invoice ${inv.invoice_number} - Sales Income`]
    );

    // Cr Line: acc-tax-payable (if tax > 0)
    if (taxTotal > 0) {
      await pool.query(
        'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, "acc-tax-payable", ?, ?, 0, ?, ?)',
        [`jel-3-${Date.now()}`, entryId, inv.customer_id, null, taxTotal, `Invoice ${inv.invoice_number} - Output Sales Tax`]
      );
    }

    // Update Invoice status and SO status
    await pool.query('UPDATE invoices SET status = "posted", journal_entry_id = ? WHERE id = ?', [entryId, id]);
    if (inv.sales_order_id) {
      await pool.query('UPDATE sales_orders SET status = "invoiced" WHERE id = ?', [inv.sales_order_id]);
    }

    const updatedInvoice = { ...inv, status: 'posted', journal_entry_id: entryId };
    const journalEntry = {
      id: entryId,
      entryNumber,
      journalId: 'jou-customer-invoices',
      date: inv.invoice_date,
      reference: `Customer Invoice ${inv.invoice_number}`,
      sourceType: 'CustomerInvoice',
      sourceId: inv.id,
      totalDebit: grandTotal,
      totalCredit: grandTotal,
      lines: [
        { accountId: 'acc-debtors', partnerId: inv.customer_id, debit: grandTotal, credit: 0 },
        { accountId: 'acc-sales-income', partnerId: inv.customer_id, debit: 0, credit: subtotal },
        ...(taxTotal > 0 ? [{ accountId: 'acc-tax-payable', partnerId: inv.customer_id, debit: 0, credit: taxTotal }] : [])
      ]
    };

    res.json({ success: true, data: { invoice: updatedInvoice, journalEntry } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
