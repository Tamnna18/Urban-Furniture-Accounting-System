/**
 * Member 3 - Accounting Ledger & Reports Module
 * Calculates General Ledger, Profit & Loss, Balance Sheet, and Budget Variance Reports.
 * All numbers are 100% computed from journal entries and master data - Zero hardcoding.
 */

class ReportsService {
  constructor(storeInstance, mastersInstance) {
    this.store = storeInstance;
    this.masters = mastersInstance;
  }

  getJournalEntries() {
    return this.store.get('urban_journal_entries', []);
  }

  getBills() {
    return this.store.get('urban_bills', []);
  }

  /**
   * Calculates running balances for all accounts in CoA from posted journal lines.
   */
  calculateLedger(dateFilter = null) {
    const accounts = this.masters.getAccounts();
    const entries = this.getJournalEntries();

    const ledger = {};
    accounts.forEach(acc => {
      ledger[acc.id] = {
        account: acc,
        totalDebit: 0,
        totalCredit: 0,
        balance: 0,
        transactions: []
      };
    });

    let overallDebit = 0;
    let overallCredit = 0;

    entries.forEach(entry => {
      if (dateFilter) {
        if (dateFilter.startDate && entry.date < dateFilter.startDate) return;
        if (dateFilter.endDate && entry.date > dateFilter.endDate) return;
        if (dateFilter.year && !entry.date.startsWith(String(dateFilter.year))) return;
      }

      entry.lines.forEach(line => {
        const item = ledger[line.accountId];
        if (!item) return;

        const d = Number(line.debit) || 0;
        const c = Number(line.credit) || 0;

        item.totalDebit += d;
        item.totalCredit += c;
        overallDebit += d;
        overallCredit += c;

        item.transactions.push({
          date: entry.date,
          entryNumber: entry.entryNumber,
          reference: entry.reference,
          debit: d,
          credit: c
        });
      });
    });

    // Round and compute closing balances based on account classification
    accounts.forEach(acc => {
      const item = ledger[acc.id];
      item.totalDebit = Math.round((item.totalDebit + Number.EPSILON) * 100) / 100;
      item.totalCredit = Math.round((item.totalCredit + Number.EPSILON) * 100) / 100;

      if (acc.type === 'Asset' || acc.type === 'Expense') {
        // Normal Debit balance
        item.balance = Math.round(((item.totalDebit - item.totalCredit) + Number.EPSILON) * 100) / 100;
      } else {
        // Normal Credit balance (Liability, Capital, Income)
        item.balance = Math.round(((item.totalCredit - item.totalDebit) + Number.EPSILON) * 100) / 100;
      }
    });

    overallDebit = Math.round((overallDebit + Number.EPSILON) * 100) / 100;
    overallCredit = Math.round((overallCredit + Number.EPSILON) * 100) / 100;

    return {
      ledger,
      trialBalance: {
        totalDebit: overallDebit,
        totalCredit: overallCredit,
        isBalanced: Math.abs(overallDebit - overallCredit) < 0.001
      }
    };
  }

  /**
   * Generates Profit & Loss Statement:
   * Sales Income - Purchases/Expenses = Net Profit / Loss
   */
  getProfitAndLoss(dateFilter = null) {
    const { ledger } = this.calculateLedger(dateFilter);
    const incomeAccounts = [];
    const expenseAccounts = [];

    let totalIncome = 0;
    let totalExpenses = 0;

    Object.values(ledger).forEach(item => {
      if (item.account.type === 'Income') {
        totalIncome += item.balance;
        incomeAccounts.push({
          id: item.account.id,
          name: item.account.name,
          amount: item.balance
        });
      } else if (item.account.type === 'Expense') {
        totalExpenses += item.balance;
        expenseAccounts.push({
          id: item.account.id,
          name: item.account.name,
          amount: item.balance
        });
      }
    });

    totalIncome = Math.round((totalIncome + Number.EPSILON) * 100) / 100;
    totalExpenses = Math.round((totalExpenses + Number.EPSILON) * 100) / 100;
    const netProfit = Math.round(((totalIncome - totalExpenses) + Number.EPSILON) * 100) / 100;

    return {
      period: dateFilter?.year || 'All Time',
      income: {
        accounts: incomeAccounts,
        total: totalIncome
      },
      expenses: {
        accounts: expenseAccounts,
        total: totalExpenses
      },
      netProfit,
      isProfit: netProfit >= 0
    };
  }

