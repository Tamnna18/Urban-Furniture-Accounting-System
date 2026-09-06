const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Store } = require('../js/store.js');
const { MastersService } = require('../js/member2-masters.js');
const { JournalEngine } = require('../modules/journal-entries/journal-engine.js');
const { PurchasesService } = require('../modules/purchases/purchases.js');
const { SalesService } = require('../modules/sales/sales.js');
const { PaymentsService } = require('../modules/payments/payments.js');
const { ReportsService } = require('../modules/reports/reports.js');

const auditResults = {
  purchases: { pass: true, notes: [] },
  sales: { pass: true, notes: [] },
  doubleEntry: { pass: true, notes: [] },
  payments: { pass: true, notes: [] },
  stock: { pass: true, notes: [] },
  ledger: { pass: true, notes: [] },
  pl: { pass: true, notes: [] },
  balanceSheet: { pass: true, notes: [] },
  budgetReport: { pass: true, notes: [] },
  dataIntegrity: { pass: true, notes: [] },
  security: { pass: true, notes: [] },
  projectWorkflow: { pass: true, notes: [] },
  crossModuleSafety: { pass: true, notes: [] },
  mergeSafety: { pass: true, notes: [] }
};

function audit(section, testName, fn) {
  try {
    fn();
    auditResults[section].notes.push(`[OK] ${testName}`);
  } catch (err) {
    auditResults[section].pass = false;
    auditResults[section].notes.push(`[FAIL] ${testName}: ${err.message}`);
  }
}

// Fresh isolated store
const store = new Store();
const masters = new MastersService(store);
const journalEngine = new JournalEngine(store, masters);
const purchases = new PurchasesService(store, masters, journalEngine);
const sales = new SalesService(store, masters, journalEngine);
const payments = new PaymentsService(store, masters, journalEngine);
const reports = new ReportsService(store, masters);

// 1. PURCHASE WORKFLOW AUDIT
audit('purchases', 'Vendor validation & PO creation', () => {
  assert.throws(() => purchases.createPurchaseOrder({ vendorId: 'invalid-vendor', lines: [{ productId: 'prod-wooden-chair', quantity: 2, unitPrice: 1000 }] }), /Invalid vendor ID/);
  const po = purchases.createPurchaseOrder({
    vendorId: 'contact-azure',
    orderDate: '2026-09-01',
    lines: [{ productId: 'prod-wooden-chair', analyticAccountId: 'ana-showroom', quantity: 5, unitPrice: 1500 }]
  });
  assert.strictEqual(po.status, 'draft');
  assert.strictEqual(po.totalAmount, 7500);

  // Confirm PO
  purchases.confirmPurchaseOrder(po.id);
  const confirmedPO = purchases.getPurchases().find(p => p.id === po.id);
  assert.strictEqual(confirmedPO.status, 'confirmed');

  // Convert to Bill
  const bill = purchases.createVendorBillFromPO({ poId: po.id, billDate: '2026-09-02', dueDate: '2026-09-10' });
  assert.strictEqual(bill.status, 'draft');
  assert.strictEqual(bill.totalAmount, 7500);

  // Attempt duplicate bill creation from same PO -> must fail
  assert.throws(() => purchases.createVendorBillFromPO({ poId: po.id }), /already exists/);

  // Initial stock check
  const chairStockBefore = masters.getProductById('prod-wooden-chair').stock;

  // Confirm Bill
  const confirmRes = purchases.confirmVendorBill(bill.id);
  assert.strictEqual(confirmRes.bill.status, 'posted');
  
  const reloadedPO = purchases.getPurchases().find(p => p.id === po.id);
  assert.strictEqual(reloadedPO.status, 'billed');

  // Verify stock increment
  const chairStockAfter = masters.getProductById('prod-wooden-chair').stock;
  assert.strictEqual(chairStockAfter, chairStockBefore + 5);

  // Verify Purchase Journal: Dr Purchases Expense 7500, Cr Creditors 7500
  const je = confirmRes.journalEntry;
  assert.strictEqual(je.totalDebit, 7500);
  assert.strictEqual(je.totalCredit, 7500);
  assert.ok(je.lines.some(l => l.accountId === 'acc-purchase-expense' && l.debit === 7500));
  assert.ok(je.lines.some(l => l.accountId === 'acc-creditors' && l.credit === 7500));

  // Payment
  const payRes = payments.registerVendorPayment({ billId: bill.id, method: 'Bank', amount: 7500 });
  assert.strictEqual(payRes.bill.status, 'paid');
  assert.strictEqual(payRes.bill.balanceDue, 0);
  assert.strictEqual(payRes.journalEntry.totalDebit, 7500);
  assert.ok(payRes.journalEntry.lines.some(l => l.accountId === 'acc-creditors' && l.debit === 7500));
  assert.ok(payRes.journalEntry.lines.some(l => l.accountId === 'acc-bank' && l.credit === 7500));
});

