/**
 * Member 3 - Accounting Engine Automated Test Suite
 * Validates all 20 non-negotiable accounting requirements.
 * Executable via Node.js.
 */

const assert = require('assert');
const { Store } = require('../js/store.js');
const { MastersService, SEED_CONTACTS, SEED_PRODUCTS, SEED_ACCOUNTS, SEED_JOURNALS, SEED_ANALYTIC_ACCOUNTS, SEED_BUDGETS } = require('../js/member2-masters.js');
const { JournalEngine } = require('../modules/journal-entries/journal-engine.js');
const { PurchasesService } = require('../modules/purchases/purchases.js');
const { SalesService } = require('../modules/sales/sales.js');
const { PaymentsService } = require('../modules/payments/payments.js');
const { ReportsService } = require('../modules/reports/reports.js');

console.log('====================================================');
console.log('URBAN FURNITURE ACCOUNTING SYSTEM - VERIFICATION SUITE');
console.log('====================================================\n');

// 1. Setup fresh clean store
const store = new Store();
const masters = new MastersService(store);
const journalEngine = new JournalEngine(store, masters);
const purchasesService = new PurchasesService(store, masters, journalEngine);
const salesService = new SalesService(store, masters, journalEngine);
const paymentsService = new PaymentsService(store, masters, journalEngine);
const reportsService = new ReportsService(store, masters);

