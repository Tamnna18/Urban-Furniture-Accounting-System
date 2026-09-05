/**
 * Member 3 - Centralized Journal Posting Engine & Invariant Validator
 * Enforces strict double-entry balancing: SUM(Debit) === SUM(Credit).
 * Rejects and rolls back any unbalanced or corrupted candidate entries.
 */

class JournalEngine {
  constructor(storeInstance, mastersInstance) {
    this.store = storeInstance;
    this.masters = mastersInstance;
  }

  getEntries() {
    return this.store.get('urban_journal_entries', []);
  }

  generateEntryNumber() {
    const entries = this.getEntries();
    const count = entries.length + 1;
    return `JE-2026-${String(count).padStart(4, '0')}`;
  }

  /**
   * Validates line structure and double-entry balancing invariant.
   * @param {Array} lines - Array of { accountId, partnerId, debit, credit }
   * @returns {Object} { valid: boolean, error?: string, totalDebit: number, totalCredit: number }
   */
  validateEntry(lines) {
    if (!Array.isArray(lines) || lines.length < 2) {
      return { valid: false, error: 'A journal entry must contain at least two journal lines.' };
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.accountId) {
        return { valid: false, error: `Line ${i + 1} is missing a valid account ID.` };
      }

      const acc = this.masters.getAccountById(line.accountId);
      if (!acc) {
        return { valid: false, error: `Account ID ${line.accountId} does not exist in Chart of Accounts.` };
      }

      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;

      if (debit < 0 || credit < 0) {
        return { valid: false, error: `Negative debit or credit amounts are not allowed on line ${i + 1}.` };
      }

      if (debit === 0 && credit === 0) {
        return { valid: false, error: `Line ${i + 1} must have either a debit or a credit amount > 0.` };
      }

      if (debit > 0 && credit > 0) {
        return { valid: false, error: `Line ${i + 1} cannot have both debit and credit. Split into separate lines.` };
      }

      totalDebit += debit;
      totalCredit += credit;
    }