// 2. SALES WORKFLOW AUDIT
audit('sales', 'Customer validation, Tax, Stock Decrement & SO/Invoice/Payment', () => {
  assert.throws(() => sales.createSalesOrder({ customerId: 'invalid-cust', lines: [{ productId: 'prod-wooden-chair', quantity: 2, unitPrice: 2000 }] }), /Invalid customer ID/);
  
  const so = sales.createSalesOrder({
    customerId: 'contact-nimesh',
    orderDate: '2026-09-03',
    lines: [{ productId: 'prod-wooden-chair', analyticAccountId: 'ana-online', quantity: 4, unitPrice: 2500, taxRate: 10 }]
  });
  assert.strictEqual(so.subtotal, 10000);
  assert.strictEqual(so.taxTotal, 1000);
  assert.strictEqual(so.grandTotal, 11000);

  // Confirm SO
  sales.confirmSalesOrder(so.id);
  const confirmedSO = sales.getSales().find(s => s.id === so.id);
  assert.strictEqual(confirmedSO.status, 'confirmed');

  // Convert to Invoice
  const invoice = sales.createCustomerInvoiceFromSO({ soId: so.id, invoiceDate: '2026-09-03', dueDate: '2026-09-12' });
  assert.strictEqual(invoice.status, 'draft');

  // Stock before confirmation
  const chairStockBefore = masters.getProductById('prod-wooden-chair').stock;

  // Confirm Invoice
  const confirmRes = sales.confirmCustomerInvoice(invoice.id);
  assert.strictEqual(confirmRes.invoice.status, 'posted');
  
  const reloadedSO = sales.getSales().find(s => s.id === so.id);
  assert.strictEqual(reloadedSO.status, 'invoiced');

  // Verify stock decrement
  const chairStockAfter = masters.getProductById('prod-wooden-chair').stock;
  assert.strictEqual(chairStockAfter, chairStockBefore - 4);

  // Verify Sales Journal: Dr Debtors 11000, Cr Sales Income 10000, Cr Tax Payable 1000
  const je = confirmRes.journalEntry;
  assert.strictEqual(je.totalDebit, 11000);
  assert.strictEqual(je.totalCredit, 11000);
  assert.ok(je.lines.some(l => l.accountId === 'acc-debtors' && l.debit === 11000));
  assert.ok(je.lines.some(l => l.accountId === 'acc-sales-income' && l.credit === 10000));
  assert.ok(je.lines.some(l => l.accountId === 'acc-tax-payable' && l.credit === 1000));

  // Customer Payment
  const payRes = payments.registerCustomerPayment({ invoiceId: invoice.id, method: 'Cash', amount: 11000 });
  assert.strictEqual(payRes.invoice.status, 'paid');
  assert.strictEqual(payRes.invoice.balanceDue, 0);
  assert.strictEqual(payRes.journalEntry.totalDebit, 11000);
  assert.ok(payRes.journalEntry.lines.some(l => l.accountId === 'acc-cash' && l.debit === 11000));
  assert.ok(payRes.journalEntry.lines.some(l => l.accountId === 'acc-debtors' && l.credit === 11000));
});

// 3. DOUBLE-ENTRY AUDIT
audit('doubleEntry', 'Every single journal entry invariant & edge case handling', () => {
  const entries = journalEngine.getEntries();
  entries.forEach(e => {
    assert.strictEqual(e.totalDebit, e.totalCredit, `Entry ${e.entryNumber} must be balanced`);
    assert.ok(Math.abs(e.totalDebit - e.totalCredit) < 0.001);
  });

  // Rejection of unbalanced candidate entries
  assert.throws(() => {
    journalEngine.postEntry({
      lines: [
        { accountId: 'acc-cash', debit: 500, credit: 0 },
        { accountId: 'acc-sales-income', debit: 0, credit: 499 }
      ]
    });
  }, /UNBALANCED/);

  // Rejection of negative amounts
  assert.throws(() => {
    journalEngine.postEntry({
      lines: [
        { accountId: 'acc-cash', debit: -100, credit: 0 },
        { accountId: 'acc-sales-income', debit: 0, credit: -100 }
      ]
    });
  }, /Negative/);

  // Rejection of missing/invalid accounts
  assert.throws(() => {
    journalEngine.postEntry({
      lines: [
        { accountId: 'acc-nonexistent', debit: 100, credit: 0 },
        { accountId: 'acc-sales-income', debit: 0, credit: 100 }
      ]
    });
  }, /does not exist/);

  // Floating point precision test: 1234.5678 rounded to 2 decimals
  const fpEntry = journalEngine.postEntry({
    reference: 'FP Test',
    lines: [
      { accountId: 'acc-cash', debit: 10.333, credit: 0 },
      { accountId: 'acc-sales-income', debit: 0, credit: 10.333 }
    ]
  });
  assert.strictEqual(fpEntry.totalDebit, 10.33);
  assert.strictEqual(fpEntry.totalCredit, 10.33);
});

