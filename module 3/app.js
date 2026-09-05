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

  init() {
    this.masters = new MastersService(store);
    this.journalEngine = new JournalEngine(store, this.masters);
    this.purchasesService = new PurchasesService(store, this.masters, this.journalEngine);
    this.salesService = new SalesService(store, this.masters, this.journalEngine);
    this.paymentsService = new PaymentsService(store, this.masters, this.journalEngine);
    this.reportsService = new ReportsService(store, this.masters);

    UI.init();

    UI.registerTabRenderer('dashboard', () => this.renderDashboard());
    UI.registerTabRenderer('purchases', () => this.renderPurchases());
    UI.registerTabRenderer('sales', () => this.renderSales());
    UI.registerTabRenderer('payments', () => this.renderPayments());
    UI.registerTabRenderer('journal', () => this.renderJournal());
    UI.registerTabRenderer('reports', () => this.renderReports());
    UI.registerTabRenderer('masters', () => this.renderMasters());

    store.subscribe('change', () => this.refreshCurrentView());

    const resetBtn = document.getElementById('btn-reset-demo');
    if (resetBtn) resetBtn.onclick = () => this.resetDemoData();

    this.renderDashboard();
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

    const vendorOptions = vendors.map(v => `<option value="${v.id}">${v.name}</option>`).join('');
    const productOptions = products.map(p => `<option value="${p.id}" data-cost="${p.cost}">${p.name} - Cost: ${UI.formatCurrency(p.cost)} (Stock: ${p.stock})</option>`).join('');
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
    const cost = sel.options[sel.selectedIndex]?.getAttribute('data-cost');
    if (cost !== undefined) document.getElementById('po-price').value = cost;
    this.calcPOTotal();
  },

  calcPOTotal() {
    const qty = Number(document.getElementById('po-qty')?.value) || 0;
    const price = Number(document.getElementById('po-price')?.value) || 0;
    const totalEl = document.getElementById('po-total');
    if (totalEl) totalEl.value = UI.formatCurrency(qty * price);
  },

  submitNewPO() {
    try {
      const vendorId = document.getElementById('po-vendor').value;
      const orderDate = document.getElementById('po-date').value;
      const analyticAccountId = document.getElementById('po-analytic').value || null;
      const productId = document.getElementById('po-product').value;
      const quantity = Number(document.getElementById('po-qty').value);
      const unitPrice = Number(document.getElementById('po-price').value);

      const po = this.purchasesService.createPurchaseOrder({
        vendorId, orderDate,
        lines: [{ productId, analyticAccountId, quantity, unitPrice }]
      });
      UI.closeModal();
      UI.toast(`Purchase Order ${po.poNumber} created.`, 'success');
      this.renderPurchases();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  confirmPO(poId) {
    try {
      const po = this.purchasesService.confirmPurchaseOrder(poId);
      UI.toast(`PO ${po.poNumber} confirmed.`, 'success');
      this.renderPurchases();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  createBillFromPO(poId) {
    try {
      const bill = this.purchasesService.createVendorBillFromPO({ poId });
      this.switchPurchasesSubTab('bills');
      UI.toast(`Vendor Bill ${bill.billNumber} created from PO.`, 'info');
      this.renderPurchases();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  confirmBill(billId) {
    try {
      const { bill, journalEntry } = this.purchasesService.confirmVendorBill(billId);
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

    const customerOptions = customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const productOptions = products.map(p => `
      <option value="${p.id}" data-price="${p.salesPrice}">
        ${p.name} - Price: ${UI.formatCurrency(p.salesPrice)} (${p.type === 'Goods' ? 'Stock: ' + p.stock : 'Service'})
      </option>
    `).join('');
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
    const price = sel.options[sel.selectedIndex]?.getAttribute('data-price');
    if (price !== undefined) document.getElementById('so-price').value = price;
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

  submitNewSO() {
    try {
      const customerId = document.getElementById('so-customer').value;
      const orderDate = document.getElementById('so-date').value;
      const analyticAccountId = document.getElementById('so-analytic').value || null;
      const productId = document.getElementById('so-product').value;
      const quantity = Number(document.getElementById('so-qty').value);
      const unitPrice = Number(document.getElementById('so-price').value);
      const taxRate = Number(document.getElementById('so-tax').value);

      const so = this.salesService.createSalesOrder({
        customerId, orderDate,
        lines: [{ productId, analyticAccountId, quantity, unitPrice, taxRate }]
      });
      UI.closeModal();
      UI.toast(`Sales Order ${so.soNumber} created.`, 'success');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  confirmSO(soId) {
    try {
      const so = this.salesService.confirmSalesOrder(soId);
      UI.toast(`SO ${so.soNumber} confirmed after stock validation.`, 'success');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  createInvoiceFromSO(soId) {
    try {
      const inv = this.salesService.createCustomerInvoiceFromSO({ soId });
      this.switchSalesSubTab('invoices');
      UI.toast(`Customer Invoice ${inv.invoiceNumber} created from SO.`, 'info');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  confirmInvoice(invoiceId) {
    try {
      const { invoice, journalEntry } = this.salesService.confirmCustomerInvoice(invoiceId);
      UI.toast(`Invoice ${invoice.invoiceNumber} posted (${journalEntry.entryNumber}). Stock decremented.`, 'success');
      this.renderSales();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  },

  // ==========================================
  // PAYMENT REGISTRATION MODAL
  // ==========================================
  openPaymentModal(documentType, documentId) {
    let doc = null;
    let title = '';
    let partnerName = '';
    let balance = 0;

    if (documentType === 'VendorBill') {
      doc = this.purchasesService.getBills().find(b => b.id === documentId);
      title = `Vendor Payment for ${doc.billNumber}`;
      partnerName = doc.vendorName;
      balance = doc.balanceDue;
    } else {
      doc = this.salesService.getInvoices().find(i => i.id === documentId);
      title = `Customer Receipt for ${doc.invoiceNumber}`;
      partnerName = doc.customerName;
      balance = doc.balanceDue;
    }

    const html = `
      <form id="payment-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Partner</label>
            <input type="text" class="form-control" value="${partnerName}" readonly style="background:#f9f9f9;" />
          </div>
          <div class="form-group">
            <label class="form-label">Outstanding Balance</label>
            <input type="text" class="form-control" value="${UI.formatCurrency(balance)}" readonly style="background:#f9f9f9; font-weight:700; color:var(--terracotta);" />
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
            <label class="form-label">Payment Date</label>
            <input type="date" class="form-control" id="pay-date" value="${new Date().toISOString().split('T')[0]}" required />
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Payment Amount (₹) *</label>
            <input type="number" min="0.01" max="${balance}" value="${balance}" step="0.01" class="form-control" id="pay-amount" required />
          </div>
          <div class="form-group">
            <label class="form-label">Reference / Note</label>
            <input type="text" class="form-control" id="pay-ref" placeholder="e.g. NEFT-99128 or Cash Voucher" />
          </div>
        </div>
      </form>
    `;

    UI.showModal(title, html, [
      { label: 'Cancel', className: 'btn-secondary', onClick: () => UI.closeModal() },
      { label: 'Post Payment', className: 'btn-success', onClick: () => this.submitPayment(documentType, documentId) }
    ]);
  },

  submitPayment(documentType, documentId) {
    try {
      const method = document.getElementById('pay-method').value;
      const paymentDate = document.getElementById('pay-date').value;
      const amount = Number(document.getElementById('pay-amount').value);
      const reference = document.getElementById('pay-ref').value;

      if (documentType === 'VendorBill') {
        const res = this.paymentsService.registerVendorPayment({ billId: documentId, method, paymentDate, reference, amount });
        UI.closeModal();
        UI.toast(`Vendor Payment posted (${res.journalEntry.entryNumber}). Bill updated.`, 'success');
        this.renderPurchases();
      } else {
        const res = this.paymentsService.registerCustomerPayment({ invoiceId: documentId, method, paymentDate, reference, amount });
        UI.closeModal();
        UI.toast(`Customer Receipt posted (${res.journalEntry.entryNumber}). Invoice settled.`, 'success');
        this.renderSales();
      }
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

  renderMasters() {
    const contactsBody = document.querySelector('#master-contacts-table tbody');
    contactsBody.innerHTML = this.masters.getContacts().map(c => `
      <tr>
        <td><strong>${c.name}</strong></td>
        <td><span class="status-pill status-draft">${c.type}</span></td>
        <td>${c.email} <br/><span style="color:var(--text-sub); font-size:0.75rem;">${c.address.city}, ${c.address.state}</span></td>
      </tr>
    `).join('');

    const accountsBody = document.querySelector('#master-accounts-table tbody');
    accountsBody.innerHTML = this.masters.getAccounts().map(a => `
      <tr>
        <td class="font-mono">${a.code}</td>
        <td><strong>${a.name}</strong></td>
        <td><span class="status-pill status-confirmed">${a.type}</span></td>
      </tr>
    `).join('');
  }
};

window.addEventListener('DOMContentLoaded', () => {
  App.init();
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { App };
} else if (typeof window !== 'undefined') {
  window.App = App;
}