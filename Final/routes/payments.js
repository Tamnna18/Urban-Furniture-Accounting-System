const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// --- GET Payments ---
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [payments] = await pool.query('SELECT * FROM payments ORDER BY payment_date DESC, payment_number DESC');
    const result = payments.map(p => ({
      id: p.id,
      paymentNumber: p.payment_number,
      direction: p.direction,
      partnerId: p.partner_id,
      partnerName: p.partner_name,
      targetDocumentType: p.target_document_type,
      targetDocumentId: p.target_document_id,
      targetDocumentNumber: p.target_document_number,
      paymentDate: p.payment_date,
      method: p.method,
      amount: Number(p.amount),
      reference: p.reference,
      journalEntryId: p.journal_entry_id
    }));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Register Payment ---
router.post('/', async (req, res) => {
  try {
    const pool = getPool();
    const { billId, invoiceId, targetDocumentId, method, paymentDate, reference, amount } = req.body || {};
    const payMethod = method || req.body.paymentMethod || 'Bank';
    const targetAccountId = payMethod.toLowerCase().includes('cash') ? 'acc-cash' : 'acc-bank';
    const journalId = payMethod.toLowerCase().includes('cash') ? 'jou-cash' : 'jou-bank';

    // 1. Vendor Payment (Outbound)
    if (billId || (targetDocumentId && (req.body.direction === 'OUTBOUND' || !invoiceId))) {
      const bId = billId || targetDocumentId;
      const [bills] = await pool.query('SELECT * FROM bills WHERE id = ?', [bId]);
      if (bills.length === 0) {
        return res.status(404).json({ success: false, message: `Vendor Bill ${bId} not found` });
      }

      const bill = bills[0];
      const currentBalanceDue = Number(bill.balance_due);
      const payAmount = (amount !== undefined && amount !== null && !isNaN(Number(amount))) ? Number(amount) : currentBalanceDue;

      if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
      }

      if (bill.status !== 'posted') {
        if (bill.status === 'paid') {
          return res.status(400).json({ success: false, message: `Bill ${bill.bill_number} is already in status 'paid'` });
        }
        return res.status(400).json({ success: false, message: `Bill status must be 'posted' to accept payment. Current status: ${bill.status}` });
      }

      if (payAmount > currentBalanceDue) {
        return res.status(400).json({ success: false, message: `Payment amount (${payAmount}) exceeds outstanding balance (${currentBalanceDue})` });
      }

      const newPaid = Number(bill.amount_paid) + payAmount;
      const newBalance = currentBalanceDue - payAmount;
      const newStatus = newBalance === 0 ? 'paid' : 'posted';

      const paymentId = req.body.id || `pay-${Date.now()}`;
      const [payCount] = await pool.query('SELECT COUNT(*) as cnt FROM payments');
      const paymentNumber = req.body.paymentNumber || `PAY-${String(payCount[0].cnt + 1).padStart(4, '0')}`;

      // Post Journal Entry: Dr acc-creditors / Cr targetAccountId
      const entryId = `je-pay-${Date.now()}`;
      const [jeCount] = await pool.query('SELECT COUNT(*) as cnt FROM journal_entries');
      const entryNumber = `JE-${String(jeCount[0].cnt + 1).padStart(4, '0')}`;

      await pool.query(
        'INSERT INTO journal_entries (id, entry_number, journal_id, date, reference, source_type, source_id, status, total_debit, total_credit) VALUES (?, ?, ?, ?, ?, "VendorPayment", ?, "posted", ?, ?)',
        [entryId, entryNumber, journalId, paymentDate || new Date().toISOString().split('T')[0], `Vendor Payment ${paymentNumber}`, paymentId, payAmount, payAmount]
      );

      // Dr Line: acc-creditors
      await pool.query(
        'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, "acc-creditors", ?, null, ?, 0, ?)',
        [`jel-1-${Date.now()}`, entryId, bill.vendor_id, payAmount, `Payment ${paymentNumber} to ${bill.vendor_name}`]
      );

      // Cr Line: targetAccountId (bank/cash)
      await pool.query(
        'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, ?, ?, null, 0, ?, ?)',
        [`jel-2-${Date.now()}`, entryId, targetAccountId, bill.vendor_id, payAmount, `Payment ${paymentNumber} via ${payMethod}`]
      );

      await pool.query(
        'INSERT INTO payments (id, payment_number, direction, partner_id, partner_name, target_document_type, target_document_id, target_document_number, payment_date, method, amount, reference, journal_entry_id) VALUES (?, ?, "OUTBOUND", ?, ?, "VendorBill", ?, ?, ?, ?, ?, ?, ?)',
        [paymentId, paymentNumber, bill.vendor_id, bill.vendor_name, bill.id, bill.bill_number, paymentDate || new Date().toISOString().split('T')[0], payMethod, payAmount, reference || '', entryId]
      );

      await pool.query(
        'UPDATE bills SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?',
        [newPaid, newBalance, newStatus, bill.id]
      );

      const updatedBill = { ...bill, amount_paid: newPaid, balance_due: newBalance, status: newStatus };
      const paymentObj = {
        id: paymentId,
        paymentNumber,
        direction: 'OUTBOUND',
        partnerId: bill.vendor_id,
        partnerName: bill.vendor_name,
        targetDocumentType: 'VendorBill',
        targetDocumentId: bill.id,
        targetDocumentNumber: bill.bill_number,
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        method: payMethod,
        amount: payAmount,
        reference: reference || '',
        journalEntryId: entryId
      };

      const journalEntry = {
        id: entryId,
        entryNumber,
        journalId,
        date: paymentDate || new Date().toISOString().split('T')[0],
        totalDebit: payAmount,
        totalCredit: payAmount,
        lines: [
          { accountId: 'acc-creditors', debit: payAmount, credit: 0 },
          { accountId: targetAccountId, debit: 0, credit: payAmount }
        ]
      };

      return res.status(201).json({ success: true, data: { payment: paymentObj, bill: updatedBill, journalEntry } });
    }

    // 2. Customer Payment (Inbound)
    if (invoiceId || targetDocumentId) {
      const invId = invoiceId || targetDocumentId;
      const [invoices] = await pool.query('SELECT * FROM invoices WHERE id = ?', [invId]);
      if (invoices.length === 0) {
        return res.status(404).json({ success: false, message: `Customer Invoice ${invId} not found` });
      }

      const invoice = invoices[0];
      const currentBalanceDue = Number(invoice.balance_due);
      const payAmount = (amount !== undefined && amount !== null && !isNaN(Number(amount))) ? Number(amount) : currentBalanceDue;

      if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });
      }

      if (invoice.status !== 'posted') {
        if (invoice.status === 'paid') {
          return res.status(400).json({ success: false, message: `Invoice ${invoice.invoice_number} is already in status 'paid'` });
        }
        return res.status(400).json({ success: false, message: `Invoice status must be 'posted' to accept payment. Current status: ${invoice.status}` });
      }

      if (payAmount > currentBalanceDue) {
        return res.status(400).json({ success: false, message: `Payment amount (${payAmount}) exceeds outstanding balance (${currentBalanceDue})` });
      }

      const newPaid = Number(invoice.amount_paid) + payAmount;
      const newBalance = currentBalanceDue - payAmount;
      const newStatus = newBalance === 0 ? 'paid' : 'posted';

      const paymentId = req.body.id || `pay-${Date.now()}`;
      const [payCount] = await pool.query('SELECT COUNT(*) as cnt FROM payments');
      const paymentNumber = req.body.paymentNumber || `PAY-${String(payCount[0].cnt + 1).padStart(4, '0')}`;

      // Post Journal Entry: Dr targetAccountId / Cr acc-debtors
      const entryId = `je-pay-${Date.now()}`;
      const [jeCount] = await pool.query('SELECT COUNT(*) as cnt FROM journal_entries');
      const entryNumber = `JE-${String(jeCount[0].cnt + 1).padStart(4, '0')}`;

      await pool.query(
        'INSERT INTO journal_entries (id, entry_number, journal_id, date, reference, source_type, source_id, status, total_debit, total_credit) VALUES (?, ?, ?, ?, ?, "CustomerPayment", ?, "posted", ?, ?)',
        [entryId, entryNumber, journalId, paymentDate || new Date().toISOString().split('T')[0], `Customer Payment ${paymentNumber}`, paymentId, payAmount, payAmount]
      );

      // Dr Line: targetAccountId (bank/cash)
      await pool.query(
        'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, ?, ?, null, ?, 0, ?)',
        [`jel-1-${Date.now()}`, entryId, targetAccountId, invoice.customer_id, payAmount, `Payment ${paymentNumber} via ${payMethod}`]
      );

      // Cr Line: acc-debtors
      await pool.query(
        'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, "acc-debtors", ?, null, 0, ?, ?)',
        [`jel-2-${Date.now()}`, entryId, invoice.customer_id, payAmount, `Payment ${paymentNumber} from ${invoice.customer_name}`]
      );

      await pool.query(
        'INSERT INTO payments (id, payment_number, direction, partner_id, partner_name, target_document_type, target_document_id, target_document_number, payment_date, method, amount, reference, journal_entry_id) VALUES (?, ?, "INBOUND", ?, ?, "CustomerInvoice", ?, ?, ?, ?, ?, ?, ?)',
        [paymentId, paymentNumber, invoice.customer_id, invoice.customer_name, invoice.id, invoice.invoice_number, paymentDate || new Date().toISOString().split('T')[0], payMethod, payAmount, reference || '', entryId]
      );

      await pool.query(
        'UPDATE invoices SET amount_paid = ?, balance_due = ?, status = ? WHERE id = ?',
        [newPaid, newBalance, newStatus, invoice.id]
      );

      const updatedInvoice = { ...invoice, amount_paid: newPaid, balance_due: newBalance, status: newStatus };
      const paymentObj = {
        id: paymentId,
        paymentNumber,
        direction: 'INBOUND',
        partnerId: invoice.customer_id,
        partnerName: invoice.customer_name,
        targetDocumentType: 'CustomerInvoice',
        targetDocumentId: invoice.id,
        targetDocumentNumber: invoice.invoice_number,
        paymentDate: paymentDate || new Date().toISOString().split('T')[0],
        method: payMethod,
        amount: payAmount,
        reference: reference || '',
        journalEntryId: entryId
      };

      const journalEntry = {
        id: entryId,
        entryNumber,
        journalId,
        date: paymentDate || new Date().toISOString().split('T')[0],
        totalDebit: payAmount,
        totalCredit: payAmount,
        lines: [
          { accountId: targetAccountId, debit: payAmount, credit: 0 },
          { accountId: 'acc-debtors', debit: 0, credit: payAmount }
        ]
      };

      return res.status(201).json({ success: true, data: { payment: paymentObj, invoice: updatedInvoice, journalEntry } });
    }

    res.status(400).json({ success: false, message: 'Must provide either billId or invoiceId to register payment' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Customer Payment Alias ---
router.post('/customer-pay', async (req, res, next) => {
  req.body.direction = 'INBOUND';
  const handler = router.stack.find(layer => layer.route && layer.route.path === '/' && layer.route.methods.post)?.handle;
  if (handler) {
    return handler(req, res, next);
  }
  res.status(500).json({ success: false, message: 'Payment handler not found' });
});

module.exports = router;