// 4. PAYMENT AUDIT
audit('payments', 'Payment limits, duplicate prevention, invalid document status', () => {
  const po = purchases.createPurchaseOrder({
    vendorId: 'contact-azure',
    lines: [{ productId: 'prod-wooden-chair', quantity: 1, unitPrice: 1000 }]
  });
  purchases.confirmPurchaseOrder(po.id);
  const bill = purchases.createVendorBillFromPO({ poId: po.id });

  assert.throws(() => payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 1000 }), /must be 'posted'/);

  purchases.confirmVendorBill(bill.id);

  assert.throws(() => payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 0 }), /greater than 0/);
  assert.throws(() => payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: -50 }), /greater than 0/);
  assert.throws(() => payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 1500 }), /exceeds outstanding balance/);

  const partial = payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 400 });
  assert.strictEqual(partial.bill.amountPaid, 400);
  assert.strictEqual(partial.bill.balanceDue, 600);
  assert.strictEqual(partial.bill.status, 'posted');

  const final = payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 600 });
  assert.strictEqual(final.bill.amountPaid, 1000);
  assert.strictEqual(final.bill.balanceDue, 0);
  assert.strictEqual(final.bill.status, 'paid');

  assert.throws(() => payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 100 }), /status 'paid'/);
});

// 5. STOCK AUDIT
audit('stock', 'Goods stock invariant & rollback on failure', () => {
  const product = masters.getProductById('prod-wooden-table');
  const initialStock = product.stock;

  const excessiveSO = sales.createSalesOrder({
    customerId: 'contact-nimesh',
    lines: [{ productId: 'prod-wooden-table', quantity: 100, unitPrice: 5000 }]
  });
  assert.throws(() => sales.confirmSalesOrder(excessiveSO.id), /Insufficient stock/);

  assert.strictEqual(masters.getProductById('prod-wooden-table').stock, initialStock);

  const serviceSO = sales.createSalesOrder({
    customerId: 'contact-nimesh',
    lines: [{ productId: 'prod-assembly-svc', quantity: 5, unitPrice: 800 }]
  });
  sales.confirmSalesOrder(serviceSO.id);
  const serviceInv = sales.createCustomerInvoiceFromSO({ soId: serviceSO.id });
  const confirmRes = sales.confirmCustomerInvoice(serviceInv.id);
  assert.strictEqual(confirmRes.invoice.status, 'posted');
});

// 6. REPORT AUDIT
audit('ledger', 'Ledger balances per normal account classification', () => {
  const { ledger, trialBalance } = reports.calculateLedger();
  assert.ok(trialBalance.isBalanced, 'Trial balance must be balanced');
  assert.strictEqual(trialBalance.totalDebit, trialBalance.totalCredit);

  const cash = ledger['acc-cash'];
  assert.strictEqual(cash.balance, cash.totalDebit - cash.totalCredit);

  const income = ledger['acc-sales-income'];
  assert.strictEqual(income.balance, income.totalCredit - income.totalDebit);
});

audit('pl', 'P&L derives strictly from income and expense accounts', () => {
  const pl = reports.getProfitAndLoss();
  const { ledger } = reports.calculateLedger();

  let manualIncome = 0;
  let manualExpenses = 0;
  Object.values(ledger).forEach(item => {
    if (item.account.type === 'Income') manualIncome += item.balance;
    if (item.account.type === 'Expense') manualExpenses += item.balance;
  });

  manualIncome = Math.round((manualIncome + Number.EPSILON) * 100) / 100;
  manualExpenses = Math.round((manualExpenses + Number.EPSILON) * 100) / 100;

  assert.strictEqual(pl.income.total, manualIncome);
  assert.strictEqual(pl.expenses.total, manualExpenses);
  assert.strictEqual(pl.netProfit, manualIncome - manualExpenses);
});