  /**
   * Generates Balance Sheet:
   * Assets = Liabilities + Capital (including Net Profit transferred from P&L)
   */
  getBalanceSheet(dateFilter = null) {
    const { ledger } = this.calculateLedger(dateFilter);
    const pl = this.getProfitAndLoss(dateFilter);

    const assetAccounts = [];
    const liabilityAccounts = [];
    const capitalAccounts = [];

    let totalAssets = 0;
    let totalLiabilities = 0;
    let baseCapital = 0;

    Object.values(ledger).forEach(item => {
      if (item.account.type === 'Asset') {
        totalAssets += item.balance;
        assetAccounts.push({
          id: item.account.id,
          name: item.account.name,
          amount: item.balance
        });
      } else if (item.account.type === 'Liability') {
        totalLiabilities += item.balance;
        liabilityAccounts.push({
          id: item.account.id,
          name: item.account.name,
          amount: item.balance
        });
      } else if (item.account.type === 'Capital') {
        baseCapital += item.balance;
        capitalAccounts.push({
          id: item.account.id,
          name: item.account.name,
          amount: item.balance
        });
      }
    });

    totalAssets = Math.round((totalAssets + Number.EPSILON) * 100) / 100;
    totalLiabilities = Math.round((totalLiabilities + Number.EPSILON) * 100) / 100;
    baseCapital = Math.round((baseCapital + Number.EPSILON) * 100) / 100;

    // Capital includes Retained Earnings / Current Period Net Profit
    const totalCapital = Math.round(((baseCapital + pl.netProfit) + Number.EPSILON) * 100) / 100;
    const totalLiabilitiesAndCapital = Math.round(((totalLiabilities + totalCapital) + Number.EPSILON) * 100) / 100;
    const difference = Math.round((Math.abs(totalAssets - totalLiabilitiesAndCapital) + Number.EPSILON) * 100) / 100;
    const isBalanced = difference < 0.001;

    return {
      asOfDate: dateFilter?.endDate || new Date().toISOString().split('T')[0],
      assets: {
        accounts: assetAccounts,
        total: totalAssets
      },
      liabilities: {
        accounts: liabilityAccounts,
        total: totalLiabilities
      },
      capital: {
        accounts: capitalAccounts,
        baseTotal: baseCapital,
        currentNetProfit: pl.netProfit,
        total: totalCapital
      },
      totalLiabilitiesAndCapital,
      isBalanced,
      difference
    };
  }

  /**
   * Generates Budget Report:
   * Planned vs Actual by Analytic Account
   */
  getBudgetReport(period = null) {
    const budgets = this.masters.getBudgets();
    const bills = this.getBills();

    return budgets.map(budget => {
      const analyticAcc = this.masters.getAnalyticAccountById(budget.analyticAccountId);
      
      // Calculate actual expenses from posted bills tagged with this analytic account
      let actualSpent = 0;
      bills.forEach(bill => {
        if (bill.status === 'posted' || bill.status === 'paid') {
          if (period && !bill.billDate.startsWith(String(period))) return;

          bill.lines.forEach(line => {
            if (line.analyticAccountId === budget.analyticAccountId) {
              actualSpent += line.subtotal || line.amount || 0;
            }
          });
        }
      });

      actualSpent = Math.round((actualSpent + Number.EPSILON) * 100) / 100;
      const planned = budget.plannedAmount;
      const variance = Math.round(((planned - actualSpent) + Number.EPSILON) * 100) / 100;
      const remaining = variance;
      const percentUsed = planned > 0 ? Math.round(((actualSpent / planned) * 100) * 10) / 10 : 0;

      let status = 'on_track';
      if (percentUsed > 100) {
        status = 'exceeded';
      } else if (percentUsed > 80) {
        status = 'warning';
      }

      return {
        id: budget.id,
        name: budget.name,
        period: budget.period,
        responsible: budget.responsible,
        analyticAccountId: budget.analyticAccountId,
        analyticAccountName: analyticAcc ? analyticAcc.name : 'Unknown',
        plannedAmount: planned,
        actualAmount: actualSpent,
        varianceAmount: variance,
        remainingAmount: remaining,
        percentUsed,
        status
      };
    });
  }

  /**
   * Generates top dashboard KPIs
   */
  getDashboardKPIs() {
    const { ledger } = this.calculateLedger();
    const pl = this.getProfitAndLoss();

    let totalReceivables = 0;
    let totalPayables = 0;
    let cashBalance = 0;
    let bankBalance = 0;

    Object.values(ledger).forEach(item => {
      const name = item.account.name.toLowerCase();
      if (name.includes('debtor')) totalReceivables += item.balance;
      if (name.includes('creditor')) totalPayables += item.balance;
      if (name.includes('cash')) cashBalance += item.balance;
      if (name.includes('bank')) bankBalance += item.balance;
    });

    return {
      totalReceivables: Math.round((totalReceivables + Number.EPSILON) * 100) / 100,
      totalPayables: Math.round((totalPayables + Number.EPSILON) * 100) / 100,
      cashBalance: Math.round((cashBalance + Number.EPSILON) * 100) / 100,
      bankBalance: Math.round((bankBalance + Number.EPSILON) * 100) / 100,
      netProfit: pl.netProfit,
      salesRevenue: pl.income.total
    };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReportsService };
} else if (typeof window !== 'undefined') {
  window.ReportsService = ReportsService;
}