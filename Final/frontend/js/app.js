/**
 * Urban Furniture Accounting System - Application Controller
 * Wires Member 1's UI, Member 2's Masters, and Member 3's Accounting & Transactions
 */

const App = {
  masters: null,
  journalEngine: null,
  purchasesService: null,
  salesService: null,
  paymentsService: null,
  reportsService: null,
  currentRole: 'ACCOUNTANT',
  currentCustomerId: 'contact-nimesh',

  async init() {
    this.masters = new MastersService(store);
    this.journalEngine = new JournalEngine(store, this.masters);
    this.purchasesService = new PurchasesService(store, this.masters, this.journalEngine);
    this.salesService = new SalesService(store, this.masters, this.journalEngine);
    this.paymentsService = new PaymentsService(store, this.masters, this.journalEngine);
    this.reportsService = new ReportsService(store, this.masters);

    UI.init();

    if (typeof api !== 'undefined') {
      api.syncWithStore(store).then(connected => {
        if (connected) {
          const statusElem = document.querySelector('.header-status > span:first-child');
          if (statusElem) {
            statusElem.innerHTML = '<span class="indicator"></span>Backend API: <strong style="color:#a8e6cf;">Connected (MySQL Port 5000)</strong>';
          }
          this.refreshCurrentView();
        }
      });
    }

    UI.registerTabRenderer('login', () => {});
    UI.registerTabRenderer('dashboard', () => this.renderDashboard());
    UI.registerTabRenderer('purchases', () => this.renderPurchases());
    UI.registerTabRenderer('sales', () => this.renderSales());
    UI.registerTabRenderer('payments', () => this.renderPayments());
    UI.registerTabRenderer('journal', () => this.renderJournal());
    UI.registerTabRenderer('reports', () => this.renderReports());
    UI.registerTabRenderer('masters', () => this.renderMasters());
    UI.registerTabRenderer('customer-portal', () => this.renderCustomerPortal());

    store.subscribe('change', () => this.refreshCurrentView());

    const resetBtn = document.getElementById('btn-reset-demo');
    if (resetBtn) resetBtn.onclick = () => this.resetDemoData();

    this.loginRole('ACCOUNTANT');
  },

  showLoginScreen() {
    document.querySelectorAll('.nav-tab').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
    const loginView = document.getElementById('view-login');
    if (loginView) loginView.classList.add('active');
    UI.activeTab = 'login';

    const roleLabel = document.getElementById('user-role-label');
    if (roleLabel) roleLabel.innerHTML = 'Status: <strong>Sign In Required</strong>';
    this.switchAuthMode('login');
  },

  switchAuthMode(mode) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-mode-panel').forEach(p => p.style.display = 'none');

    const activeTab = document.getElementById('auth-tab-' + mode);
    const activePanel = document.getElementById('auth-mode-' + mode);

    if (activeTab) activeTab.classList.add('active');
    if (activePanel) activePanel.style.display = 'block';
  },

  async submitLogin() {
    const role = document.getElementById('login-role')?.value || 'Accountant';
    const username = document.getElementById('login-username')?.value.trim();
    const password = document.getElementById('login-password')?.value;

    if (!username || !password) {
      UI.toast('Please enter both username and password.', 'error');
      return;
    }

    try {
      if (typeof api !== 'undefined') {
        const res = await api.request('/auth/login', 'POST', { username, password, role });
        if (res.token) api.setToken(res.token);
        
        const userRole = res.data?.role || role;
        const custId = res.data?.customerId || 'contact-nimesh';

        if (userRole === 'Customer') {
          this.currentCustomerId = custId;
          this.loginRole('CUSTOMER');
        } else {
          this.loginRole('ACCOUNTANT');
        }
        UI.toast(`Welcome back, ${res.data?.username || username}!`, 'success');
      } else {
        this.loginRole(role.toUpperCase());
      }
    } catch (err) {
      UI.toast(err.message || 'Login failed', 'error');
    }
  },

  async submitRegister() {
    const role = document.getElementById('signup-role')?.value || 'Customer';
    const name = document.getElementById('signup-name')?.value.trim();
    const username = document.getElementById('signup-username')?.value.trim();
    const email = document.getElementById('signup-email')?.value.trim();
    const password = document.getElementById('signup-password')?.value;

    if (!username || !password || !name || !email) {
      UI.toast('Please fill in all required registration fields.', 'error');
      return;
    }

    try {
      if (typeof api !== 'undefined') {
        const res = await api.request('/auth/register', 'POST', { username, password, role, name, email });
        if (res.token) api.setToken(res.token);

        await api.syncWithStore(store);

        const userRole = res.data?.role || role;
        const custId = res.data?.customerId || 'contact-nimesh';

        if (userRole === 'Customer') {
          this.currentCustomerId = custId;
          this.loginRole('CUSTOMER');
        } else {
          this.loginRole('ACCOUNTANT');
        }
        UI.toast(`Account created successfully! Logged in as ${name}.`, 'success');
      } else {
        this.loginRole(role.toUpperCase());
      }
    } catch (err) {
      UI.toast(err.message || 'Registration failed', 'error');
    }
  },

  loginRole(role) {
    this.currentRole = role;
    if (role === 'CUSTOMER') {
      const sel = document.getElementById('login-customer-select');
      if (sel && sel.value) {
        this.currentCustomerId = sel.value;
      }
    }

    const roleLabel = document.getElementById('user-role-label');
    const custTab = document.getElementById('nav-tab-customer-portal');

    if (role === 'ACCOUNTANT') {
      if (roleLabel) roleLabel.innerHTML = 'Role: <strong>Accountant (Admin)</strong>';
      document.querySelectorAll('.nav-tab').forEach(t => {
        if (t.id === 'nav-tab-customer-portal') {
          t.style.display = 'none';
        } else {
          t.style.display = 'flex';
        }
      });
      UI.switchTab('dashboard');
    } else {
      const customer = this.masters.getContactById(this.currentCustomerId);
      const custName = customer ? customer.name : 'Customer';
      if (roleLabel) roleLabel.innerHTML = `Role: <strong>Customer (${custName})</strong>`;

      document.querySelectorAll('.nav-tab').forEach(t => {
        if (t.id === 'nav-tab-customer-portal') {
          t.style.display = 'flex';
        } else {
          t.style.display = 'none';
        }
      });
      UI.switchTab('customer-portal');
    }

    UI.toast(`Logged in as ${role === 'ACCOUNTANT' ? 'Accountant' : 'Customer'}`, 'success');
  },

  refreshCurrentView() {
    const active = UI.activeTab;
    if (active === 'dashboard') this.renderDashboard();
    else if (active === 'purchases') this.renderPurchases();
    else if (active === 'sales') this.renderSales();
    else if (active === 'payments') this.renderPayments();
    else if (active === 'journal') this.renderJournal();
    else if (active === 'reports') this.renderReports();
    else if (active === 'masters') this.renderMasters();
    else if (active === 'customer-portal') this.renderCustomerPortal();
  },

  resetDemoData() {
    if (confirm('Reset demo data to initial state? All transactions will be cleared.')) {
      store.adapter.clear();
      this.masters.init();
      UI.toast('System reset to default seed data.', 'success');
      this.refreshCurrentView();
    }
  },

  renderDashboard() {
    const kpis = this.reportsService.getDashboardKPIs();
    document.getElementById('kpi-receivables').innerText = UI.formatCurrency(kpis.totalReceivables);
    document.getElementById('kpi-payables').innerText = UI.formatCurrency(kpis.totalPayables);
    document.getElementById('kpi-cash').innerText = UI.formatCurrency(kpis.cashBalance);
    document.getElementById('kpi-bank').innerText = UI.formatCurrency(kpis.bankBalance);
    
    const profitEl = document.getElementById('kpi-profit');
    profitEl.innerText = UI.formatCurrency(kpis.netProfit);
    profitEl.style.color = kpis.netProfit >= 0 ? 'var(--forest-green)' : 'var(--terracotta)';

    const stockBody = document.querySelector('#dashboard-stock-table tbody');
    if (stockBody) {
      stockBody.innerHTML = this.masters.getProducts().map(p => `
        <tr>
          <td><strong>${p.name}</strong> <span style="font-size:0.75rem; color:var(--text-sub);">(${p.type})</span></td>
          <td>${p.category}</td>
          <td>${UI.formatCurrency(p.cost)}</td>
          <td>${UI.formatCurrency(p.salesPrice)}</td>
          <td class="text-right font-mono" style="font-weight:700; color:${p.type === 'Goods' && p.stock <= 5 ? 'var(--terracotta)' : 'inherit'};">
            ${p.type === 'Goods' ? p.stock : 'N/A'}
          </td>
        </tr>
      `).join('');
    }

    const journalBody = document.querySelector('#dashboard-journal-table tbody');
    if (journalBody) {
      const entries = [...this.journalEngine.getEntries()].reverse().slice(0, 6);
      if (entries.length === 0) {
        journalBody.innerHTML = '<tr><td colspan="5" class="text-center" style="color:var(--text-sub); padding:1.5rem;">No journal entries posted yet.</td></tr>';
      } else {
        journalBody.innerHTML = entries.map(e => `
          <tr>
            <td>${UI.formatDate(e.date)}</td>
            <td><span class="status-pill status-confirmed">${e.entryNumber}</span></td>
            <td>${e.reference}</td>
            <td class="text-right font-mono">${UI.formatCurrency(e.totalDebit)}</td>
            <td class="text-right font-mono">${UI.formatCurrency(e.totalCredit)}</td>
          </tr>
        `).join('');
      }
    }
  },

  switchPurchasesSubTab(tab) {
    document.getElementById('purchases-subtab-orders').style.display = tab === 'orders' ? 'block' : 'none';
    document.getElementById('purchases-subtab-bills').style.display = tab === 'bills' ? 'block' : 'none';
    document.querySelectorAll('#view-purchases .sub-tab').forEach((st, idx) => {
      st.classList.toggle('active', (tab === 'orders' && idx === 0) || (tab === 'bills' && idx === 1));
    });
  },

  renderPurchases() {
    const poBody = document.querySelector('#purchases-orders-table tbody');
    const pos = [...this.purchasesService.getPurchases()].reverse();
    if (pos.length === 0) {
      poBody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem; color:var(--text-sub);">No purchase orders yet. Click "+ Create Purchase Order".</td></tr>';
    } else {
      poBody.innerHTML = pos.map(po => {
        let actionBtn = po.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="App.confirmPO('${po.id}')">Confirm PO</button>` :
                        po.status === 'confirmed' ? `<button class="btn btn-success btn-sm" onclick="App.createBillFromPO('${po.id}')">Convert to Bill</button>` :
                        `<span style="font-size:0.8rem; color:var(--text-sub);">Billed</span>`;
        return `
          <tr>
            <td><strong>${po.poNumber}</strong></td>
            <td>${UI.formatDate(po.orderDate)}</td>
            <td><strong>${po.vendorName}</strong></td>
            <td>${po.lines.map(l => l.productName + ' (' + l.quantity + ')').join(', ')}</td>
            <td class="text-right font-mono">${UI.formatCurrency(po.totalAmount)}</td>
            <td><span class="status-pill status-${po.status}">${po.status}</span></td>
            <td class="text-center">${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }

    const billsBody = document.querySelector('#purchases-bills-table tbody');
    const bills = [...this.purchasesService.getBills()].reverse();
    if (bills.length === 0) {
      billsBody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:2rem; color:var(--text-sub);">No vendor bills created yet.</td></tr>';
    } else {
      billsBody.innerHTML = bills.map(b => {
        let actionBtn = b.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="App.confirmBill('${b.id}')">Confirm & Post</button>` :
                        b.status === 'posted' ? `<button class="btn btn-success btn-sm" onclick="App.openPaymentModal('VendorBill', '${b.id}')">Pay Bill</button>` :
                        `<span style="font-size:0.8rem; color:var(--forest-green); font-weight:600;">Paid</span>`;
        return `
          <tr>
            <td><strong>${b.billNumber}</strong></td>
            <td>${b.poNumber}</td>
            <td>${UI.formatDate(b.billDate)}</td>
            <td>${UI.formatDate(b.dueDate)}</td>
            <td><strong>${b.vendorName}</strong></td>
            <td class="text-right font-mono">${UI.formatCurrency(b.totalAmount)}</td>
            <td class="text-right font-mono" style="font-weight:700; color:${b.balanceDue > 0 ? 'var(--terracotta)' : 'var(--forest-green)'};">${UI.formatCurrency(b.balanceDue)}</td>
            <td><span class="status-pill status-${b.status}">${b.status}</span></td>
            <td class="text-center">${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }
  },

  openNewPOMap() {
    const vendors = this.masters.getVendors();
    const products = this.masters.getProducts();
    const analytics = this.masters.getAnalyticAccounts();

    const vendorOptions = vendors.length > 0
      ? vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('')
      : '<option value="">-- No Vendors Available (Add Vendor first) --</option>';

    const productOptions = products.length > 0
      ? products.map(p => `<option value="${p.id}" data-cost="${p.cost}">${p.name} - Cost: ${UI.formatCurrency(p.cost)} (Stock: ${p.stock})</option>`).join('')
      : '<option value="">-- No Products Available (Add Product first) --</option>';

    const analyticOptions = `<option value="">None</option>` + analytics.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    const html = `
      <form id="new-po-form">
        <div class="form-group">
          <label class="form-label">Select Vendor *</label>
          <select class="form-control" id="po-vendor" required>${vendorOptions}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Order Date</label>
            <input type="date" class="form-control" id="po-date" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Analytic Project</label>
            <select class="form-control" id="po-analytic">${analyticOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Select Product *</label>
          <select class="form-control" id="po-product" onchange="App.onPOProductChange()">${productOptions}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" min="1" value="5" class="form-control" id="po-qty" oninput="App.calcPOTotal()" required />
          </div>
          <div class="form-group">
            <label class="form-label">Unit Price (₹) *</label>
            <input type="number" min="0" value="${products[0]?.cost || 0}" class="form-control" id="po-price" oninput="App.calcPOTotal()" required />
          </div>
          <div class="form-group">
            <label class="form-label">Total Amount</label>
            <input type="text" class="form-control" id="po-total" readonly style="font-weight:700; background:#f9f9f9;" />
          </div>
        </div>
      </form>
    `;

    UI.showModal('Create Purchase Order', html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: 'Save Draft PO', className: 'btn-primary', onClick: () => this.submitNewPO() }
    ]);
    this.onPOProductChange();
  },

  onPOProductChange() {
    const sel = document.getElementById('po-product');
    if (!sel || !sel.options || sel.selectedIndex < 0) return;
    const cost = sel.options[sel.selectedIndex]?.getAttribute('data-cost');
    if (cost !== undefined && cost !== null) document.getElementById('po-price').value = cost;
    this.calcPOTotal();
  },

  calcPOTotal() {
    const qty = Number(document.getElementById('po-qty')?.value) || 0;
    const price = Number(document.getElementById('po-price')?.value) || 0;
    const totalEl = document.getElementById('po-total');
    if (totalEl) totalEl.value = UI.formatCurrency(qty * price);
  },

  async submitNewPO() {
    try {
      const vendorId = document.getElementById('po-vendor')?.value;
      const orderDate = document.getElementById('po-date')?.value;
      const analyticAccountId = document.getElementById('po-analytic')?.value || null;
      const productId = document.getElementById('po-product')?.value;
      const quantity = Number(document.getElementById('po-qty')?.value);
      const unitPrice = Number(document.getElementById('po-price')?.value);

      if (!vendorId) throw new Error('Please select a valid Vendor. (Add a vendor in Master Data first)');
      if (!productId) throw new Error('Please select a valid Product. (Add a product in Master Data first)');
      if (!quantity || quantity <= 0) throw new Error('Please specify a valid quantity greater than 0.');

      const po = this.purchasesService.createPurchaseOrder({
        vendorId, orderDate,
        lines: [{ productId, analyticAccountId, quantity, unitPrice }]
      });

      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.createPurchaseOrder({
            id: po.id,
            poNumber: po.poNumber,
            vendorId: po.vendorId,
            orderDate: po.orderDate,
            lines: po.lines,
            totalAmount: po.totalAmount
          });
        } catch (err) {
          console.warn('Backend PO creation sync note:', err.message);
        }
      }

      UI.closeModal();
      UI.toast(`Purchase Order ${po.poNumber} created.`, 'success');
      this.renderPurchases();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async confirmPO(poId) {
    try {
      const po = this.purchasesService.confirmPurchaseOrder(poId);
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.confirmPurchaseOrder(poId);
        } catch (err) {
          console.warn('Backend PO confirm sync note:', err.message);
        }
      }
      UI.toast(`PO ${po.poNumber} confirmed.`, 'success');
      this.renderPurchases();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async createBillFromPO(poId) {
    try {
      const bill = this.purchasesService.createVendorBillFromPO({ poId });
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.createBill({
            id: bill.id,
            billNumber: bill.billNumber,
            purchaseOrderId: bill.purchaseOrderId,
            poNumber: bill.poNumber,
            vendorId: bill.vendorId,
            vendorName: bill.vendorName,
            billDate: bill.billDate,
            dueDate: bill.dueDate,
            totalAmount: bill.totalAmount,
            lines: bill.lines
          });
        } catch (err) {
          console.warn('Backend Bill creation sync note:', err.message);
        }
      }
      this.switchPurchasesSubTab('bills');
      UI.toast(`Vendor Bill ${bill.billNumber} created from PO.`, 'info');
      this.renderPurchases();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async confirmBill(billId) {
    try {
      const { bill, journalEntry } = this.purchasesService.confirmVendorBill(billId);
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.confirmBill(billId);
        } catch (err) {
          console.warn('Backend Bill confirm sync note:', err.message);
        }
      }
      UI.toast(`Bill ${bill.billNumber} posted (${journalEntry.entryNumber}). Stock updated.`, 'success');
      this.renderPurchases();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },  // ==========================================
  // SALES VIEW
  // ==========================================
  switchSalesSubTab(tab) {
    document.getElementById('sales-subtab-orders').style.display = tab === 'orders' ? 'block' : 'none';
    document.getElementById('sales-subtab-invoices').style.display = tab === 'invoices' ? 'block' : 'none';
    document.querySelectorAll('#view-sales .sub-tab').forEach((st, idx) => {
      st.classList.toggle('active', (tab === 'orders' && idx === 0) || (tab === 'invoices' && idx === 1));
    });
  },

  renderSales() {
    const soBody = document.querySelector('#sales-orders-table tbody');
    const sos = [...this.salesService.getSales()].reverse();
    if (sos.length === 0) {
      soBody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:2rem; color:var(--text-sub);">No sales orders created yet. Click "+ Create Sales Order".</td></tr>';
    } else {
      soBody.innerHTML = sos.map(so => {
        let actionBtn = so.status === 'draft' ? `<button class="btn btn-success btn-sm" onclick="App.confirmSO('${so.id}')">Confirm SO</button>` :
                        so.status === 'confirmed' ? `<button class="btn btn-primary btn-sm" onclick="App.createInvoiceFromSO('${so.id}')">Create Invoice</button>` :
                        `<span style="font-size:0.8rem; color:var(--text-sub);">Invoiced</span>`;
        return `
          <tr>
            <td><strong>${so.soNumber}</strong></td>
            <td>${UI.formatDate(so.orderDate)}</td>
            <td><strong>${so.customerName}</strong></td>
            <td>${so.lines.map(l => l.productName + ' (' + l.quantity + ')').join(', ')}</td>
            <td class="text-right font-mono">${UI.formatCurrency(so.subtotal)}</td>
            <td class="text-right font-mono">${UI.formatCurrency(so.taxTotal)}</td>
            <td class="text-right font-mono" style="font-weight:700;">${UI.formatCurrency(so.grandTotal)}</td>
            <td><span class="status-pill status-${so.status}">${so.status}</span></td>
            <td class="text-center">${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }

    const invBody = document.querySelector('#sales-invoices-table tbody');
    const invoices = [...this.salesService.getInvoices()].reverse();
    if (invoices.length === 0) {
      invBody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:2rem; color:var(--text-sub);">No customer invoices created yet.</td></tr>';
    } else {
      invBody.innerHTML = invoices.map(inv => {
        let actionBtn = inv.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="App.confirmInvoice('${inv.id}')">Confirm & Post</button>` :
                        inv.status === 'posted' ? `<button class="btn btn-success btn-sm" onclick="App.openPaymentModal('CustomerInvoice', '${inv.id}')">Receive Pay</button>` :
                        `<span style="font-size:0.8rem; color:var(--forest-green); font-weight:600;">Paid</span>`;
        return `
          <tr>
            <td><strong>${inv.invoiceNumber}</strong></td>
            <td>${inv.soNumber}</td>
            <td>${UI.formatDate(inv.invoiceDate)}</td>
            <td>${UI.formatDate(inv.dueDate)}</td>
            <td><strong>${inv.customerName}</strong></td>
            <td class="text-right font-mono">${UI.formatCurrency(inv.grandTotal)}</td>
            <td class="text-right font-mono" style="font-weight:700; color:${inv.balanceDue > 0 ? 'var(--terracotta)' : 'var(--forest-green)'};">${UI.formatCurrency(inv.balanceDue)}</td>
            <td><span class="status-pill status-${inv.status}">${inv.status}</span></td>
            <td class="text-center">${actionBtn}</td>
          </tr>
        `;
      }).join('');
    }
  },

  openNewSOMap() {
    const customers = this.masters.getCustomers();
    const products = this.masters.getProducts();
    const analytics = this.masters.getAnalyticAccounts();

    const customerOptions = customers.length > 0
      ? customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('')
      : '<option value="">-- No Customers Available (Add Customer first) --</option>';

    const productOptions = products.length > 0
      ? products.map(p => `
        <option value="${p.id}" data-price="${p.salesPrice}">
          ${p.name} - Price: ${UI.formatCurrency(p.salesPrice)} (${p.type === 'Goods' ? 'Stock: ' + p.stock : 'Service'})
        </option>
      `).join('')
      : '<option value="">-- No Products Available (Add Product first) --</option>';

    const analyticOptions = `<option value="">None</option>` + analytics.map(a => `<option value="${a.id}">${a.name}</option>`).join('');

    const html = `
      <form id="new-so-form">
        <div class="form-group">
          <label class="form-label">Select Customer *</label>
          <select class="form-control" id="so-customer" required>${customerOptions}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Order Date</label>
            <input type="date" class="form-control" id="so-date" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Analytic Project</label>
            <select class="form-control" id="so-analytic">${analyticOptions}</select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Select Product *</label>
          <select class="form-control" id="so-product" onchange="App.onSOProductChange()">${productOptions}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Quantity *</label>
            <input type="number" min="1" value="1" class="form-control" id="so-qty" oninput="App.calcSOTotal()" required />
          </div>
          <div class="form-group">
            <label class="form-label">Unit Price (₹) *</label>
            <input type="number" min="0" value="${products[0]?.salesPrice || 0}" class="form-control" id="so-price" oninput="App.calcSOTotal()" required />
          </div>
          <div class="form-group">
            <label class="form-label">Tax Rate (%)</label>
            <input type="number" min="0" max="100" value="10" class="form-control" id="so-tax" oninput="App.calcSOTotal()" />
          </div>
        </div>
        <div class="form-row" style="margin-top:0.5rem; background:var(--bg-card); padding:0.75rem; border-radius:var(--radius-sm);">
          <div><span style="color:var(--text-sub); font-size:0.8rem;">Subtotal:</span> <strong id="so-subtotal-display">₹0.00</strong></div>
          <div><span style="color:var(--text-sub); font-size:0.8rem;">Tax:</span> <strong id="so-tax-display">₹0.00</strong></div>
          <div><span style="color:var(--text-sub); font-size:0.8rem;">Grand Total:</span> <strong id="so-grand-display" style="color:var(--wood-dark);">₹0.00</strong></div>
        </div>
      </form>
    `;

    UI.showModal('Create Sales Order', html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: 'Save Draft SO', className: 'btn-success', onClick: () => this.submitNewSO() }
    ]);
    this.onSOProductChange();
  },

  onSOProductChange() {
    const sel = document.getElementById('so-product');
    if (!sel || !sel.options || sel.selectedIndex < 0) return;
    const price = sel.options[sel.selectedIndex]?.getAttribute('data-price');
    if (price !== undefined && price !== null) document.getElementById('so-price').value = price;
    this.calcSOTotal();
  },

  calcSOTotal() {
    const qty = Number(document.getElementById('so-qty')?.value) || 0;
    const price = Number(document.getElementById('so-price')?.value) || 0;
    const taxRate = Number(document.getElementById('so-tax')?.value) || 0;
    const subtotal = qty * price;
    const taxAmount = subtotal * (taxRate / 100);
    const grandTotal = subtotal + taxAmount;

    if (document.getElementById('so-subtotal-display')) {
      document.getElementById('so-subtotal-display').innerText = UI.formatCurrency(subtotal);
      document.getElementById('so-tax-display').innerText = UI.formatCurrency(taxAmount);
      document.getElementById('so-grand-display').innerText = UI.formatCurrency(grandTotal);
    }
  },

  async submitNewSO() {
    try {
      const customerId = document.getElementById('so-customer')?.value;
      const orderDate = document.getElementById('so-date')?.value;
      const analyticAccountId = document.getElementById('so-analytic')?.value || null;
      const productId = document.getElementById('so-product')?.value;
      const quantity = Number(document.getElementById('so-qty')?.value);
      const unitPrice = Number(document.getElementById('so-price')?.value);
      const taxRate = Number(document.getElementById('so-tax')?.value) || 0;

      if (!customerId) throw new Error('Please select a valid Customer. (Add a customer in Master Data first)');
      if (!productId) throw new Error('Please select a valid Product. (Add a product in Master Data first)');
      if (!quantity || quantity <= 0) throw new Error('Please specify a valid quantity greater than 0.');

      const so = this.salesService.createSalesOrder({
        customerId, orderDate,
        lines: [{ productId, analyticAccountId, quantity, unitPrice, taxRate }]
      });

      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.createSalesOrder({
            id: so.id,
            soNumber: so.soNumber,
            customerId: so.customerId,
            orderDate: so.orderDate,
            lines: so.lines,
            subtotal: so.subtotal,
            taxTotal: so.taxTotal,
            grandTotal: so.grandTotal
          });
        } catch (err) {
          console.warn('Backend SO creation sync note:', err.message);
        }
      }

      UI.closeModal();
      UI.toast(`Sales Order ${so.soNumber} created.`, 'success');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async confirmSO(soId) {
    try {
      const so = this.salesService.confirmSalesOrder(soId);
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.confirmSalesOrder(soId);
        } catch (err) {
          console.warn('Backend SO confirm sync note:', err.message);
        }
      }
      UI.toast(`SO ${so.soNumber} confirmed after stock validation.`, 'success');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async createInvoiceFromSO(soId) {
    try {
      const inv = this.salesService.createCustomerInvoiceFromSO({ soId });
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.createInvoice({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            salesOrderId: inv.salesOrderId,
            soNumber: inv.soNumber,
            customerId: inv.customerId,
            customerName: inv.customerName,
            invoiceDate: inv.invoiceDate,
            dueDate: inv.dueDate,
            subtotal: inv.subtotal,
            taxTotal: inv.taxTotal,
            grandTotal: inv.grandTotal,
            lines: inv.lines
          });
        } catch (err) {
          console.warn('Backend Invoice creation sync note:', err.message);
        }
      }
      this.switchSalesSubTab('invoices');
      UI.toast(`Customer Invoice ${inv.invoiceNumber} created from SO.`, 'info');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  async confirmInvoice(invoiceId) {
    try {
      const { invoice, journalEntry } = this.salesService.confirmCustomerInvoice(invoiceId);
      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.confirmInvoice(invoiceId);
        } catch (err) {
          console.warn('Backend Invoice confirm sync note:', err.message);
        }
      }
      UI.toast(`Invoice ${invoice.invoiceNumber} posted (${journalEntry.entryNumber}). Stock decremented.`, 'success');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  // ==========================================
  // PAYMENT REGISTRATION MODAL
  // ==========================================
  // ==========================================
  // PAYMENT REGISTRATION MODAL
  // ==========================================
  openPaymentModal(documentType = null, documentId = null) {
    let doc = null;
    let title = 'Register Payment / Receipt';
    let partnerName = '';
    let balance = 0;

    const bills = this.purchasesService.getBills().filter(b => b.status === 'posted');
    const invoices = this.salesService.getInvoices().filter(i => i.status === 'posted');

    if (documentType === 'VendorBill' && documentId) {
      doc = bills.find(b => b.id === documentId);
      if (doc) {
        title = `Vendor Payment for ${doc.billNumber}`;
        partnerName = doc.vendorName;
        balance = doc.balanceDue;
      }
    } else if (documentType === 'CustomerInvoice' && documentId) {
      doc = invoices.find(i => i.id === documentId);
      if (doc) {
        title = `Customer Receipt for ${doc.invoiceNumber}`;
        partnerName = doc.customerName;
        balance = doc.balanceDue;
      }
    }

    const docSelectOptions = [
      '<option value="">-- Direct / Unlinked Payment --</option>',
      ...bills.map(b => `<option value="VendorBill:${b.id}" ${doc && doc.id === b.id ? 'selected' : ''}>[Vendor Bill] ${b.billNumber} - ${b.vendorName} (Bal: ${UI.formatCurrency(b.balanceDue)})</option>`),
      ...invoices.map(i => `<option value="CustomerInvoice:${i.id}" ${doc && doc.id === i.id ? 'selected' : ''}>[Customer Invoice] ${i.invoiceNumber} - ${i.customerName} (Bal: ${UI.formatCurrency(i.balanceDue)})</option>`)
    ].join('');

    const html = `
      <form id="payment-form">
        <div class="form-group">
          <label class="form-label">Linked Bill / Invoice (Optional)</label>
          <select class="form-control" id="pay-doc-select" onchange="App.onPaymentDocSelectChange()">${docSelectOptions}</select>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Party / Partner Name *</label>
            <input type="text" class="form-control" id="pay-partner-name" value="${partnerName}" placeholder="e.g. Metro City Municipality" required />
          </div>
          <div class="form-group">
            <label class="form-label">Outstanding Balance</label>
            <input type="text" class="form-control" id="pay-balance-disp" value="${UI.formatCurrency(balance)}" readonly style="background:#f9f9f9; font-weight:700; color:var(--terracotta);" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Payment Method *</label>
            <select class="form-control" id="pay-method">
              <option value="Bank">Bank Account (HDFC)</option>
              <option value="Cash">Cash in Hand</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Date *</label>
            <input type="date" class="form-control" id="pay-date" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Payment Amount (₹) *</label>
            <input type="number" min="0.01" value="${balance || 1000}" step="0.01" class="form-control" id="pay-amount" required />
          </div>
          <div class="form-group">
            <label class="form-label">Reference / Note</label>
            <input type="text" class="form-control" id="pay-ref" value="${doc ? (doc.billNumber || doc.invoiceNumber || '') : ''}" placeholder="e.g. NEFT-99128 or Cash Voucher" />
          </div>
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: 'Post Payment', className: 'btn-success', onClick: () => this.submitPayment(documentType, documentId) }
    ]);
  },

  onPaymentDocSelectChange() {
    const selVal = document.getElementById('pay-doc-select')?.value;
    if (!selVal) return;
    if (selVal.startsWith('VendorBill:')) {
      const bId = selVal.replace('VendorBill:', '');
      const bill = this.purchasesService.getBills().find(b => b.id === bId);
      if (bill) {
        document.getElementById('pay-partner-name').value = bill.vendorName;
        document.getElementById('pay-balance-disp').value = UI.formatCurrency(bill.balanceDue);
        document.getElementById('pay-amount').value = bill.balanceDue > 0 ? bill.balanceDue : bill.totalAmount;
        document.getElementById('pay-ref').value = bill.billNumber;
      }
    } else if (selVal.startsWith('CustomerInvoice:')) {
      const iId = selVal.replace('CustomerInvoice:', '');
      const inv = this.salesService.getInvoices().find(i => i.id === iId);
      if (inv) {
        document.getElementById('pay-partner-name').value = inv.customerName;
        document.getElementById('pay-balance-disp').value = UI.formatCurrency(inv.balanceDue);
        document.getElementById('pay-amount').value = inv.balanceDue > 0 ? inv.balanceDue : inv.grandTotal;
        document.getElementById('pay-ref').value = inv.invoiceNumber;
      }
    }
  },

  async submitPayment(documentType, documentId) {
    try {
      const selVal = document.getElementById('pay-doc-select')?.value;
      let targetType = documentType;
      let targetId = documentId;

      if (selVal) {
        if (selVal.startsWith('VendorBill:')) {
          targetType = 'VendorBill';
          targetId = selVal.replace('VendorBill:', '');
        } else if (selVal.startsWith('CustomerInvoice:')) {
          targetType = 'CustomerInvoice';
          targetId = selVal.replace('CustomerInvoice:', '');
        }
      }

      const method = document.getElementById('pay-method').value;
      const paymentDate = document.getElementById('pay-date').value;
      const amount = Number(document.getElementById('pay-amount').value);
      const reference = document.getElementById('pay-ref').value;

      if (!amount || amount <= 0) {
        throw new Error('Please enter a valid payment amount greater than 0.');
      }

      if (targetType === 'VendorBill' && targetId) {
        const res = this.paymentsService.registerVendorPayment({ billId: targetId, method, paymentDate, reference, amount });
        if (typeof api !== 'undefined' && api.isOnline) {
          try {
            await api.registerPayment({
              targetDocumentType: 'VendorBill',
              targetDocumentId: targetId,
              method, paymentDate, reference, amount
            });
          } catch (err) {
            console.warn('Backend Payment sync note:', err.message);
          }
        }
        UI.closeModal();
        UI.toast(`Vendor Payment posted (${res.journalEntry.entryNumber}). Bill updated.`, 'success');
        this.refreshCurrentView();
      } else if (targetType === 'CustomerInvoice' && targetId) {
        const res = this.paymentsService.registerCustomerPayment({ invoiceId: targetId, method, paymentDate, reference, amount });
        if (typeof api !== 'undefined' && api.isOnline) {
          try {
            await api.registerPayment({
              targetDocumentType: 'CustomerInvoice',
              targetDocumentId: targetId,
              method, paymentDate, reference, amount
            });
          } catch (err) {
            console.warn('Backend Payment sync note:', err.message);
          }
        }
        UI.closeModal();
        UI.toast(`Customer Receipt posted (${res.journalEntry.entryNumber}). Invoice settled.`, 'success');
        this.refreshCurrentView();
      } else {
        const partnerName = document.getElementById('pay-partner-name')?.value || 'General Partner';
        const payment = {
          id: `pay-${Date.now()}`,
          paymentNumber: this.paymentsService.generatePaymentNumber(),
          direction: 'OUTBOUND',
          partnerName,
          method: method === 'Cash' ? 'Cash' : 'Bank',
          amount,
          paymentDate: paymentDate || new Date().toISOString().split('T')[0],
          reference: reference || 'Direct Payment',
          status: 'posted',
          createdAt: new Date().toISOString()
        };
        const payments = this.paymentsService.getPayments();
        payments.push(payment);
        store.set('urban_payments', payments);

        if (typeof api !== 'undefined' && api.isOnline) {
          try {
            await api.registerPayment(payment);
          } catch (err) {
            console.warn('Backend Direct Payment sync note:', err.message);
          }
        }

        UI.closeModal();
        UI.toast(`Direct Payment ${payment.paymentNumber} recorded.`, 'success');
        this.refreshCurrentView();
      }
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  // ==========================================
  // MANUAL JOURNAL ENTRY MODAL
  // ==========================================
  openJournalEntryModal() {
    const journals = this.masters.getJournals();
    const accounts = this.masters.getAccounts();
    const journalOptions = journals.map(j => `<option value="${j.id}">${j.name} (${j.code})</option>`).join('');
    const accountOptions = accounts.map(a => `<option value="${a.id}">[${a.code}] ${a.name}</option>`).join('');

    const html = `
      <form id="manual-je-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Journal *</label>
            <select class="form-control" id="mje-journal" required>${journalOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Date *</label>
            <input type="date" class="form-control" id="mje-date" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Reference / Narration *</label>
          <input type="text" class="form-control" id="mje-ref" placeholder="e.g. Office Supplies Adjustment" required />
        </div>
        <div style="background:var(--bg-card); padding:0.75rem; border-radius:var(--radius-sm); margin-top:0.75rem;">
          <h4 style="font-size:0.88rem; font-weight:700; margin-bottom:0.5rem; color:var(--forest-green);">Debited Account (Dr)</h4>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Account *</label>
              <select class="form-control" id="mje-dr-acc">${accountOptions}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount (₹) *</label>
              <input type="number" min="0.01" step="0.01" value="1000" class="form-control" id="mje-dr-amt" required />
            </div>
          </div>
          <h4 style="font-size:0.88rem; font-weight:700; margin-bottom:0.5rem; color:var(--terracotta);">Credited Account (Cr)</h4>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Account *</label>
              <select class="form-control" id="mje-cr-acc">${accountOptions}</select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount (₹) *</label>
              <input type="number" min="0.01" step="0.01" value="1000" class="form-control" id="mje-cr-amt" required />
            </div>
          </div>
        </div>
      </form>
    `;

    UI.showModal('Post Manual Journal Entry', html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: 'Post Entry', className: 'btn-primary', onClick: () => this.submitManualJE() }
    ]);
  },

  async submitManualJE() {
    try {
      const journalId = document.getElementById('mje-journal').value;
      const date = document.getElementById('mje-date').value;
      const reference = document.getElementById('mje-ref').value;
      const drAccountId = document.getElementById('mje-dr-acc').value;
      const drAmt = Number(document.getElementById('mje-dr-amt').value);
      const crAccountId = document.getElementById('mje-cr-acc').value;
      const crAmt = Number(document.getElementById('mje-cr-amt').value);

      if (!reference) throw new Error('Reference / Narration is required.');
      if (drAmt <= 0 || crAmt <= 0) throw new Error('Debit and Credit amounts must be greater than 0.');
      if (drAmt !== crAmt) throw new Error(`Double-Entry Rule Violation: Debit (₹${drAmt}) must equal Credit (₹${crAmt}).`);

      const entry = this.journalEngine.createManualEntry({
        journalId,
        date,
        reference,
        lines: [
          { accountId: drAccountId, debit: drAmt, credit: 0 },
          { accountId: crAccountId, debit: 0, credit: crAmt }
        ]
      });

      if (typeof api !== 'undefined' && api.isOnline) {
        try {
          await api.createJournalEntry({
            id: entry.id,
            entryNumber: entry.entryNumber,
            journalId: entry.journalId,
            date: entry.date,
            reference: entry.reference,
            lines: entry.lines,
            totalDebit: entry.totalDebit,
            totalCredit: entry.totalCredit
          });
        } catch (err) {
          console.warn('Backend Manual JE sync note:', err.message);
        }
      }

      UI.closeModal();
      UI.toast(`Journal Entry ${entry.entryNumber} posted.`, 'success');
      this.renderJournal();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  // ==========================================
  // PAYMENTS & JOURNAL & REPORTS VIEWS
  // ==========================================
  renderPayments() {
    const tbody = document.querySelector('#payments-table tbody');
    const payments = [...this.paymentsService.getPayments()].reverse();
    if (payments.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center" style="padding:2rem; color:var(--text-sub);">No payments recorded yet.</td></tr>';
    } else {
      tbody.innerHTML = payments.map(p => `
        <tr>
          <td><strong>${p.paymentNumber}</strong></td>
          <td>${UI.formatDate(p.paymentDate)}</td>
          <td><span class="status-pill status-${p.direction === 'INBOUND' ? 'paid' : 'warning'}">${p.direction}</span></td>
          <td>${p.partnerName}</td>
          <td>${p.method}</td>
          <td>${p.targetDocumentNumber}</td>
          <td>${p.reference}</td>
          <td class="text-right font-mono" style="font-weight:700;">${UI.formatCurrency(p.amount)}</td>
          <td><span class="status-pill status-confirmed">Posted</span></td>
        </tr>
      `).join('');
    }
  },

  renderJournal() {
    const tbody = document.querySelector('#journal-entries-table tbody');
    const entries = [...this.journalEngine.getEntries()].reverse();
    if (entries.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:2rem; color:var(--text-sub);">No journal entries posted yet.</td></tr>';
    } else {
      tbody.innerHTML = entries.map(entry => {
        const linesHtml = entry.lines.map(line => {
          const acc = this.masters.getAccountById(line.accountId);
          const accName = acc ? `${acc.name} (${acc.code})` : line.accountId;
          return `
            <div style="display:flex; justify-content:space-between; padding:0.15rem 0; font-size:0.83rem;">
              <span style="${line.credit > 0 ? 'padding-left:1.5rem;' : 'font-weight:600;'}">${accName}</span>
              <span>
                <span class="font-mono" style="display:inline-block; width:90px; text-align:right;">${line.debit > 0 ? UI.formatCurrency(line.debit) : '-'}</span>
                <span class="font-mono" style="display:inline-block; width:90px; text-align:right;">${line.credit > 0 ? UI.formatCurrency(line.credit) : '-'}</span>
              </span>
            </div>
          `;
        }).join('');

        const journal = this.masters.getJournalById(entry.journalId);
        return `
          <tr>
            <td style="vertical-align:top;"><strong>${entry.entryNumber}</strong></td>
            <td style="vertical-align:top;">${UI.formatDate(entry.date)}</td>
            <td style="vertical-align:top;">${journal ? journal.name : entry.journalId}</td>
            <td style="vertical-align:top;">${entry.reference}</td>
            <td style="min-width:320px;">${linesHtml}</td>
            <td class="text-right font-mono" style="vertical-align:bottom; font-weight:700;">${UI.formatCurrency(entry.totalDebit)}</td>
            <td class="text-right font-mono" style="vertical-align:bottom; font-weight:700;">${UI.formatCurrency(entry.totalCredit)}</td>
          </tr>
        `;
      }).join('');
    }
  },

  switchReportSubTab(tab) {
    document.getElementById('reports-subtab-pl').style.display = tab === 'pl' ? 'block' : 'none';
    document.getElementById('reports-subtab-bs').style.display = tab === 'bs' ? 'block' : 'none';
    document.getElementById('reports-subtab-budget').style.display = tab === 'budget' ? 'block' : 'none';
    document.querySelectorAll('#view-reports .sub-tab').forEach((st, idx) => {
      st.classList.toggle('active', (tab === 'pl' && idx === 0) || (tab === 'bs' && idx === 1) || (tab === 'budget' && idx === 2));
    });
  },

  renderReports() {
    // 1. Profit & Loss
    const pl = this.reportsService.getProfitAndLoss();
    const plBody = document.getElementById('pl-table-body');
    let plRows = `<tr style="background:var(--bg-card); font-weight:700;"><td colspan="2">INCOME</td></tr>`;
    pl.income.accounts.forEach(acc => {
      plRows += `<tr><td style="padding-left:1.5rem;">${acc.name}</td><td class="text-right font-mono">${UI.formatCurrency(acc.amount)}</td></tr>`;
    });
    plRows += `
      <tr style="font-weight:700; border-top:1px solid var(--border-color);">
        <td>Total Operating Income</td>
        <td class="text-right font-mono">${UI.formatCurrency(pl.income.total)}</td>
      </tr>
      <tr style="background:var(--bg-card); font-weight:700;"><td colspan="2">EXPENSES</td></tr>
    `;
    pl.expenses.accounts.forEach(acc => {
      plRows += `<tr><td style="padding-left:1.5rem;">${acc.name}</td><td class="text-right font-mono">${UI.formatCurrency(acc.amount)}</td></tr>`;
    });
    plRows += `
      <tr style="font-weight:700; border-top:1px solid var(--border-color);">
        <td>Total Expenses</td>
        <td class="text-right font-mono">${UI.formatCurrency(pl.expenses.total)}</td>
      </tr>
      <tr style="background:${pl.isProfit ? 'var(--green-badge-bg)' : 'var(--red-badge-bg)'}; font-weight:700; font-size:1.05rem;">
        <td>NET ${pl.isProfit ? 'PROFIT' : 'LOSS'}</td>
        <td class="text-right font-mono" style="color:${pl.isProfit ? 'var(--forest-green)' : 'var(--terracotta)'};">${UI.formatCurrency(pl.netProfit)}</td>
      </tr>
    `;
    plBody.innerHTML = plRows;

    // 2. Balance Sheet
    const bs = this.reportsService.getBalanceSheet();
    const bsBody = document.getElementById('bs-table-body');
    let bsRows = `<tr style="background:var(--bg-card); font-weight:700;"><td colspan="3">ASSETS</td></tr>`;
    bs.assets.accounts.forEach(a => {
      bsRows += `<tr><td style="padding-left:1.5rem;">${a.name}</td><td class="text-right font-mono">${UI.formatCurrency(a.amount)}</td><td></td></tr>`;
    });
    bsRows += `
      <tr style="font-weight:700; border-top:1px solid var(--border-color); background:#fdfbf7;">
        <td colspan="2">Total Assets</td>
        <td class="text-right font-mono" style="color:var(--forest-green); font-size:1rem;">${UI.formatCurrency(bs.assets.total)}</td>
      </tr>
      <tr style="background:var(--bg-card); font-weight:700;"><td colspan="3">LIABILITIES</td></tr>
    `;
    bs.liabilities.accounts.forEach(l => {
      bsRows += `<tr><td style="padding-left:1.5rem;">${l.name}</td><td class="text-right font-mono">${UI.formatCurrency(l.amount)}</td><td></td></tr>`;
    });
    bsRows += `
      <tr style="font-weight:700; border-top:1px solid var(--border-color); background:#fdfbf7;">
        <td colspan="2">Total Liabilities</td>
        <td class="text-right font-mono">${UI.formatCurrency(bs.liabilities.total)}</td>
      </tr>
      <tr style="background:var(--bg-card); font-weight:700;"><td colspan="3">CAPITAL & EQUITY</td></tr>
    `;
    bs.capital.accounts.forEach(c => {
      bsRows += `<tr><td style="padding-left:1.5rem;">${c.name}</td><td class="text-right font-mono">${UI.formatCurrency(c.amount)}</td><td></td></tr>`;
    });
    bsRows += `
      <tr><td style="padding-left:1.5rem;">Current Period Net Profit / (Loss)</td><td class="text-right font-mono">${UI.formatCurrency(bs.capital.currentNetProfit)}</td><td></td></tr>
      <tr style="font-weight:700; border-top:1px solid var(--border-color); background:#fdfbf7;">
        <td colspan="2">Total Capital & Equity</td>
        <td class="text-right font-mono">${UI.formatCurrency(bs.capital.total)}</td>
      </tr>
      <tr style="font-weight:700; background:#f0eae1; font-size:1.02rem;">
        <td colspan="2">Total Liabilities + Capital</td>
        <td class="text-right font-mono" style="color:var(--forest-green);">${UI.formatCurrency(bs.totalLiabilitiesAndCapital)}</td>
      </tr>
      <tr style="background:${bs.isBalanced ? 'var(--green-badge-bg)' : 'var(--red-badge-bg)'};">
        <td colspan="2">Balance Sheet Verification</td>
        <td class="text-right font-mono" style="font-weight:700; color:${bs.isBalanced ? 'var(--forest-green)' : 'var(--terracotta)'};">
          ${bs.isBalanced ? 'PERFECTLY BALANCED (Assets = Liabilities + Equity)' : 'UNBALANCED: Difference ' + UI.formatCurrency(bs.difference)}
        </td>
      </tr>
    `;
    bsBody.innerHTML = bsRows;

    // 3. Budget Report
    const budgetData = this.reportsService.getBudgetReport();
    const budgetBody = document.querySelector('#budget-report-table tbody');
    budgetBody.innerHTML = budgetData.map(b => `
      <tr>
        <td><strong>${b.name}</strong></td>
        <td>${b.analyticAccountName}</td>
        <td>${b.responsible}</td>
        <td class="text-right font-mono">${UI.formatCurrency(b.plannedAmount)}</td>
        <td class="text-right font-mono" style="font-weight:700;">${UI.formatCurrency(b.actualAmount)}</td>
        <td class="text-right font-mono" style="color:${b.remainingAmount >= 0 ? 'var(--forest-green)' : 'var(--terracotta)'}; font-weight:700;">${UI.formatCurrency(b.remainingAmount)}</td>
        <td>
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <div style="flex:1; background:#e5ddd0; height:8px; border-radius:4px; overflow:hidden;">
              <div style="width:${Math.min(100, b.percentUsed)}%; height:100%; background:${b.status === 'exceeded' ? 'var(--terracotta)' : b.status === 'warning' ? '#b45309' : 'var(--forest-green)'};"></div>
            </div>
            <span class="font-mono" style="font-size:0.75rem;">${b.percentUsed}%</span>
          </div>
        </td>
        <td><span class="status-pill status-${b.status === 'on_track' ? 'paid' : b.status === 'warning' ? 'warning' : 'cancelled'}">${b.status.replace('_', ' ')}</span></td>
      </tr>
    `).join('');
  },

  currentMasterTab: 'contacts',

  switchMasterSubTab(tab) {
    this.currentMasterTab = tab;
    ['contacts', 'products', 'accounts', 'journals', 'analytic', 'budgets'].forEach(t => {
      const el = document.getElementById('masters-subtab-' + t);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    document.querySelectorAll('#view-masters .sub-tab').forEach((st, idx) => {
      const tabsArr = ['contacts', 'products', 'accounts', 'journals', 'analytic', 'budgets'];
      st.classList.toggle('active', tabsArr[idx] === tab);
    });
    this.renderMasters();
  },

  renderMasters() {
    // 1. Contacts
    const cSearch = (document.getElementById('master-contacts-search')?.value || '').toLowerCase();
    const contactsBody = document.querySelector('#master-contacts-table tbody');
    if (contactsBody) {
      const contacts = this.masters.getContacts({ searchQuery: cSearch });
      if (contacts.length === 0) {
        contactsBody.innerHTML = '<tr><td colspan="7" class="text-center" style="padding:1.5rem; color:var(--text-sub);">No contacts found.</td></tr>';
      } else {
        contactsBody.innerHTML = contacts.map(c => `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td><span class="status-pill status-${c.type === 'Customer' ? 'paid' : c.type === 'Vendor' ? 'warning' : 'confirmed'}">${c.type}</span></td>
            <td>${c.email}</td>
            <td>${c.mobile || '-'}</td>
            <td>${c.address ? c.address.city + ', ' + c.address.state : '-'}</td>
            <td><span class="status-pill status-${c.isActive !== false ? 'confirmed' : 'draft'}">${c.isActive !== false ? 'Active' : 'Archived'}</span></td>
            <td class="text-center">
              <button class="btn btn-secondary btn-sm" onclick="App.openContactModal('${c.id}')">Edit</button>
              <button class="btn btn-secondary btn-sm" onclick="App.toggleArchiveContact('${c.id}')">${c.isActive !== false ? 'Archive' : 'Restore'}</button>
            </td>
          </tr>
        `).join('');
      }
    }

    // 2. Products
    const pSearch = (document.getElementById('master-products-search')?.value || '').toLowerCase();
    const productsBody = document.querySelector('#master-products-table tbody');
    if (productsBody) {
      const products = this.masters.getProducts({ searchQuery: pSearch });
      if (products.length === 0) {
        productsBody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:1.5rem; color:var(--text-sub);">No products found.</td></tr>';
      } else {
        productsBody.innerHTML = products.map(p => `
          <tr>
            <td><strong>${p.name}</strong></td>
            <td><span class="status-pill status-${p.type === 'Goods' ? 'confirmed' : p.type === 'Service' ? 'draft' : 'warning'}">${p.type}</span></td>
            <td>${p.category}</td>
            <td class="text-right font-mono">${UI.formatCurrency(p.salesPrice)}</td>
            <td class="text-right font-mono">${UI.formatCurrency(p.cost !== undefined ? p.cost : p.costPrice)}</td>
            <td class="text-right font-mono" style="font-weight:700;">${p.type === 'Service' ? 'N/A' : p.stock}</td>
            <td><span class="status-pill status-${p.isActive !== false ? 'confirmed' : 'draft'}">${p.isActive !== false ? 'Active' : 'Archived'}</span></td>
            <td class="text-center">
              <button class="btn btn-secondary btn-sm" onclick="App.openProductModal('${p.id}')">Edit</button>
              <button class="btn btn-secondary btn-sm" onclick="App.toggleArchiveProduct('${p.id}')">${p.isActive !== false ? 'Archive' : 'Restore'}</button>
            </td>
          </tr>
        `).join('');
      }
    }

    // 3. Chart of Accounts
    const aSearch = (document.getElementById('master-accounts-search')?.value || '').toLowerCase();
    const accountsBody = document.querySelector('#master-accounts-table tbody');
    if (accountsBody) {
      const accounts = this.masters.getAccounts({ searchQuery: aSearch });
      if (accounts.length === 0) {
        accountsBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:1.5rem; color:var(--text-sub);">No accounts found.</td></tr>';
      } else {
        accountsBody.innerHTML = accounts.map(a => `
          <tr>
            <td class="font-mono"><strong>${a.code}</strong></td>
            <td><strong>${a.name}</strong> ${a.isSystemAccount ? '<span style="font-size:0.7rem; color:var(--terracotta); margin-left:0.3rem;">[System]</span>' : ''}</td>
            <td><span class="status-pill status-confirmed">${a.type}</span></td>
            <td class="text-right font-mono">${UI.formatCurrency(a.currentBalance || 0)}</td>
            <td><span class="status-pill status-${a.isActive !== false ? 'confirmed' : 'draft'}">${a.isActive !== false ? 'Active' : 'Archived'}</span></td>
            <td class="text-center">
              <button class="btn btn-secondary btn-sm" onclick="App.openAccountModal('${a.id}')">Edit</button>
              ${!a.isSystemAccount ? `<button class="btn btn-secondary btn-sm" onclick="App.toggleArchiveAccount('${a.id}')">${a.isActive !== false ? 'Archive' : 'Restore'}</button>` : ''}
            </td>
          </tr>
        `).join('');
      }
    }

    // 4. Journals
    const jSearch = (document.getElementById('master-journals-search')?.value || '').toLowerCase();
    const journalsBody = document.querySelector('#master-journals-table tbody');
    if (journalsBody) {
      const journals = this.masters.getJournals({ searchQuery: jSearch });
      if (journals.length === 0) {
        journalsBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:1.5rem; color:var(--text-sub);">No journals found.</td></tr>';
      } else {
        journalsBody.innerHTML = journals.map(j => {
          const acc = this.masters.getAccountById(j.defaultAccountId);
          return `
            <tr>
              <td class="font-mono"><strong>${j.code || j.type}</strong></td>
              <td><strong>${j.name}</strong></td>
              <td><span class="status-pill status-draft">${j.type}</span></td>
              <td>${acc ? `[${acc.code}] ${acc.name}` : j.defaultAccountId}</td>
              <td><span class="status-pill status-${j.isActive !== false ? 'confirmed' : 'draft'}">${j.isActive !== false ? 'Active' : 'Archived'}</span></td>
              <td class="text-center">
                <button class="btn btn-secondary btn-sm" onclick="App.openJournalModal('${j.id}')">Edit</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }

    // 5. Analytic Accounts
    const anSearch = (document.getElementById('master-analytic-search')?.value || '').toLowerCase();
    const analyticBody = document.querySelector('#master-analytic-table tbody');
    if (analyticBody) {
      const analytics = this.masters.getAnalyticAccounts({ searchQuery: anSearch });
      if (analytics.length === 0) {
        analyticBody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:1.5rem; color:var(--text-sub);">No analytic accounts found.</td></tr>';
      } else {
        analyticBody.innerHTML = analytics.map(a => `
          <tr>
            <td class="font-mono"><strong>${a.code || a.id}</strong></td>
            <td><strong>${a.name}</strong></td>
            <td><span class="status-pill status-confirmed">${a.type}</span></td>
            <td><span class="status-pill status-${a.isActive !== false ? 'confirmed' : 'draft'}">${a.isActive !== false ? 'Active' : 'Archived'}</span></td>
            <td class="text-center">
              <button class="btn btn-secondary btn-sm" onclick="App.openAnalyticModal('${a.id}')">Edit</button>
            </td>
          </tr>
        `).join('');
      }
    }

    // 6. Budgets
    const bSearch = (document.getElementById('master-budgets-search')?.value || '').toLowerCase();
    const budgetsBody = document.querySelector('#master-budgets-table tbody');
    if (budgetsBody) {
      const budgets = this.masters.getBudgets({ searchQuery: bSearch });
      if (budgets.length === 0) {
        budgetsBody.innerHTML = '<tr><td colspan="6" class="text-center" style="padding:1.5rem; color:var(--text-sub);">No budgets found.</td></tr>';
      } else {
        budgetsBody.innerHTML = budgets.map(b => {
          const anl = this.masters.getAnalyticAccountById(b.analyticAccountId);
          return `
            <tr>
              <td><strong>${b.name}</strong></td>
              <td>${anl ? anl.name : b.analyticAccountId}</td>
              <td>${b.period}</td>
              <td>${b.responsible || b.responsiblePerson}</td>
              <td class="text-right font-mono" style="font-weight:700; color:var(--forest-green);">${UI.formatCurrency(b.plannedAmount)}</td>
              <td class="text-center">
                <button class="btn btn-secondary btn-sm" onclick="App.openBudgetModal('${b.id}')">Edit</button>
                <button class="btn btn-secondary btn-sm" style="color:var(--terracotta);" onclick="App.deleteBudget('${b.id}')">Delete</button>
              </td>
            </tr>
          `;
        }).join('');
      }
    }
  },

  openMasterAddModal() {
    if (this.currentMasterTab === 'contacts') this.openContactModal();
    else if (this.currentMasterTab === 'products') this.openProductModal();
    else if (this.currentMasterTab === 'accounts') this.openAccountModal();
    else if (this.currentMasterTab === 'journals') this.openJournalModal();
    else if (this.currentMasterTab === 'analytic') this.openAnalyticModal();
    else if (this.currentMasterTab === 'budgets') this.openBudgetModal();
  },

  // Contact Modal
  openContactModal(contactId) {
    const contact = contactId ? this.masters.getContactById(contactId) : null;
    const title = contact ? 'Edit Contact' : 'Create Contact';
    const html = `
      <form id="contact-form">
        <div class="form-group">
          <label class="form-label">Contact Name *</label>
          <input type="text" class="form-control" id="cnt-name" value="${contact ? contact.name : ''}" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type *</label>
            <select class="form-control" id="cnt-type">
              <option value="Customer" ${contact && contact.type === 'Customer' ? 'selected' : ''}>Customer</option>
              <option value="Vendor" ${contact && contact.type === 'Vendor' ? 'selected' : ''}>Vendor</option>
              <option value="Both" ${contact && contact.type === 'Both' ? 'selected' : ''}>Both (Customer & Vendor)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Email *</label>
            <input type="email" class="form-control" id="cnt-email" value="${contact ? contact.email : ''}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Mobile *</label>
            <input type="text" class="form-control" id="cnt-mobile" value="${contact ? contact.mobile : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">City *</label>
            <input type="text" class="form-control" id="cnt-city" value="${contact && contact.address ? contact.address.city : ''}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">State *</label>
            <input type="text" class="form-control" id="cnt-state" value="${contact && contact.address ? contact.address.state : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Pincode *</label>
            <input type="text" class="form-control" id="cnt-pincode" value="${contact && contact.address ? contact.address.pincode : ''}" required />
          </div>
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: contact ? 'Update Contact' : 'Create Contact', className: 'btn-primary', onClick: async () => {
        try {
          const contactData = {
            id: contact ? contact.id : undefined,
            name: document.getElementById('cnt-name').value,
            type: document.getElementById('cnt-type').value,
            email: document.getElementById('cnt-email').value,
            mobile: document.getElementById('cnt-mobile').value,
            address: {
              city: document.getElementById('cnt-city').value,
              state: document.getElementById('cnt-state').value,
              pincode: document.getElementById('cnt-pincode').value,
            }
          };
          const saved = this.masters.saveContact(contactData);
          if (typeof api !== 'undefined' && api.isOnline) {
            try {
              if (contact) await api.updateContact(contact.id, contactData);
              else await api.createContact({ ...contactData, id: saved.id });
            } catch (err) {
              console.warn('Backend Contact sync note:', err.message);
            }
          }
          UI.closeModal();
          UI.toast(`Contact ${contact ? 'updated' : 'created'}.`, 'success');
          this.renderMasters();
        } catch (e) {
          UI.toast(e.message, 'error');
        }
      }}
    ]);
  },

  toggleArchiveContact(contactId) {
    this.masters.archiveContact(contactId);
    UI.toast('Contact status toggled.', 'info');
    this.renderMasters();
  },

  // Product Modal
  openProductModal(productId) {
    const prod = productId ? this.masters.getProductById(productId) : null;
    const title = prod ? 'Edit Product' : 'Create Product';
    const html = `
      <form id="product-form">
        <div class="form-group">
          <label class="form-label">Product Name *</label>
          <input type="text" class="form-control" id="prd-name" value="${prod ? prod.name : ''}" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Type *</label>
            <select class="form-control" id="prd-type">
              <option value="Goods" ${prod && prod.type === 'Goods' ? 'selected' : ''}>Goods</option>
              <option value="Service" ${prod && prod.type === 'Service' ? 'selected' : ''}>Service</option>
              <option value="combo" ${prod && (prod.type === 'combo' || prod.type === 'Combo') ? 'selected' : ''}>Combo</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Category *</label>
            <input type="text" class="form-control" id="prd-cat" value="${prod ? prod.category : 'Seating'}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Sales Price (₹) *</label>
            <input type="number" min="0" step="0.01" class="form-control" id="prd-sales" value="${prod ? prod.salesPrice : 0}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Cost Price (₹) *</label>
            <input type="number" min="0" step="0.01" class="form-control" id="prd-cost" value="${prod ? (prod.cost !== undefined ? prod.cost : prod.costPrice) : 0}" required />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Initial Stock Level (for Goods/Combo)</label>
          <input type="number" min="0" class="form-control" id="prd-stock" value="${prod ? prod.stock : 10}" />
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: prod ? 'Update Product' : 'Create Product', className: 'btn-primary', onClick: async () => {
        try {
          const productData = {
            id: prod ? prod.id : undefined,
            name: document.getElementById('prd-name').value,
            type: document.getElementById('prd-type').value,
            category: document.getElementById('prd-cat').value,
            salesPrice: Number(document.getElementById('prd-sales').value),
            cost: Number(document.getElementById('prd-cost').value),
            costPrice: Number(document.getElementById('prd-cost').value),
            stock: Number(document.getElementById('prd-stock').value),
            stockQuantity: Number(document.getElementById('prd-stock').value),
          };
          const saved = this.masters.saveProduct(productData);
          if (typeof api !== 'undefined' && api.isOnline) {
            try {
              if (prod) await api.updateProduct(prod.id, productData);
              else await api.createProduct({ ...productData, id: saved.id });
            } catch (err) {
              console.warn('Backend Product sync note:', err.message);
            }
          }
          UI.closeModal();
          UI.toast(`Product ${prod ? 'updated' : 'created'}.`, 'success');
          this.renderMasters();
        } catch (e) {
          UI.toast(e.message, 'error');
        }
      }}
    ]);
  },

  toggleArchiveProduct(productId) {
    this.masters.archiveProduct(productId);
    UI.toast('Product status toggled.', 'info');
    this.renderMasters();
  },

  // Chart of Accounts Modal
  openAccountModal(accountId) {
    const acc = accountId ? this.masters.getAccountById(accountId) : null;
    const title = acc ? 'Edit Account' : 'Create Chart of Account';
    const html = `
      <form id="account-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Account Code *</label>
            <input type="text" class="form-control" id="acc-code" value="${acc ? acc.code : ''}" ${acc && acc.isSystemAccount ? 'readonly' : ''} required />
          </div>
          <div class="form-group">
            <label class="form-label">Account Type *</label>
            <select class="form-control" id="acc-type">
              <option value="Asset" ${acc && acc.type === 'Asset' ? 'selected' : ''}>Asset</option>
              <option value="Liability" ${acc && acc.type === 'Liability' ? 'selected' : ''}>Liability</option>
              <option value="Capital" ${acc && acc.type === 'Capital' ? 'selected' : ''}>Capital</option>
              <option value="Income" ${acc && acc.type === 'Income' ? 'selected' : ''}>Income</option>
              <option value="Expense" ${acc && acc.type === 'Expense' ? 'selected' : ''}>Expense</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Account Name *</label>
          <input type="text" class="form-control" id="acc-name" value="${acc ? acc.name : ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Opening / Current Balance (₹)</label>
          <input type="number" step="0.01" class="form-control" id="acc-bal" value="${acc ? (acc.currentBalance || 0) : 0}" />
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: acc ? 'Update Account' : 'Create Account', className: 'btn-primary', onClick: async () => {
        try {
          const accountData = {
            id: acc ? acc.id : undefined,
            code: document.getElementById('acc-code').value,
            name: document.getElementById('acc-name').value,
            type: document.getElementById('acc-type').value,
            currentBalance: Number(document.getElementById('acc-bal').value),
          };
          const saved = this.masters.saveAccount(accountData);
          if (typeof api !== 'undefined' && api.isOnline) {
            try {
              if (acc) await api.updateAccount(acc.id, accountData);
              else await api.createAccount({ ...accountData, id: saved.id });
            } catch (err) {
              console.warn('Backend Account sync note:', err.message);
            }
          }
          UI.closeModal();
          UI.toast(`Account ${acc ? 'updated' : 'created'}.`, 'success');
          this.renderMasters();
        } catch (e) {
          UI.toast(e.message, 'error');
        }
      }}
    ]);
  },

  toggleArchiveAccount(accountId) {
    try {
      this.masters.archiveAccount(accountId);
      UI.toast('Account status toggled.', 'info');
      this.renderMasters();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  // Journal Modal
  openJournalModal(journalId) {
    const jnl = journalId ? this.masters.getJournalById(journalId) : null;
    const title = jnl ? 'Edit Journal' : 'Create Journal';
    const accounts = this.masters.getAccounts();
    const accOptions = accounts.map(a => `<option value="${a.id}" ${jnl && jnl.defaultAccountId === a.id ? 'selected' : ''}>[${a.code}] ${a.name}</option>`).join('');

    const html = `
      <form id="journal-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Short Code *</label>
            <input type="text" class="form-control" id="jnl-code" value="${jnl ? (jnl.code || jnl.type) : ''}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Type *</label>
            <select class="form-control" id="jnl-type">
              <option value="Sales" ${jnl && jnl.type === 'Sales' ? 'selected' : ''}>Sales</option>
              <option value="Purchase" ${jnl && jnl.type === 'Purchase' ? 'selected' : ''}>Purchase</option>
              <option value="Bank" ${jnl && jnl.type === 'Bank' ? 'selected' : ''}>Bank</option>
              <option value="Cash" ${jnl && jnl.type === 'Cash' ? 'selected' : ''}>Cash</option>
              <option value="General" ${jnl && jnl.type === 'General' ? 'selected' : ''}>General</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Journal Name *</label>
          <input type="text" class="form-control" id="jnl-name" value="${jnl ? jnl.name : ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label">Default Posting Account *</label>
          <select class="form-control" id="jnl-acc" required>${accOptions}</select>
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: jnl ? 'Update Journal' : 'Create Journal', className: 'btn-primary', onClick: async () => {
        try {
          const journalData = {
            id: jnl ? jnl.id : undefined,
            code: document.getElementById('jnl-code').value,
            type: document.getElementById('jnl-type').value,
            name: document.getElementById('jnl-name').value,
            defaultAccountId: document.getElementById('jnl-acc').value,
          };
          const saved = this.masters.saveJournal(journalData);
          if (typeof api !== 'undefined' && api.isOnline) {
            try {
              if (jnl) await api.updateJournal(jnl.id, journalData);
              else await api.createJournal({ ...journalData, id: saved.id });
            } catch (err) {
              console.warn('Backend Journal sync note:', err.message);
            }
          }
          UI.closeModal();
          UI.toast(`Journal ${jnl ? 'updated' : 'created'}.`, 'success');
          this.renderMasters();
        } catch (e) {
          UI.toast(e.message, 'error');
        }
      }}
    ]);
  },

  // Analytic Modal
  openAnalyticModal(analyticId) {
    const anl = analyticId ? this.masters.getAnalyticAccountById(analyticId) : null;
    const title = anl ? 'Edit Analytic Account' : 'Create Analytic Account';
    const html = `
      <form id="analytic-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cost Center Code *</label>
            <input type="text" class="form-control" id="anl-code" value="${anl ? (anl.code || '') : 'CC-EXP'}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Type *</label>
            <select class="form-control" id="anl-type">
              <option value="Expenses" ${anl && anl.type === 'Expenses' ? 'selected' : ''}>Expenses</option>
              <option value="Income" ${anl && anl.type === 'Income' ? 'selected' : ''}>Income</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Analytic Account Name *</label>
          <input type="text" class="form-control" id="anl-name" value="${anl ? anl.name : ''}" required />
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: anl ? 'Update Analytic' : 'Create Analytic', className: 'btn-primary', onClick: async () => {
        try {
          const analyticData = {
            id: anl ? anl.id : undefined,
            code: document.getElementById('anl-code').value,
            type: document.getElementById('anl-type').value,
            name: document.getElementById('anl-name').value,
          };
          const saved = this.masters.saveAnalyticAccount(analyticData);
          if (typeof api !== 'undefined' && api.isOnline) {
            try {
              if (anl) await api.updateAnalytic(anl.id, analyticData);
              else await api.createAnalytic({ ...analyticData, id: saved.id });
            } catch (err) {
              console.warn('Backend Analytic sync note:', err.message);
            }
          }
          UI.closeModal();
          UI.toast(`Analytic account ${anl ? 'updated' : 'created'}.`, 'success');
          this.renderMasters();
        } catch (e) {
          UI.toast(e.message, 'error');
        }
      }}
    ]);
  },

  // Budget Modal
  openBudgetModal(budgetId) {
    const bgt = budgetId ? this.masters.getBudgetById(budgetId) : null;
    const title = bgt ? 'Edit Budget' : 'Create Budget';
    const analytics = this.masters.getAnalyticAccounts();
    const anlOptions = analytics.map(a => `<option value="${a.id}" ${bgt && bgt.analyticAccountId === a.id ? 'selected' : ''}>${a.name}</option>`).join('');

    const html = `
      <form id="budget-form">
        <div class="form-group">
          <label class="form-label">Budget Title *</label>
          <input type="text" class="form-control" id="bgt-name" value="${bgt ? bgt.name : ''}" required />
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Analytic Account *</label>
            <select class="form-control" id="bgt-anl" required>${anlOptions}</select>
          </div>
          <div class="form-group">
            <label class="form-label">Period Label *</label>
            <input type="text" class="form-control" id="bgt-period" value="${bgt ? bgt.period : '2026'}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Planned Amount (₹) *</label>
            <input type="number" min="1" step="0.01" class="form-control" id="bgt-amt" value="${bgt ? bgt.plannedAmount : 50000}" required />
          </div>
          <div class="form-group">
            <label class="form-label">Responsible Person *</label>
            <input type="text" class="form-control" id="bgt-resp" value="${bgt ? (bgt.responsible || bgt.responsiblePerson) : 'Rahul Sharma'}" required />
          </div>
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: bgt ? 'Update Budget' : 'Create Budget', className: 'btn-primary', onClick: async () => {
        try {
          const budgetData = {
            id: bgt ? bgt.id : undefined,
            name: document.getElementById('bgt-name').value,
            analyticAccountId: document.getElementById('bgt-anl').value,
            period: document.getElementById('bgt-period').value,
            plannedAmount: Number(document.getElementById('bgt-amt').value),
            responsible: document.getElementById('bgt-resp').value,
            responsiblePerson: document.getElementById('bgt-resp').value,
          };
          const saved = this.masters.saveBudget(budgetData);
          if (typeof api !== 'undefined' && api.isOnline) {
            try {
              if (bgt) await api.updateBudget(bgt.id, budgetData);
              else await api.createBudget({ ...budgetData, id: saved.id });
            } catch (err) {
              console.warn('Backend Budget sync note:', err.message);
            }
          }
          UI.closeModal();
          UI.toast(`Budget ${bgt ? 'updated' : 'created'}.`, 'success');
          this.renderMasters();
        } catch (e) {
          UI.toast(e.message, 'error');
        }
      }}
    ]);
  },

  deleteBudget(budgetId) {
    if (confirm('Delete this budget target?')) {
      this.masters.deleteBudget(budgetId);
      UI.toast('Budget deleted.', 'info');
      this.renderMasters();
    }
  },

  // ==========================================
  // CUSTOMER / USER PORTAL LOGIC
  // ==========================================
  refreshCustomerPortal() {
    this.renderCustomerPortal();
    UI.toast('Customer Portal refreshed with live data.', 'info');
  },

  renderCustomerPortal() {
    const custId = this.currentCustomerId || 'contact-nimesh';
    const customer = this.masters.getContactById(custId);
    const custName = customer ? customer.name : 'Valued Customer';

    const welcomeEl = document.getElementById('customer-portal-welcome');
    if (welcomeEl) {
      welcomeEl.innerText = `Welcome, ${custName}`;
    }

    // Get Invoices and Sales Orders for this customer
    const invoices = this.salesService.getInvoices().filter(i => i.customerId === custId);
    const orders = this.salesService.getSales().filter(s => s.customerId === custId);

    let totalInvoiced = 0;
    let totalDue = 0;
    let totalPaid = 0;

    invoices.forEach(inv => {
      totalInvoiced += Number(inv.grandTotal || 0);
      totalDue += Number(inv.balanceDue || 0);
      totalPaid += Number(inv.amountPaid || 0);
    });

    const totalEl = document.getElementById('cust-kpi-total');
    const dueEl = document.getElementById('cust-kpi-due');
    const paidEl = document.getElementById('cust-kpi-paid');

    if (totalEl) totalEl.innerText = UI.formatCurrency(totalInvoiced);
    if (dueEl) dueEl.innerText = UI.formatCurrency(totalDue);
    if (paidEl) paidEl.innerText = UI.formatCurrency(totalPaid);

    // Render Customer Invoices Table
    const invBody = document.querySelector('#customer-invoices-table tbody');
    if (invBody) {
      if (invoices.length === 0) {
        invBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding:2rem; color:var(--text-sub);">No invoices found for your account yet.</td></tr>`;
      } else {
        invBody.innerHTML = invoices.map(inv => {
          const isPaid = inv.status === 'paid' || inv.balanceDue === 0;
          const isPosted = inv.status === 'posted' && inv.balanceDue > 0;
          let actionHtml = '';

          if (isPosted) {
            actionHtml = `<button class="btn btn-success btn-sm" onclick="App.payCustomerInvoiceFromPortal('${inv.id}')" style="font-weight:700;">💳 Pay Invoice Now</button>`;
          } else if (isPaid) {
            actionHtml = `<span class="status-pill status-paid" style="font-size:0.8rem; font-weight:700;">✅ Paid (Settled)</span>`;
          } else {
            actionHtml = `<span class="status-pill status-draft" style="font-size:0.8rem;">Draft</span>`;
          }

          return `
            <tr>
              <td><strong>${inv.invoiceNumber}</strong></td>
              <td>${inv.soNumber || '-'}</td>
              <td>${UI.formatDate(inv.invoiceDate)}</td>
              <td>${UI.formatDate(inv.dueDate)}</td>
              <td class="text-right font-mono" style="font-weight:700;">${UI.formatCurrency(inv.grandTotal)}</td>
              <td class="text-right font-mono" style="color:var(--forest-green);">${UI.formatCurrency(inv.amountPaid)}</td>
              <td class="text-right font-mono" style="font-weight:700; color:${inv.balanceDue > 0 ? 'var(--terracotta)' : 'var(--forest-green)'};">${UI.formatCurrency(inv.balanceDue)}</td>
              <td><span class="status-pill status-${inv.status}">${inv.status}</span></td>
              <td class="text-center">${actionHtml}</td>
            </tr>
          `;
        }).join('');
      }
    }

    // Render Customer Sales Orders Table
    const ordBody = document.querySelector('#customer-orders-table tbody');
    if (ordBody) {
      if (orders.length === 0) {
        ordBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:2rem; color:var(--text-sub);">No sales orders placed yet.</td></tr>`;
      } else {
        ordBody.innerHTML = orders.map(so => `
          <tr>
            <td><strong>${so.soNumber}</strong></td>
            <td>${UI.formatDate(so.orderDate)}</td>
            <td>${(so.lines || []).map(l => l.productName + ' (' + l.quantity + ')').join(', ')}</td>
            <td class="text-right font-mono">${UI.formatCurrency(so.subtotal)}</td>
            <td class="text-right font-mono">${UI.formatCurrency(so.taxTotal)}</td>
            <td class="text-right font-mono" style="font-weight:700;">${UI.formatCurrency(so.grandTotal)}</td>
            <td><span class="status-pill status-${so.status}">${so.status}</span></td>
          </tr>
        `).join('');
      }
    }
  },

  payCustomerInvoiceFromPortal(invoiceId) {
    const inv = this.salesService.getInvoices().find(i => i.id === invoiceId);
    if (!inv) return UI.toast('Invoice not found', 'error');

    const html = `
      <form id="cust-pay-form">
        <div style="background:var(--bg-card); padding:1rem; border-radius:var(--radius-sm); margin-bottom:1rem; border:1px solid var(--border-light);">
          <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
            <span>Invoice Number:</span><strong>${inv.invoiceNumber}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; margin-bottom:0.4rem;">
            <span>Customer Name:</span><strong>${inv.customerName}</strong>
          </div>
          <div style="display:flex; justify-content:space-between;">
            <span>Amount Due:</span><strong style="color:var(--terracotta); font-size:1.1rem;">${UI.formatCurrency(inv.balanceDue)}</strong>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Payment Method *</label>
          <select class="form-control" id="cust-pay-method">
            <option value="Bank">Online NetBanking / UPI (HDFC Bank)</option>
            <option value="Cash">Cash at Store Counter</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Payment Amount (₹) *</label>
          <input type="number" step="0.01" min="0.01" max="${inv.balanceDue}" value="${inv.balanceDue}" class="form-control" id="cust-pay-amt" required />
        </div>
        <div class="form-group">
          <label class="form-label">Transaction Reference (Optional)</label>
          <input type="text" class="form-control" id="cust-pay-ref" value="ONLINE-UPI-${Math.floor(100000 + Math.random() * 900000)}" placeholder="e.g. UPI-992102" />
        </div>
      </form>
    `;

    UI.showModal(`Pay Invoice ${inv.invoiceNumber}`, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: '💳 Submit Payment Now', className: 'btn-success', onClick: async () => {
        try {
          const method = document.getElementById('cust-pay-method').value;
          const amount = Number(document.getElementById('cust-pay-amt').value);
          const reference = document.getElementById('cust-pay-ref').value;
          const paymentDate = new Date().toISOString().split('T')[0];

          if (!amount || amount <= 0) throw new Error('Please enter a valid amount.');

          const res = this.paymentsService.registerCustomerPayment({
            invoiceId: inv.id,
            method,
            paymentDate,
            reference,
            amount
          });

          if (typeof api !== 'undefined' && api.isOnline) {
            try {
              await api.registerPayment({
                targetDocumentType: 'CustomerInvoice',
                targetDocumentId: inv.id,
                method, paymentDate, reference, amount
              });
            } catch (err) {
              console.warn('Backend Payment sync note:', err.message);
            }
          }

          UI.closeModal();
          UI.toast(`Payment of ${UI.formatCurrency(amount)} received successfully! (${res.journalEntry.entryNumber}). Receipt generated.`, 'success');
          this.refreshCurrentView();
        } catch (e) {
          UI.toast(e.message, 'error');
        }
      }}
    ]);
  }
};

if (typeof window !== 'undefined') {
  window.App = App;
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => App.init(), 0);
  } else {
    window.addEventListener('DOMContentLoaded', () => App.init());
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { App };
}