    totalDebit = Math.round((totalDebit + Number.EPSILON) * 100) / 100;
    totalCredit = Math.round((totalCredit + Number.EPSILON) * 100) / 100;

    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.001) {
      return {
        valid: false,
        error: `Journal entry is UNBALANCED: Total Debit (${totalDebit}) does not equal Total Credit (${totalCredit}). Difference: ${diff.toFixed(2)}`,
        totalDebit,
        totalCredit
      };
    }

    return { valid: true, totalDebit, totalCredit };
  }

  /**
   * Posts an entry to the journal repository.
   * Throws Error if validation fails.
   */
  postEntry({ journalId, date, reference, sourceType, sourceId, lines }) {
    const validation = this.validateEntry(lines);
    if (!validation.valid) {
      throw new Error(`Posting Failed: ${validation.error}`);
    }

    if (!journalId) {
      // Default to general/purchase/sales journal if not specified
      const journals = this.masters.getJournals();
      journalId = journals[0]?.id || 'jrnl-general';
    }

    const newEntry = {
      id: `je-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      entryNumber: this.generateEntryNumber(),
      journalId,
      date: date || new Date().toISOString().split('T')[0],
      reference: reference || 'Manual Entry',
      sourceType: sourceType || 'Manual',
      sourceId: sourceId || null,
      lines: lines.map(l => ({
        accountId: l.accountId,
        partnerId: l.partnerId || null,
        debit: Math.round(((Number(l.debit) || 0) + Number.EPSILON) * 100) / 100,
        credit: Math.round(((Number(l.credit) || 0) + Number.EPSILON) * 100) / 100
      })),
      totalDebit: validation.totalDebit,
      totalCredit: validation.totalCredit,
      createdAt: new Date().toISOString()
    };

    const entries = this.getEntries();
    entries.push(newEntry);
    this.store.set('urban_journal_entries', entries);
    this.store.emit('journal:posted', newEntry);

    return newEntry;
  }

  // ==========================================
  // Standard Approved Accounting Posting Rules
  // ==========================================

  /**
   * Credit Purchase (Vendor Bill Confirmation)
   * Debit -> Purchases Expense
   * Credit -> Creditors
   */
  postCreditPurchase({ bill, expenseAccountId, creditorsAccountId, date }) {
    const amount = Math.round((bill.totalAmount + Number.EPSILON) * 100) / 100;
    const purchaseJournal = this.masters.getJournalByType('Purchase') || this.masters.getJournals()[0];

    const lines = [
      { accountId: expenseAccountId, partnerId: bill.vendorId, debit: amount, credit: 0 },
      { accountId: creditorsAccountId, partnerId: bill.vendorId, debit: 0, credit: amount }
    ];

    return this.postEntry({
      journalId: purchaseJournal?.id,
      date: date || bill.billDate,
      reference: `Bill ${bill.billNumber}`,
      sourceType: 'VendorBill',
      sourceId: bill.id,
      lines
    });
  }

  /**
   * Sale (Customer Invoice Confirmation)
   * Debit -> Debtors
   * Credit -> Sales Income
   * Credit -> Tax Payable (if tax > 0)
   */
  postSale({ invoice, debtorsAccountId, salesIncomeAccountId, taxAccountId, date }) {
    const grossTotal = Math.round((invoice.grandTotal + Number.EPSILON) * 100) / 100;
    const netSubtotal = Math.round((invoice.subtotal + Number.EPSILON) * 100) / 100;
    const taxTotal = Math.round(((invoice.taxTotal || 0) + Number.EPSILON) * 100) / 100;

    const salesJournal = this.masters.getJournalByType('Sales') || this.masters.getJournals()[0];

    const lines = [
      { accountId: debtorsAccountId, partnerId: invoice.customerId, debit: grossTotal, credit: 0 },
      { accountId: salesIncomeAccountId, partnerId: invoice.customerId, debit: 0, credit: netSubtotal }
    ];

    if (taxTotal > 0 && taxAccountId) {
      lines.push({ accountId: taxAccountId, partnerId: invoice.customerId, debit: 0, credit: taxTotal });
    }

    return this.postEntry({
      journalId: salesJournal?.id,
      date: date || invoice.invoiceDate,
      reference: `Invoice ${invoice.invoiceNumber}`,
      sourceType: 'CustomerInvoice',
      sourceId: invoice.id,
      lines
    });
  }

  /**
   * Customer Payment (Receipt)
   * Debit -> Cash OR Bank
   * Credit -> Debtors
   */
  postCustomerPayment({ payment, debtorsAccountId, cashOrBankAccountId, date }) {
    const amount = Math.round((payment.amount + Number.EPSILON) * 100) / 100;
    const journalType = payment.method === 'Cash' ? 'Cash' : 'Bank';
    const paymentJournal = this.masters.getJournalByType(journalType);

    const lines = [
      { accountId: cashOrBankAccountId, partnerId: payment.partnerId, debit: amount, credit: 0 },
      { accountId: debtorsAccountId, partnerId: payment.partnerId, debit: 0, credit: amount }
    ];

    return this.postEntry({
      journalId: paymentJournal?.id,
      date: date || payment.paymentDate,
      reference: payment.reference || `Receipt ${payment.paymentNumber}`,
      sourceType: 'Payment',
      sourceId: payment.id,
      lines
    });
  }

  /**
   * Vendor Payment
   * Debit -> Creditors
   * Credit -> Cash OR Bank
   */
  postVendorPayment({ payment, creditorsAccountId, cashOrBankAccountId, date }) {
    const amount = Math.round((payment.amount + Number.EPSILON) * 100) / 100;
    const journalType = payment.method === 'Cash' ? 'Cash' : 'Bank';
    const paymentJournal = this.masters.getJournalByType(journalType);

    const lines = [
      { accountId: creditorsAccountId, partnerId: payment.partnerId, debit: amount, credit: 0 },
      { accountId: cashOrBankAccountId, partnerId: payment.partnerId, debit: 0, credit: amount }
    ];

    return this.postEntry({
      journalId: paymentJournal?.id,
      date: date || payment.paymentDate,
      reference: payment.reference || `Payment ${payment.paymentNumber}`,
      sourceType: 'Payment',
      sourceId: payment.id,
      lines
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { JournalEngine };
} else if (typeof window !== 'undefined') {
  window.JournalEngine = JournalEngine;
}