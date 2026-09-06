const express = require('express');
const router = express.Router();
const { getPool } = require('../config/db');

// Helper to compute account balances from posted journal entries
async function computeLedgerBalances(pool) {
  const [accounts] = await pool.query('SELECT * FROM accounts');
  const ledger = {};

  for (const acc of accounts) {
    ledger[acc.id] = {
      account: {
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type
      },
      totalDebit: 0,
      totalCredit: 0,
      balance: 0
    };
  }

  const [lines] = await pool.query(`
    SELECT jel.account_id, jel.debit, jel.credit 
    FROM journal_entry_lines jel
    JOIN journal_entries je ON jel.entry_id = je.id
    WHERE je.status = 'posted'
  `);

  for (const l of lines) {
    if (ledger[l.account_id]) {
      ledger[l.account_id].totalDebit += Number(l.debit || 0);
      ledger[l.account_id].totalCredit += Number(l.credit || 0);
    }
  }

  let totalDebitAll = 0;
  let totalCreditAll = 0;

  for (const accId of Object.keys(ledger)) {
    const item = ledger[accId];
    item.totalDebit = Math.round((item.totalDebit + Number.EPSILON) * 100) / 100;
    item.totalCredit = Math.round((item.totalCredit + Number.EPSILON) * 100) / 100;

    totalDebitAll += item.totalDebit;
    totalCreditAll += item.totalCredit;

    // Normal Balances: Asset & Expense = Debit - Credit; Liability, Equity, Income = Credit - Debit
    if (item.account.type === 'Asset' || item.account.type === 'Expense') {
      item.balance = item.totalDebit - item.totalCredit;
    } else {
      item.balance = item.totalCredit - item.totalDebit;
    }
    item.balance = Math.round((item.balance + Number.EPSILON) * 100) / 100;
  }

  return {
    ledger,
    trialBalance: {
      totalDebit: Math.round((totalDebitAll + Number.EPSILON) * 100) / 100,
      totalCredit: Math.round((totalCreditAll + Number.EPSILON) * 100) / 100,
      isBalanced: Math.abs(totalDebitAll - totalCreditAll) < 0.01
    }
  };
}