let passedCount = 0;
function test(name, fn) {
  try {
    fn();
    passedCount++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}`);
    console.error(`       Error: ${err.message}`);
    process.exit(1);
  }
}

// Global test variables
let createdPO = null;
let createdBill = null;
let createdSO = null;
let createdInvoice = null;
const initialChairStock = masters.getProductById('prod-office-chair').stock; // 15

// ----------------------------------------------------
// 1. Purchase Creation
// ----------------------------------------------------
test('1. Purchase Order Creation (Azure Furniture, 10 Office Chairs @ ₹2000)', () => {
  createdPO = purchasesService.createPurchaseOrder({
    vendorId: 'contact-azure',
    orderDate: '2026-09-01',
    lines: [
      {
        productId: 'prod-office-chair',
        analyticAccountId: 'ana-showroom',
        quantity: 10,
        unitPrice: 2000
      }
    ],
    notes: 'Initial showroom stock batch'
  });

  assert.strictEqual(createdPO.status, 'draft');
  assert.strictEqual(createdPO.totalAmount, 20000);
  assert.strictEqual(createdPO.vendorName, 'Azure Furniture');

  // Confirm PO
  purchasesService.confirmPurchaseOrder(createdPO.id);
  const updatedPO = purchasesService.getPurchases().find(p => p.id === createdPO.id);
  assert.strictEqual(updatedPO.status, 'confirmed');
});

// ----------------------------------------------------
// 2. Vendor Bill Conversion
// ----------------------------------------------------
test('2. Vendor Bill Conversion & Confirmation', () => {
  createdBill = purchasesService.createVendorBillFromPO({
    poId: createdPO.id,
    billDate: '2026-09-02',
    dueDate: '2026-09-15'
  });

  assert.strictEqual(createdBill.status, 'draft');
  assert.strictEqual(createdBill.totalAmount, 20000);
  assert.strictEqual(createdBill.balanceDue, 20000);

  // Confirm and Post Vendor Bill
  const { bill, journalEntry } = purchasesService.confirmVendorBill(createdBill.id);
  assert.strictEqual(bill.status, 'posted');
  assert.ok(bill.journalEntryId);
  assert.strictEqual(journalEntry.sourceType, 'VendorBill');
});

// ----------------------------------------------------
// 3. Purchase Journal
// ----------------------------------------------------
test('3. Purchase Journal Entry Correctness (Dr Purchases Expense ₹20k / Cr Creditors ₹20k)', () => {
  const entries = journalEngine.getEntries();
  const billEntry = entries.find(e => e.id === createdBill.journalEntryId || e.sourceId === createdBill.id);
  assert.ok(billEntry, 'Bill Journal Entry must exist');
  assert.strictEqual(billEntry.totalDebit, 20000);
  assert.strictEqual(billEntry.totalCredit, 20000);

  const debitLine = billEntry.lines.find(l => l.debit === 20000);
  const creditLine = billEntry.lines.find(l => l.credit === 20000);
  assert.strictEqual(debitLine.accountId, 'acc-purchase-expense');
  assert.strictEqual(creditLine.accountId, 'acc-creditors');
});

// ----------------------------------------------------
// 4. Stock Increase on Purchase
// ----------------------------------------------------
test('4. Stock Increase (Office Chairs should increase from 15 to 25)', () => {
  const chair = masters.getProductById('prod-office-chair');
  assert.strictEqual(chair.stock, initialChairStock + 10, 'Stock must increment by purchased qty');
});

// ----------------------------------------------------
// 5. Vendor Payment
// ----------------------------------------------------
test('5. Vendor Payment Registration via Bank (₹20,000 against Bill)', () => {
  const { payment, journalEntry, bill } = paymentsService.registerVendorPayment({
    billId: createdBill.id,
    method: 'Bank',
    paymentDate: '2026-09-03',
    reference: 'HDFC-NEFT-99281',
    amount: 20000
  });

  assert.strictEqual(payment.direction, 'OUTBOUND');
  assert.strictEqual(payment.amount, 20000);
  assert.strictEqual(bill.balanceDue, 0);
  assert.strictEqual(bill.status, 'paid');

  // Check Vendor Payment Journal Entry: Dr Creditors ₹20k / Cr Bank ₹20k
  assert.strictEqual(journalEntry.totalDebit, 20000);
  assert.strictEqual(journalEntry.totalCredit, 20000);
  const drCreditors = journalEntry.lines.find(l => l.debit === 20000);
  const crBank = journalEntry.lines.find(l => l.credit === 20000);
  assert.strictEqual(drCreditors.accountId, 'acc-creditors');
  assert.strictEqual(crBank.accountId, 'acc-bank');
});

// ----------------------------------------------------
// 6. Sales Creation & Tax Calculation
// ----------------------------------------------------
test('6. Sales Order Creation & Tax Calculation (Nimesh Pathak, 5 Chairs @ ₹3500, Tax 10%)', () => {
  createdSO = salesService.createSalesOrder({
    customerId: 'contact-nimesh',
    orderDate: '2026-09-04',
    lines: [
      {
        productId: 'prod-office-chair',
        analyticAccountId: 'ana-online',
        quantity: 5,
        unitPrice: 3500,
        taxRate: 10
      }
    ],
    notes: 'Customer order from website'
  });

  assert.strictEqual(createdSO.status, 'draft');
  assert.strictEqual(createdSO.subtotal, 17500);
  assert.strictEqual(createdSO.taxTotal, 1750);
  assert.strictEqual(createdSO.grandTotal, 19250);

  salesService.confirmSalesOrder(createdSO.id);
  const updatedSO = salesService.getSales().find(s => s.id === createdSO.id);
  assert.strictEqual(updatedSO.status, 'confirmed');
});

// ----------------------------------------------------
// 7. Customer Invoice
// ----------------------------------------------------
test('7. Customer Invoice Generation & Confirmation', () => {
  createdInvoice = salesService.createCustomerInvoiceFromSO({
    soId: createdSO.id,
    invoiceDate: '2026-09-04',
    dueDate: '2026-09-18'
  });

  assert.strictEqual(createdInvoice.status, 'draft');
  assert.strictEqual(createdInvoice.grandTotal, 19250);
  assert.strictEqual(createdInvoice.balanceDue, 19250);

  const { invoice, journalEntry } = salesService.confirmCustomerInvoice(createdInvoice.id);
  assert.strictEqual(invoice.status, 'posted');
  assert.ok(invoice.journalEntryId);
});

// ----------------------------------------------------
// 8. Sales Journal
// ----------------------------------------------------
test('8. Sales Journal Entry (Dr Debtors ₹19,250 / Cr Sales Income ₹17,500 / Cr Tax Payable ₹1,750)', () => {
  const entries = journalEngine.getEntries();
  const invEntry = entries.find(e => e.id === createdInvoice.journalEntryId || e.sourceId === createdInvoice.id);
  assert.ok(invEntry, 'Invoice Journal Entry must exist');
  assert.strictEqual(invEntry.totalDebit, 19250);
  assert.strictEqual(invEntry.totalCredit, 19250);

  const drDebtors = invEntry.lines.find(l => l.accountId === 'acc-debtors');
  const crIncome = invEntry.lines.find(l => l.accountId === 'acc-sales-income');
  const crTax = invEntry.lines.find(l => l.accountId === 'acc-tax-payable');

  assert.strictEqual(drDebtors.debit, 19250);
  assert.strictEqual(crIncome.credit, 17500);
  assert.strictEqual(crTax.credit, 1750);
});

// ----------------------------------------------------
// 9. Stock Decrease on Sale
// ----------------------------------------------------
test('9. Stock Decrease (Office Chairs should decrease from 25 to 20)', () => {
  const chair = masters.getProductById('prod-office-chair');
  assert.strictEqual(chair.stock, 20, 'Stock must decrement by sold quantity');
});

// ----------------------------------------------------
// 10. Customer Payment (Cash)
// ----------------------------------------------------
test('10. Customer Payment (Cash Receipt of ₹19,250)', () => {
  const { payment, journalEntry, invoice } = paymentsService.registerCustomerPayment({
    invoiceId: createdInvoice.id,
    method: 'Cash',
    paymentDate: '2026-09-05',
    reference: 'CASH-REC-001',
    amount: 19250
  });

  assert.strictEqual(payment.direction, 'INBOUND');
  assert.strictEqual(payment.amount, 19250);
  assert.strictEqual(invoice.balanceDue, 0);
  assert.strictEqual(invoice.status, 'paid');

  // Verify Payment Journal Entry: Dr Cash ₹19,250 / Cr Debtors ₹19,250
  assert.strictEqual(journalEntry.totalDebit, 19250);
  assert.strictEqual(journalEntry.totalCredit, 19250);
  const drCash = journalEntry.lines.find(l => l.debit === 19250);
  const crDebtors = journalEntry.lines.find(l => l.credit === 19250);
  assert.strictEqual(drCash.accountId, 'acc-cash');
  assert.strictEqual(crDebtors.accountId, 'acc-debtors');
});

// ----------------------------------------------------
// 11. Cash Balance Verification
// ----------------------------------------------------
test('11. Cash Balance Verification in Ledger (₹19,250 Dr)', () => {
  const { ledger } = reportsService.calculateLedger();
  assert.strictEqual(ledger['acc-cash'].balance, 19250);
});

// ----------------------------------------------------
// 12. Bank Balance Verification
// ----------------------------------------------------
test('12. Bank Balance Verification in Ledger (-₹20,000 Cr)', () => {
  const { ledger } = reportsService.calculateLedger();
  assert.strictEqual(ledger['acc-bank'].balance, -20000);
});

// ----------------------------------------------------
// 13. Accounts Receivable (Debtors) Settled
// ----------------------------------------------------
test('13. Accounts Receivable (Debtors) Balance Settled to ₹0', () => {
  const { ledger } = reportsService.calculateLedger();
  assert.strictEqual(ledger['acc-debtors'].balance, 0);
});

// ----------------------------------------------------
// 14. Accounts Payable (Creditors) Settled
// ----------------------------------------------------
test('14. Accounts Payable (Creditors) Balance Settled to ₹0', () => {
  const { ledger } = reportsService.calculateLedger();
  assert.strictEqual(ledger['acc-creditors'].balance, 0);
});

// ----------------------------------------------------
// 15. Profit & Loss Report Verification
// ----------------------------------------------------
test('15. Profit & Loss: Sales Income ₹17,500 - Purchases ₹20,000 = Net Loss -₹2,500', () => {
  const pl = reportsService.getProfitAndLoss();
  assert.strictEqual(pl.income.total, 17500);
  assert.strictEqual(pl.expenses.total, 20000);
  assert.strictEqual(pl.netProfit, -2500);
  assert.strictEqual(pl.isProfit, false);
});

// ----------------------------------------------------
// 16. Balance Sheet Equation Verification
// ----------------------------------------------------
test('16. Balance Sheet Invariant: Assets == Liabilities + Capital', () => {
  const bs = reportsService.getBalanceSheet();
  // Assets = Cash (19250) + Bank (-20000) = -750
  // Liabilities = Tax Payable (1750) + Creditors (0) = 1750
  // Capital = Base (0) + Net Profit (-2500) = -2500
  // Liabilities + Capital = 1750 + (-2500) = -750
  assert.strictEqual(bs.assets.total, -750);
  assert.strictEqual(bs.liabilities.total, 1750);
  assert.strictEqual(bs.capital.total, -2500);
  assert.strictEqual(bs.totalLiabilitiesAndCapital, -750);
  assert.strictEqual(bs.isBalanced, true);
});

// ----------------------------------------------------
// 17. Budget Report Integration
// ----------------------------------------------------
test('17. Budget Report: Showroom Setup 2026 (Planned ₹50,000, Actual ₹20,000, Variance ₹30,000)', () => {
  const budgetReports = reportsService.getBudgetReport();
  const showroomBudget = budgetReports.find(b => b.analyticAccountId === 'ana-showroom');
  assert.ok(showroomBudget, 'Showroom budget report must exist');
  assert.strictEqual(showroomBudget.plannedAmount, 50000);
  assert.strictEqual(showroomBudget.actualAmount, 20000);
  assert.strictEqual(showroomBudget.varianceAmount, 30000);
  assert.strictEqual(showroomBudget.remainingAmount, 30000);
  assert.strictEqual(showroomBudget.percentUsed, 40);
  assert.strictEqual(showroomBudget.status, 'on_track');
});

// ----------------------------------------------------
// 18. Stock Invariant: Reject Sale Exceeding Stock
// ----------------------------------------------------
test('18. Stock Invariant: Reject Sale of Goods exceeding available stock (attempt 999 chairs)', () => {
  const badSO = salesService.createSalesOrder({
    customerId: 'contact-nimesh',
    orderDate: '2026-09-05',
    lines: [
      {
        productId: 'prod-office-chair',
        quantity: 999,
        unitPrice: 3500
      }
    ]
  });

  assert.throws(
    () => {
      salesService.confirmSalesOrder(badSO.id);
    },
    /Insufficient stock/,
    'Must throw Insufficient stock error'
  );
});

// ----------------------------------------------------
// 19. Unbalanced Journal Entry Rejection & Rollback
// ----------------------------------------------------
test('19. Centralized Journal: Reject Unbalanced Candidate Entry (Dr 1000 / Cr 800)', () => {
  assert.throws(
    () => {
      journalEngine.postEntry({
        date: '2026-09-05',
        reference: 'Unbalanced Test',
        lines: [
          { accountId: 'acc-cash', debit: 1000, credit: 0 },
          { accountId: 'acc-sales-income', debit: 0, credit: 800 }
        ]
      });
    },
    /UNBALANCED/,
    'Must throw UNBALANCED error'
  );
});

// ----------------------------------------------------
// 20. Overpayment & Duplicate Payment Prevention
// ----------------------------------------------------
test('20. Payment Prevention: Reject payment exceeding balance or on already paid document', () => {
  assert.throws(
    () => {
      paymentsService.registerVendorPayment({
        billId: createdBill.id,
        method: 'Cash',
        amount: 500
      });
    },
    /status 'paid'|exceeds outstanding balance/,
    'Must reject payment on an already fully settled bill'
  );
});

console.log(`\n====================================================`);
console.log(`ALL ${passedCount} OF 20 TESTS PASSED SUCCESSFULLY!`);
console.log(`Accounting Invariants, Workflows, and Integrity Verified!`);
console.log(`====================================================`);