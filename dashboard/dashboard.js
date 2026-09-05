/* ==========================================================================
   Dashboard Module Controller
   Frontend Foundation - Member 1
   ========================================================================== */

(function() {
  'use strict';

  window.App = window.App || {};

  const DashboardModule = {
    title: 'Dashboard',

    mount: function(container) {
      // 1. Render Dashboard Structure
      container.innerHTML = this._getTemplate();

      // 2. Load Data & Bind UI Components
      this._renderMetrics();
      this._renderWorkflow();
      this._renderTransactions();
      this._renderQuickActions();
      this._renderMasterSummary();

      // 3. Attach Event Listeners
      this._bindEvents(container);

      // Initialize any interactive UI controls (tabs/dropdowns)
      if (window.App.UI && typeof window.App.UI.initInteractiveComponents === 'function') {
        window.App.UI.initInteractiveComponents(container);
      }
    },

    unmount: function() {
      // Clean up event listeners if any
      console.log('[DashboardModule] Unmounted cleanly.');
    },

    _renderMetrics: function() {
      const data = window.App.DataStore.getMetrics();
      const fmt = window.App.DataStore.formatCurrency;

      // 7 Core Metrics Binding
      this._setVal('val-total-sales', fmt(data.totalSales.amount), 'trend-sales', data.totalSales.trend, 'sub-sales', data.totalSales.period);
      this._setVal('val-total-purchases', fmt(data.totalPurchases.amount), 'trend-purchases', data.totalPurchases.trend, 'sub-purchases', data.totalPurchases.period);
      this._setVal('val-cash-balance', fmt(data.cashBalance.amount), 'trend-cash', data.cashBalance.trend, 'sub-cash', data.cashBalance.period);
      this._setVal('val-bank-balance', fmt(data.bankBalance.amount), 'trend-bank', data.bankBalance.trend, 'sub-bank', data.bankBalance.period);
      this._setVal('val-receivables', fmt(data.receivables.amount), 'trend-receivables', data.receivables.trend, 'sub-receivables', data.receivables.period);
      this._setVal('val-payables', fmt(data.payables.amount), 'trend-payables', data.payables.trend, 'sub-payables', data.payables.period);
      this._setVal('val-net-profit', fmt(data.netProfit.amount), 'trend-net-profit', data.netProfit.trend, 'sub-net-profit', data.netProfit.period);
    },

    _setVal: function(valId, valText, trendId, trendText, subId, subText) {
      const v = document.getElementById(valId);
      const t = document.getElementById(trendId);
      const s = document.getElementById(subId);
      if (v) v.innerText = valText;
      if (t) t.innerText = trendText;
      if (s) s.innerText = subText;
    },

    _renderWorkflow: function() {
      const steps = window.App.DataStore.getWorkflowOverview();
      const container = document.getElementById('dashboard-workflow-container');
      if (!container) return;

      container.innerHTML = steps.map(step => `
        <div class="dashboard-workflow-step">
          <span class="dashboard-workflow-step__num">Step 0${step.step}</span>
          <div class="dashboard-workflow-step__title">${step.title}</div>
          <div class="dashboard-workflow-step__status">${step.status}</div>
          <div class="dashboard-workflow-step__count">${step.count}</div>
        </div>
      `).join('');
    },

    _renderTransactions: function() {
      const txns = window.App.DataStore.getRecentTransactions();
      const tbody = document.getElementById('dashboard-transactions-body');
      const fmt = window.App.DataStore.formatCurrency;
      if (!tbody) return;

      tbody.innerHTML = txns.map(tx => {
        let badgeClass = 'app-badge--secondary';
        if (tx.status === 'Paid' || tx.status === 'Reconciled') badgeClass = 'app-badge--success';
        if (tx.status === 'Posted') badgeClass = 'app-badge--primary';
        if (tx.status === 'Pending Review') badgeClass = 'app-badge--warning';

        return `
          <tr>
            <td style="white-space: nowrap; color: var(--text-secondary);">${tx.date}</td>
            <td><strong>${tx.description}</strong></td>
            <td><span class="app-badge app-badge--outline">${tx.module}</span></td>
            <td><code>${tx.reference}</code></td>
            <td class="app-text-right app-num ${tx.type === 'credit' ? 'app-text-success' : 'app-text-terracotta'} font-semibold">
              ${tx.type === 'credit' ? '+' : '-'}${fmt(tx.amount)}
            </td>
            <td><span class="app-badge ${badgeClass}"><span class="app-badge__dot"></span> ${tx.status}</span></td>
          </tr>
        `;
      }).join('');
    },

    _renderQuickActions: function() {
      const actions = window.App.DataStore.getQuickActions();
      const container = document.getElementById('dashboard-quick-actions');
      if (!container) return;

      container.innerHTML = actions.map(act => `
        <button class="app-btn app-btn--secondary" style="justify-content: flex-start; width: 100%; text-align: left;" onclick="App.Navigation.navigateTo('${act.actionModule}')">
          <span style="font-size: 1.1rem; margin-right: 6px;">${act.icon}</span>
          ${act.label}
        </button>
      `).join('');
    },

    _renderMasterSummary: function() {
      const summary = window.App.DataStore.getMasterDataSummary();
      const container = document.getElementById('dashboard-master-summary');
      if (!container) return;

      container.innerHTML = `
        <div class="dashboard-master-item">
          <span class="dashboard-master-item__val">${summary.contactsCount}</span>
          <span class="dashboard-master-item__lbl">Active Contacts</span>
        </div>
        <div class="dashboard-master-item">
          <span class="dashboard-master-item__val">${summary.productsCount}</span>
          <span class="dashboard-master-item__lbl">Listed Products</span>
        </div>
        <div class="dashboard-master-item">
          <span class="dashboard-master-item__val">${summary.budgetsCount}</span>
          <span class="dashboard-master-item__lbl">Budgets</span>
        </div>
        <div class="dashboard-master-item">
          <span class="dashboard-master-item__val">${summary.analyticAccountsCount}</span>
          <span class="dashboard-master-item__lbl">Analytic Accounts</span>
        </div>
      `;
    },

    _bindEvents: function(container) {
      const refreshBtn = container.querySelector('#dashboard-refresh-btn');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          this._renderMetrics();
          this._renderTransactions();
          window.App.UI.Toast.show({ message: 'Dashboard metrics refreshed.', type: 'success' });
        });
      }

      const quickInvoiceBtn = container.querySelector('#dashboard-quick-invoice-btn');
      if (quickInvoiceBtn) {
        quickInvoiceBtn.addEventListener('click', () => {
          window.App.UI.Modal.open({
            title: 'Quick Invoice Draft',
            content: `
              <div class="app-form-group">
                <label class="app-label">Customer Name</label>
                <input class="app-input" type="text" placeholder="Select customer contact...">
              </div>
              <div class="app-form-group">
                <label class="app-label">Invoice Amount</label>
                <input class="app-input" type="number" placeholder="0.00">
              </div>
            `,
            confirmText: 'Create Draft',
            onConfirm: function() {
              window.App.UI.Toast.show({ message: 'Invoice Draft Created!', type: 'success' });
            }
          });
        });
      }
    },

    _getTemplate: function() {
      return `
        <div class="dashboard-module">

          <div class="app-section-header">
            <div class="app-section-header__title-group">
              <h1 class="app-h1">Executive Accounting Dashboard</h1>
              <p class="app-card__subtitle">Real-time overview of financial performance, liquidity, and operational metrics.</p>
            </div>
            <div class="app-section-header__actions">
              <button class="app-btn app-btn--secondary" id="dashboard-refresh-btn">
                <span>🔄</span> Refresh Data
              </button>
              <button class="app-btn app-btn--primary" id="dashboard-quick-invoice-btn">
                <span>➕</span> New Invoice
              </button>
            </div>
          </div>

          <div class="app-stat-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-lg); margin-bottom: var(--space-xl);">
            
            <div class="app-stat-card" id="kpi-sales">
              <div class="app-stat-card__top">
                <span class="app-stat-card__label">Total Sales</span>
                <div class="app-stat-card__icon app-stat-card__icon--terracotta">📈</div>
              </div>
              <div class="app-stat-card__value app-num" id="val-total-sales">$0.00</div>
              <div class="app-flex app-items-center app-gap-xs">
                <span class="app-stat-card__trend app-stat-card__trend--up" id="trend-sales">+0.0%</span>
                <span class="app-stat-card__subtext" id="sub-sales">vs last period</span>
              </div>
            </div>

            <div class="app-stat-card" id="kpi-purchases">
              <div class="app-stat-card__top">
                <span class="app-stat-card__label">Total Purchases</span>
                <div class="app-stat-card__icon app-stat-card__icon--dark">🛒</div>
              </div>
              <div class="app-stat-card__value app-num" id="val-total-purchases">$0.00</div>
              <div class="app-flex app-items-center app-gap-xs">
                <span class="app-stat-card__trend app-stat-card__trend--neutral" id="trend-purchases">0.0%</span>
                <span class="app-stat-card__subtext" id="sub-purchases">vs last period</span>
              </div>
            </div>

            <div class="app-stat-card" id="kpi-cash">
              <div class="app-stat-card__top">
                <span class="app-stat-card__label">Cash Balance</span>
                <div class="app-stat-card__icon app-stat-card__icon--olive">💵</div>
              </div>
              <div class="app-stat-card__value app-num" id="val-cash-balance">$0.00</div>
              <div class="app-flex app-items-center app-gap-xs">
                <span class="app-stat-card__trend app-stat-card__trend--up" id="trend-cash">Healthy</span>
                <span class="app-stat-card__subtext" id="sub-cash">Liquidity Ratio</span>
              </div>
            </div>

            <div class="app-stat-card" id="kpi-bank">
              <div class="app-stat-card__top">
                <span class="app-stat-card__label">Bank Balance</span>
                <div class="app-stat-card__icon app-stat-card__icon--olive">🏛️</div>
              </div>
              <div class="app-stat-card__value app-num" id="val-bank-balance">$0.00</div>
              <div class="app-flex app-items-center app-gap-xs">
                <span class="app-stat-card__trend app-stat-card__trend--up" id="trend-bank">Reconciled</span>
                <span class="app-stat-card__subtext" id="sub-bank">Active Accounts</span>
              </div>
            </div>

            <div class="app-stat-card" id="kpi-receivables">
              <div class="app-stat-card__top">
                <span class="app-stat-card__label">Receivables</span>
                <div class="app-stat-card__icon app-stat-card__icon--brown">📥</div>
              </div>
              <div class="app-stat-card__value app-num" id="val-receivables">$0.00</div>
              <div class="app-flex app-items-center app-gap-xs">
                <span class="app-stat-card__trend app-stat-card__trend--down" id="trend-receivables">Pending</span>
                <span class="app-stat-card__subtext" id="sub-receivables">Outstanding</span>
              </div>
            </div>

            <div class="app-stat-card" id="kpi-payables">
              <div class="app-stat-card__top">
                <span class="app-stat-card__label">Payables</span>
                <div class="app-stat-card__icon app-stat-card__icon--terracotta">📤</div>
              </div>
              <div class="app-stat-card__value app-num" id="val-payables">$0.00</div>
              <div class="app-flex app-items-center app-gap-xs">
                <span class="app-stat-card__trend app-stat-card__trend--neutral" id="trend-payables">Due</span>
                <span class="app-stat-card__subtext" id="sub-payables">Bills Pending</span>
              </div>
            </div>

            <div class="app-stat-card" id="kpi-net-profit" style="grid-column: span 1 / -1; background: linear-gradient(135deg, #FFFFFF, var(--warm-white)); border-left: 4px solid var(--olive);">
              <div class="app-stat-card__top">
                <span class="app-stat-card__label" style="color: var(--olive);">Net Profit (YTD)</span>
                <div class="app-stat-card__icon app-stat-card__icon--olive">✨</div>
              </div>
              <div class="app-stat-card__value app-num app-text-success" id="val-net-profit" style="font-size: 2.2rem;">$0.00</div>
              <div class="app-flex app-items-center app-gap-xs">
                <span class="app-stat-card__trend app-stat-card__trend--up" id="trend-net-profit">+0.0%</span>
                <span class="app-stat-card__subtext" id="sub-net-profit">Net Margin Ratio</span>
              </div>
            </div>

          </div>

          <div class="app-card" style="margin-bottom: var(--space-xl);">
            <div class="app-card__header">
              <div>
                <h3 class="app-card__title">Accounting Workflow Overview</h3>
                <p class="app-card__subtitle">End-to-end accounting pipeline status and system health</p>
              </div>
              <span class="app-badge app-badge--success"><span class="app-badge__dot"></span> Operational</span>
            </div>
            <div class="app-card__body">
              <div class="dashboard-workflow-pipeline" id="dashboard-workflow-container"></div>
            </div>
          </div>

          <div class="app-dashboard-grid" style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-xl); margin-bottom: var(--space-xl);">
            
            <div class="app-card">
              <div class="app-card__header">
                <div>
                  <h3 class="app-card__title">Recent Transactions</h3>
                  <p class="app-card__subtitle">Latest journal postings, sales invoices, and vendor bills</p>
                </div>
                <button class="app-btn app-btn--secondary app-btn--sm" onclick="App.Navigation.navigateTo('journal-entries')">
                  View All
                </button>
              </div>
              <div class="app-table-container" style="border: none; border-radius: 0; box-shadow: none;">
                <table class="app-table app-table--hover app-table--striped">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Module</th>
                      <th>Reference</th>
                      <th class="app-text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="dashboard-transactions-body"></tbody>
                </table>
              </div>
            </div>

            <div style="display: flex; flex-direction: column; gap: var(--space-xl);">
              
              <div class="app-card">
                <div class="app-card__header">
                  <h3 class="app-card__title">Quick Actions</h3>
                </div>
                <div class="app-card__body" id="dashboard-quick-actions" style="display: flex; flex-direction: column; gap: var(--space-sm);"></div>
              </div>

              <div class="app-card">
                <div class="app-card__header">
                  <h3 class="app-card__title">Master Data Summary</h3>
                </div>
                <div class="app-card__body" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);" id="dashboard-master-summary"></div>
              </div>

            </div>

          </div>

        </div>
      `;
    }
  };

  // Register Dashboard Module automatically with Navigation system
  if (window.App && window.App.Navigation) {
    window.App.Navigation.registerModule('dashboard', DashboardModule);
  }
})();