// --- GET KPIs ---
router.get('/kpis', async (req, res) => {
  try {
    const pool = getPool();
    const { ledger } = await computeLedgerBalances(pool);

    const [pos] = await pool.query('SELECT COUNT(*) as cnt FROM purchase_orders');
    const [bills] = await pool.query('SELECT COUNT(*) as cnt FROM bills');
    const [sos] = await pool.query('SELECT COUNT(*) as cnt FROM sales_orders');
    const [invs] = await pool.query('SELECT COUNT(*) as cnt FROM invoices');

    let totalIncome = 0;
    let totalExpense = 0;
    Object.values(ledger).forEach(item => {
      if (item.account.type === 'Income') totalIncome += item.balance;
      if (item.account.type === 'Expense') totalExpense += item.balance;
    });

    const netProfit = totalIncome - totalExpense;
    const cashBalance = ledger['acc-cash'] ? ledger['acc-cash'].balance : 0;
    const bankBalance = ledger['acc-bank'] ? ledger['acc-bank'].balance : 0;
    const debtorsBalance = ledger['acc-debtors'] ? ledger['acc-debtors'].balance : 0;
    const creditorsBalance = ledger['acc-creditors'] ? ledger['acc-creditors'].balance : 0;

    res.json({
      success: true,
      data: {
        totalIncome,
        totalExpense,
        netProfit,
        cashBalance,
        bankBalance,
        debtorsBalance,
        creditorsBalance,
        counts: {
          purchaseOrders: pos[0].cnt,
          vendorBills: bills[0].cnt,
          salesOrders: sos[0].cnt,
          customerInvoices: invs[0].cnt
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- GET Profit & Loss ---
router.get('/pl', async (req, res) => {
  try {
    const pool = getPool();
    const { ledger } = await computeLedgerBalances(pool);

    const incomeAccounts = [];
    const expenseAccounts = [];
    let totalIncome = 0;
    let totalExpense = 0;

    Object.values(ledger).forEach(item => {
      if (item.account.type === 'Income') {
        incomeAccounts.push({ accountId: item.account.id, name: item.account.name, code: item.account.code, balance: item.balance });
        totalIncome += item.balance;
      } else if (item.account.type === 'Expense') {
        expenseAccounts.push({ accountId: item.account.id, name: item.account.name, code: item.account.code, balance: item.balance });
        totalExpense += item.balance;
      }
    });

    totalIncome = Math.round((totalIncome + Number.EPSILON) * 100) / 100;
    totalExpense = Math.round((totalExpense + Number.EPSILON) * 100) / 100;
    const netProfit = Math.round((totalIncome - totalExpense + Number.EPSILON) * 100) / 100;

    res.json({
      success: true,
      data: {
        income: { accounts: incomeAccounts, total: totalIncome },
        expenses: { accounts: expenseAccounts, total: totalExpense },
        netProfit,
        isProfit: netProfit >= 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- GET Balance Sheet ---
router.get('/balance-sheet', async (req, res) => {
  try {
    const pool = getPool();
    const { ledger } = await computeLedgerBalances(pool);

    const assetAccounts = [];
    const liabilityAccounts = [];
    const equityAccounts = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let baseCapital = 0;
    let totalIncome = 0;
    let totalExpense = 0;

    Object.values(ledger).forEach(item => {
      if (item.account.type === 'Asset') {
        assetAccounts.push({ accountId: item.account.id, name: item.account.name, code: item.account.code, balance: item.balance });
        totalAssets += item.balance;
      } else if (item.account.type === 'Liability') {
        liabilityAccounts.push({ accountId: item.account.id, name: item.account.name, code: item.account.code, balance: item.balance });
        totalLiabilities += item.balance;
      } else if (item.account.type === 'Equity') {
        equityAccounts.push({ accountId: item.account.id, name: item.account.name, code: item.account.code, balance: item.balance });
        baseCapital += item.balance;
      } else if (item.account.type === 'Income') {
        totalIncome += item.balance;
      } else if (item.account.type === 'Expense') {
        totalExpense += item.balance;
      }
    });

    const netProfit = Math.round((totalIncome - totalExpense + Number.EPSILON) * 100) / 100;
    const totalCapital = Math.round((baseCapital + netProfit + Number.EPSILON) * 100) / 100;
    totalAssets = Math.round((totalAssets + Number.EPSILON) * 100) / 100;
    totalLiabilities = Math.round((totalLiabilities + Number.EPSILON) * 100) / 100;

    const totalLiabilitiesAndCapital = Math.round((totalLiabilities + totalCapital + Number.EPSILON) * 100) / 100;
    const difference = Math.round((totalAssets - totalLiabilitiesAndCapital + Number.EPSILON) * 100) / 100;
    const isBalanced = Math.abs(difference) < 0.01;

    res.json({
      success: true,
      data: {
        assets: { accounts: assetAccounts, total: totalAssets },
        liabilities: { accounts: liabilityAccounts, total: totalLiabilities },
        capital: { accounts: equityAccounts, baseCapital, netProfit, total: totalCapital },
        totalLiabilitiesAndCapital,
        difference,
        isBalanced
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- GET Budget Variance Report ---
router.get('/budget-variance', async (req, res) => {
  try {
    const pool = getPool();
    const [budgets] = await pool.query('SELECT * FROM budgets');
    const report = [];

    for (const b of budgets) {
      const [anRows] = await pool.query('SELECT * FROM analytic_accounts WHERE id = ?', [b.analytic_account_id]);
      const analyticName = anRows.length > 0 ? anRows[0].name : 'General';

      const [actualRows] = await pool.query(`
        SELECT SUM(bl.subtotal) as actual_sum
        FROM bill_lines bl
        JOIN bills bll ON bl.bill_id = bll.id
        WHERE bl.analytic_account_id = ? AND bll.status = 'posted'
      `, [b.analytic_account_id]);

      const actualAmount = Math.round((Number(actualRows[0]?.actual_sum || 0) + Number.EPSILON) * 100) / 100;
      const plannedAmount = Number(b.planned_amount || 0);
      const varianceAmount = Math.round((plannedAmount - actualAmount + Number.EPSILON) * 100) / 100;
      const remainingAmount = varianceAmount;
      const percentUsed = plannedAmount > 0 ? Math.round((actualAmount / plannedAmount) * 100 * 100) / 100 : 0;
      const status = actualAmount <= plannedAmount ? 'on_track' : 'over_budget';

      report.push({
        id: b.id,
        name: b.name,
        analyticAccountId: b.analytic_account_id,
        analyticAccountName: analyticName,
        plannedAmount,
        actualAmount,
        varianceAmount,
        remainingAmount,
        percentUsed,
        status,
        responsiblePerson: b.responsible_person
      });
    }

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