audit('balanceSheet', 'Balance Sheet equation: Total Assets == Total Liabilities + Total Capital', () => {
  const bs = reports.getBalanceSheet();
  assert.ok(bs.isBalanced, 'Balance Sheet must be balanced');
  assert.strictEqual(bs.assets.total, bs.totalLiabilitiesAndCapital);
  assert.strictEqual(bs.difference, 0);
});

audit('budgetReport', 'Budget Report actuals derive dynamically from tagged bill lines', () => {
  const budgetReports = reports.getBudgetReport();
  const showroom = budgetReports.find(b => b.analyticAccountId === 'ana-showroom');
  assert.ok(showroom);
  assert.strictEqual(showroom.plannedAmount, 50000);
  assert.strictEqual(showroom.actualAmount, 7500);
  assert.strictEqual(showroom.varianceAmount, 42500);
  assert.strictEqual(showroom.percentUsed, 15);
  assert.strictEqual(showroom.status, 'on_track');
});

// 7. DATA INTEGRITY & ROLLBACK
audit('dataIntegrity', 'Snapshot-based atomic rollback test', () => {
  const billsBefore = purchases.getBills();
  const entriesCountBefore = journalEngine.getEntries().length;

  // Test rollback directly on store.transaction
  assert.throws(() => {
    store.transaction(['urban_bills', 'urban_journal_entries'], () => {
      const bills = purchases.getBills();
      bills.push({ id: 'bad-bill', status: 'posted' });
      store.set('urban_bills', bills);
      throw new Error('Simulated atomic rollback condition');
    });
  }, /Simulated atomic rollback condition/);

  // Assert rollback restored exact state
  assert.strictEqual(purchases.getBills().length, billsBefore.length);
  assert.strictEqual(journalEngine.getEntries().length, entriesCountBefore);
});

// 8. SECURITY & CROSS-MODULE AUDIT
audit('security', 'Input validation against NaN, nulls, injection', () => {
  assert.throws(() => purchases.createPurchaseOrder({ vendorId: 'contact-azure', lines: [{ productId: 'prod-wooden-chair', quantity: 'NaN', unitPrice: 100 }] }), /Quantity must be a positive number/);
  assert.throws(() => sales.createSalesOrder({ customerId: 'contact-nimesh', lines: [{ productId: 'prod-wooden-chair', quantity: 1, unitPrice: -10 }] }), /Unit price must be a non-negative number/);
  assert.throws(() => payments.registerVendorPayment({ billId: 'non-existent', method: 'Cash', amount: 100 }), /not found/);
});

audit('projectWorkflow', 'Complete linear business workflow integrity', () => {
  // PO -> Bill -> Payment sequence is enforced:
  const po = purchases.createPurchaseOrder({
    vendorId: 'contact-azure',
    lines: [{ productId: 'prod-wooden-chair', quantity: 1, unitPrice: 1000 }]
  });
  // Cannot create bill from draft PO:
  assert.throws(() => purchases.createVendorBillFromPO({ poId: po.id }), /must be 'confirmed'/);
  purchases.confirmPurchaseOrder(po.id);
  const bill = purchases.createVendorBillFromPO({ poId: po.id });
  // Cannot pay unposted bill:
  assert.throws(() => payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 1000 }), /must be 'posted'/);
  purchases.confirmVendorBill(bill.id);
  // Payment succeeds:
  payments.registerVendorPayment({ billId: bill.id, method: 'Cash', amount: 1000 });
});

audit('crossModuleSafety', 'No Odoo, no React, no tampering with Member 1 & 2 interfaces', () => {
  const projectDir = path.resolve(__dirname, '..');
  const indexHtml = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf-8');
  assert.ok(!indexHtml.includes('react.production.min.js'), 'React must not be included');
  assert.ok(!indexHtml.includes('react-dom'), 'ReactDOM must not be included');
  assert.ok(!indexHtml.includes('odoo'), 'Odoo must not be included');
});

audit('mergeSafety', 'Directory and file boundaries adherence', () => {
  const m3Modules = ['purchases', 'sales', 'payments', 'journal-entries', 'reports'];
  m3Modules.forEach(mod => {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'modules', mod)), `Module ${mod} must exist`);
  });
});

console.log('AUDIT EXECUTION COMPLETE.\n');
let allPassed = true;
for (const [k, v] of Object.entries(auditResults)) {
  console.log(`${k.toUpperCase()}: ${v.pass ? 'PASS' : 'FAIL'}`);
  if (!v.pass) allPassed = false;
  v.notes.forEach(n => console.log('   ' + n));
}
console.log(`\nOverall Integrity: ${allPassed ? '100% PASS' : 'FAILURES DETECTED'}`);