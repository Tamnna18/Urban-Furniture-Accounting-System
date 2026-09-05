const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// --- GET Journal Entries ---
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const [entries] = await pool.query('SELECT * FROM journal_entries ORDER BY date DESC, entry_number DESC');
    const result = [];
    for (const e of entries) {
      const [lines] = await pool.query('SELECT * FROM journal_entry_lines WHERE entry_id = ?', [e.id]);
      result.push({
        id: e.id,
        entryNumber: e.entry_number,
        journalId: e.journal_id,
        date: e.date,
        reference: e.reference,
        sourceType: e.source_type,
        sourceId: e.source_id,
        status: e.status,
        totalDebit: Number(e.total_debit),
        totalCredit: Number(e.total_credit),
        lines: lines.map(l => ({
          id: l.id,
          accountId: l.account_id,
          partnerId: l.partner_id,
          analyticAccountId: l.analytic_account_id,
          debit: Number(l.debit),
          credit: Number(l.credit),
          description: l.description
        }))
      });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- POST Create Custom Journal Entry ---
router.post('/', async (req, res) => {
  try {
    const pool = getPool();
    const { journalId, date, reference, lines, sourceType, sourceId } = req.body;

    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      return res.status(400).json({ success: false, message: 'Journal entry must have at least 2 lines' });
    }

    let totalDebit = 0;
    let totalCredit = 0;
    const processedLines = [];

    for (const l of lines) {
      const dr = Math.round((Number(l.debit || 0) + Number.EPSILON) * 100) / 100;
      const cr = Math.round((Number(l.credit || 0) + Number.EPSILON) * 100) / 100;

      if (dr < 0 || cr < 0) {
        return res.status(400).json({ success: false, message: 'Negative debit or credit values are strictly forbidden' });
      }
      if (dr === 0 && cr === 0) {
        return res.status(400).json({ success: false, message: 'Line must have either a non-zero debit or credit amount' });
      }

      // Check account validity
      const [accs] = await pool.query('SELECT * FROM accounts WHERE id = ?', [l.accountId]);
      if (accs.length === 0) {
        return res.status(400).json({ success: false, message: `Account ID '${l.accountId}' does not exist` });
      }

      totalDebit += dr;
      totalCredit += cr;

      processedLines.push({
        id: `jel-${Date.now()}-${Math.floor(Math.random()*1000)}`,
        accountId: l.accountId,
        partnerId: l.partnerId || null,
        analyticAccountId: l.analyticAccountId || null,
        debit: dr,
        credit: cr,
        description: l.description || reference || ''
      });
    }

    totalDebit = Math.round((totalDebit + Number.EPSILON) * 100) / 100;
    totalCredit = Math.round((totalCredit + Number.EPSILON) * 100) / 100;

    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      return res.status(400).json({
        success: false,
        message: `UNBALANCED JOURNAL ENTRY REJECTED: Total Debit (₹${totalDebit}) does not equal Total Credit (₹${totalCredit})`
      });
    }

    const entryId = req.body.id || `je-${Date.now()}`;
    const [jeCount] = await pool.query('SELECT COUNT(*) as cnt FROM journal_entries');
    const entryNumber = req.body.entryNumber || `JE-${String(jeCount[0].cnt + 1).padStart(4, '0')}`;

    await pool.query(
      'INSERT INTO journal_entries (id, entry_number, journal_id, date, reference, source_type, source_id, status, total_debit, total_credit) VALUES (?, ?, ?, ?, ?, ?, ?, "posted", ?, ?)',
      [entryId, entryNumber, journalId || 'jou-miscellaneous', date || new Date().toISOString().split('T')[0], reference || '', sourceType || 'Manual', sourceId || null, totalDebit, totalCredit]
    );

    for (const pl of processedLines) {
      await pool.query(
        'INSERT INTO journal_entry_lines (id, entry_id, account_id, partner_id, analytic_account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [pl.id, entryId, pl.accountId, pl.partnerId, pl.analyticAccountId, pl.debit, pl.credit, pl.description]
      );
    }

    res.status(201).json({
      success: true,
      data: {
        id: entryId,
        entryNumber,
        journalId: journalId || 'jou-miscellaneous',
        date: date || new Date().toISOString().split('T')[0],
        reference: reference || '',
        status: 'posted',
        totalDebit,
        totalCredit,
        lines: processedLines
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
