/**
 * Urban Furniture Accounting System - REST API Client & Synchronization Engine
 * Manages live communication between Frontend UI and Express + MySQL Backend Server
 */

class ApiClient {
  constructor(baseUrl = null) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    } else if (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http')) {
      this.baseUrl = `${window.location.origin}/api`;
    } else {
      this.baseUrl = 'http://localhost:5000/api';
    }
    this.isOnline = false;
    this.lastSyncTime = null;
    this.token = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('urban_token') : null;
  }

  setToken(token) {
    this.token = token;
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token) {
        window.localStorage.setItem('urban_token', token);
      } else {
        window.localStorage.removeItem('urban_token');
      }
    }
  }

  async checkHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/health`, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        this.isOnline = data.status === 'UP';
        return this.isOnline;
      }
    } catch (e) {
      this.isOnline = false;
    }
    return false;
  }

  async request(endpoint, method = 'GET', body = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    if (this.token) {
      options.headers['Authorization'] = `Bearer ${this.token}`;
    } else {
      options.headers['x-allow-anonymous'] = 'true';
    }
    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      const res = await fetch(`${this.baseUrl}${endpoint}`, options);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || `API Request failed with status ${res.status}`);
      }
      return data;
    } catch (error) {
      console.warn(`API [${method} ${endpoint}] connection error:`, error.message);
      throw error;
    }
  }

  /**
   * Full Data Synchronization Engine with Store
   */
  async syncWithStore(storeInstance) {
    const online = await this.checkHealth();
    if (!online) {
      console.log('Backend API server offline. Continuing with client storage.');
      return false;
    }

    try {
      console.log('Synchronizing with Express + MySQL Backend API...');

      const [contactsRes, productsRes, accountsRes, journalsRes, analyticsRes, budgetsRes, purchasesRes, billsRes, salesRes, invoicesRes, paymentsRes, entriesRes] = await Promise.all([
        this.getContacts(),
        this.getProducts(),
        this.getAccounts(),
        this.getJournals(),
        this.getAnalytics(),
        this.getBudgets(),
        this.getPurchases(),
        this.getBills(),
        this.getSales(),
        this.getInvoices(),
        this.getPayments(),
        this.getJournalEntries()
      ]);

      if (contactsRes && contactsRes.data) storeInstance.set('urban_contacts', contactsRes.data.map(c => this.normalizeContact(c)));
      if (productsRes && productsRes.data) storeInstance.set('urban_products', productsRes.data.map(p => this.normalizeProduct(p)));
      if (accountsRes && accountsRes.data) storeInstance.set('urban_accounts', accountsRes.data.map(a => this.normalizeAccount(a)));
      if (journalsRes && journalsRes.data) storeInstance.set('urban_journals', journalsRes.data.map(j => this.normalizeJournal(j)));
      if (analyticsRes && analyticsRes.data) storeInstance.set('urban_analytic_accounts', analyticsRes.data.map(an => this.normalizeAnalytic(an)));
      if (budgetsRes && budgetsRes.data) storeInstance.set('urban_budgets', budgetsRes.data.map(b => this.normalizeBudget(b)));
      if (purchasesRes && purchasesRes.data) storeInstance.set('urban_purchases', purchasesRes.data.map(po => this.normalizePO(po)));
      if (billsRes && billsRes.data) storeInstance.set('urban_bills', billsRes.data.map(b => this.normalizeBill(b)));
      if (salesRes && salesRes.data) storeInstance.set('urban_sales', salesRes.data.map(so => this.normalizeSO(so)));
      if (invoicesRes && invoicesRes.data) storeInstance.set('urban_invoices', invoicesRes.data.map(inv => this.normalizeInvoice(inv)));
      if (paymentsRes && paymentsRes.data) storeInstance.set('urban_payments', paymentsRes.data.map(p => this.normalizePayment(p)));
      if (entriesRes && entriesRes.data) storeInstance.set('urban_journal_entries', entriesRes.data.map(e => this.normalizeEntry(e)));

      this.lastSyncTime = new Date();
      console.log('Backend MySQL Synchronization successful at', this.lastSyncTime.toLocaleTimeString());
      return true;
    } catch (err) {
      console.error('Error during MySQL synchronization:', err.message);
      return false;
    }
  }

  // --- ENTITY NORMALIZERS ---
  normalizeContact(c) {
    if (!c) return c;
    const city = c.city || (c.address && c.address.city) || '';
    const state = c.state || (c.address && c.address.state) || '';
    const pincode = c.pincode || (c.address && c.address.pincode) || '';
    const streetAddress = c.street_address || c.streetAddress || (c.address && c.address.streetAddress) || '';
    return {
      ...c,
      city,
      state,
      pincode,
      streetAddress,
      address: c.address || { city, state, pincode, streetAddress },
      isActive: c.is_active !== undefined ? Boolean(c.is_active) : (c.isActive !== false)
    };
  }

  normalizeProduct(p) {
    if (!p) return p;
    const salesPrice = Number(p.sales_price !== undefined ? p.sales_price : (p.salesPrice || 0));
    const cost = Number(p.cost_price !== undefined ? p.cost_price : (p.cost !== undefined ? p.cost : (p.costPrice || 0)));
    const stock = Number(p.stock_quantity !== undefined ? p.stock_quantity : (p.stock !== undefined ? p.stock : (p.stockQuantity || 0)));
    return {
      ...p,
      salesPrice,
      cost,
      costPrice: cost,
      stock,
      stockQuantity: stock,
      category: p.category || p.category_name || 'General',
      isActive: p.is_active !== undefined ? Boolean(p.is_active) : (p.isActive !== false)
    };
  }

  normalizeAccount(a) {
    if (!a) return a;
    return {
      ...a,
      currentBalance: Number(a.current_balance !== undefined ? a.current_balance : (a.currentBalance || 0)),
      isSystemAccount: a.is_system_account !== undefined ? Boolean(a.is_system_account) : Boolean(a.isSystemAccount),
      isActive: a.is_active !== undefined ? Boolean(a.is_active) : (a.isActive !== false)
    };
  }

  normalizeJournal(j) {
    if (!j) return j;
    return {
      ...j,
      defaultAccountId: j.default_account_id || j.defaultAccountId || null,
      isActive: j.is_active !== undefined ? Boolean(j.is_active) : (j.isActive !== false)
    };
  }

  normalizeAnalytic(an) {
    if (!an) return an;
    return {
      ...an,
      isActive: an.is_active !== undefined ? Boolean(an.is_active) : (an.isActive !== false)
    };
  }

  normalizeBudget(b) {
    if (!b) return b;
    return {
      ...b,
      analyticAccountId: b.analytic_account_id || b.analyticAccountId || null,
      plannedAmount: Number(b.planned_amount !== undefined ? b.planned_amount : (b.plannedAmount || 0)),
      responsible: b.responsible_person || b.responsible || b.responsiblePerson || '',
      responsiblePerson: b.responsible_person || b.responsiblePerson || b.responsible || ''
    };
  }

  normalizePO(po) {
    if (!po) return po;
    return {
      ...po,
      poNumber: po.po_number || po.poNumber || '',
      vendorId: po.vendor_id || po.vendorId || '',
      vendorName: po.vendor_name || po.vendorName || '',
      orderDate: po.order_date || po.orderDate || '',
      totalAmount: Number(po.total_amount !== undefined ? po.total_amount : (po.totalAmount || 0)),
      lines: (po.lines || []).map(l => ({
        ...l,
        productId: l.product_id || l.productId || '',
        productName: l.product_name || l.productName || '',
        quantity: Number(l.quantity || 0),
        unitPrice: Number(l.unit_price !== undefined ? l.unit_price : (l.unitPrice || 0)),
        subtotal: Number(l.subtotal || 0)
      }))
    };
  }

  normalizeBill(b) {
    if (!b) return b;
    return {
      ...b,
      billNumber: b.bill_number || b.billNumber || '',
      poNumber: b.po_number || b.poNumber || '',
      purchaseOrderId: b.purchase_order_id || b.purchaseOrderId || '',
      vendorId: b.vendor_id || b.vendorId || '',
      vendorName: b.vendor_name || b.vendorName || '',
      billDate: b.bill_date || b.billDate || '',
      dueDate: b.due_date || b.dueDate || '',
      totalAmount: Number(b.total_amount !== undefined ? b.total_amount : (b.totalAmount || 0)),
      amountPaid: Number(b.amount_paid !== undefined ? b.amount_paid : (b.amountPaid || 0)),
      balanceDue: Number(b.balance_due !== undefined ? b.balance_due : (b.balanceDue || 0)),
      journalEntryId: b.journal_entry_id || b.journalEntryId || null,
      lines: (b.lines || []).map(l => ({
        ...l,
        productId: l.product_id || l.productId || '',
        productName: l.product_name || l.productName || '',
        quantity: Number(l.quantity || 0),
        unitPrice: Number(l.unit_price !== undefined ? l.unit_price : (l.unitPrice || 0)),
        subtotal: Number(l.subtotal || 0)
      }))
    };
  }

  normalizeSO(so) {
    if (!so) return so;
    return {
      ...so,
      soNumber: so.so_number || so.soNumber || '',
      customerId: so.customer_id || so.customerId || '',
      customerName: so.customer_name || so.customerName || '',
      orderDate: so.order_date || so.orderDate || '',
      subtotal: Number(so.subtotal || 0),
      taxTotal: Number(so.tax_total !== undefined ? so.tax_total : (so.taxTotal || 0)),
      grandTotal: Number(so.grand_total !== undefined ? so.grand_total : (so.grandTotal || 0)),
      lines: (so.lines || []).map(l => ({
        ...l,
        productId: l.product_id || l.productId || '',
        productName: l.product_name || l.productName || '',
        quantity: Number(l.quantity || 0),
        unitPrice: Number(l.unit_price !== undefined ? l.unit_price : (l.unitPrice || 0)),
        taxRate: Number(l.tax_rate !== undefined ? l.tax_rate : (l.taxRate || 0)),
        subtotal: Number(l.subtotal || 0),
        taxAmount: Number(l.tax_amount !== undefined ? l.tax_amount : (l.taxAmount || 0)),
        total: Number(l.total || 0)
      }))
    };
  }

  normalizeInvoice(inv) {
    if (!inv) return inv;
    return {
      ...inv,
      invoiceNumber: inv.invoice_number || inv.invoiceNumber || '',
      soNumber: inv.so_number || inv.soNumber || '',
      salesOrderId: inv.sales_order_id || inv.salesOrderId || '',
      customerId: inv.customer_id || inv.customerId || '',
      customerName: inv.customer_name || inv.customerName || '',
      invoiceDate: inv.invoice_date || inv.invoiceDate || '',
      dueDate: inv.due_date || inv.dueDate || '',
      subtotal: Number(inv.subtotal || 0),
      taxTotal: Number(inv.tax_total !== undefined ? inv.tax_total : (inv.taxTotal || 0)),
      grandTotal: Number(inv.grand_total !== undefined ? inv.grand_total : (inv.grandTotal || 0)),
      amountPaid: Number(inv.amount_paid !== undefined ? inv.amount_paid : (inv.amountPaid || 0)),
      balanceDue: Number(inv.balance_due !== undefined ? inv.balance_due : (inv.balanceDue || 0)),
      journalEntryId: inv.journal_entry_id || inv.journalEntryId || null,
      lines: (inv.lines || []).map(l => ({
        ...l,
        productId: l.product_id || l.productId || '',
        productName: l.product_name || l.productName || '',
        quantity: Number(l.quantity || 0),
        unitPrice: Number(l.unit_price !== undefined ? l.unit_price : (l.unitPrice || 0)),
        subtotal: Number(l.subtotal || 0)
      }))
    };
  }

  normalizePayment(p) {
    if (!p) return p;
    return {
      ...p,
      paymentNumber: p.payment_number || p.paymentNumber || '',
      direction: p.direction || '',
      partnerId: p.partner_id || p.partnerId || '',
      partnerName: p.partner_name || p.partnerName || '',
      targetDocumentType: p.target_document_type || p.targetDocumentType || '',
      targetDocumentId: p.target_document_id || p.targetDocumentId || '',
      targetDocumentNumber: p.target_document_number || p.targetDocumentNumber || '',
      paymentDate: p.payment_date || p.paymentDate || '',
      method: p.method || '',
      amount: Number(p.amount || 0),
      reference: p.reference || '',
      journalEntryId: p.journal_entry_id || p.journalEntryId || null
    };
  }

  normalizeEntry(e) {
    if (!e) return e;
    return {
      ...e,
      entryNumber: e.entry_number || e.entryNumber || '',
      journalId: e.journal_id || e.journalId || '',
      date: e.date || '',
      reference: e.reference || '',
      totalDebit: Number(e.total_debit !== undefined ? e.total_debit : (e.totalDebit || 0)),
      totalCredit: Number(e.total_credit !== undefined ? e.total_credit : (e.totalCredit || 0)),
      lines: (e.lines || []).map(l => ({
        ...l,
        accountId: l.account_id || l.accountId || '',
        partnerId: l.partner_id || l.partnerId || null,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0)
      }))
    };
  }

  // --- AUTH ---
  async login(username, password) {
    const res = await this.request('/auth/login', 'POST', { username, password });
    const token = res ? (res.token || (res.data && res.data.token)) : null;
    if (token) {
      this.setToken(token);
    }
    return res;
  }

  async register(userData) {
    return this.request('/auth/register', 'POST', userData);
  }

  async getMe() {
    return this.request('/auth/me', 'GET');
  }

  // --- MASTERS ---
  async getContacts(filter) { return this.request(`/contacts?${new URLSearchParams(filter || {}).toString()}`); }
  async createContact(data) { return this.request('/contacts', 'POST', data); }
  async updateContact(id, data) { return this.request(`/contacts/${id}`, 'PUT', data); }
  async deleteContact(id) { return this.request(`/contacts/${id}`, 'DELETE'); }

  async getProducts(filter) { return this.request(`/products?${new URLSearchParams(filter || {}).toString()}`); }
  async createProduct(data) { return this.request('/products', 'POST', data); }
  async updateProduct(id, data) { return this.request(`/products/${id}`, 'PUT', data); }
  async deleteProduct(id) { return this.request(`/products/${id}`, 'DELETE'); }

  async getAccounts(filter) { return this.request(`/accounts?${new URLSearchParams(filter || {}).toString()}`); }
  async createAccount(data) { return this.request('/accounts', 'POST', data); }
  async updateAccount(id, data) { return this.request(`/accounts/${id}`, 'PUT', data); }
  async deleteAccount(id) { return this.request(`/accounts/${id}`, 'DELETE'); }

  async getJournals() { return this.request('/journals'); }
  async createJournal(data) { return this.request('/journals', 'POST', data); }
  async updateJournal(id, data) { return this.request(`/journals/${id}`, 'PUT', data); }
  async deleteJournal(id) { return this.request(`/journals/${id}`, 'DELETE'); }

  async getAnalytics() { return this.request('/analytics'); }
  async createAnalytic(data) { return this.request('/analytics', 'POST', data); }
  async updateAnalytic(id, data) { return this.request(`/analytics/${id}`, 'PUT', data); }
  async deleteAnalytic(id) { return this.request(`/analytics/${id}`, 'DELETE'); }

  async getBudgets() { return this.request('/budgets'); }
  async createBudget(data) { return this.request('/budgets', 'POST', data); }
  async updateBudget(id, data) { return this.request(`/budgets/${id}`, 'PUT', data); }
  async deleteBudget(id) { return this.request(`/budgets/${id}`, 'DELETE'); }

  // --- PURCHASES ---
  async getPurchases() { return this.request('/purchases/orders'); }
  async createPurchaseOrder(data) { return this.request('/purchases/orders', 'POST', data); }
  async confirmPurchaseOrder(id) { return this.request(`/purchases/orders/${id}/confirm`, 'POST'); }
  async getBills() { return this.request('/purchases/bills'); }
  async createBill(data) { return this.request('/purchases/bills', 'POST', data); }
  async confirmBill(id) { return this.request(`/purchases/bills/${id}/confirm`, 'POST'); }

  // --- SALES ---
  async getSales() { return this.request('/sales/orders'); }
  async createSalesOrder(data) { return this.request('/sales/orders', 'POST', data); }
  async confirmSalesOrder(id) { return this.request(`/sales/orders/${id}/confirm`, 'POST'); }
  async getInvoices() { return this.request('/sales/invoices'); }
  async createInvoice(data) { return this.request('/sales/invoices', 'POST', data); }
  async confirmInvoice(id) { return this.request(`/sales/invoices/${id}/confirm`, 'POST'); }

  // --- PAYMENTS ---
  async getPayments() { return this.request('/payments'); }
  async registerPayment(data) { return this.request('/payments', 'POST', data); }

  // --- JOURNAL ENTRIES ---
  async getJournalEntries() { return this.request('/journal-entries'); }
  async createJournalEntry(data) { return this.request('/journal-entries', 'POST', data); }

  // --- REPORTS ---
  async getDashboardKPIs() { return this.request('/reports/kpis'); }
  async getProfitAndLoss() { return this.request('/reports/pl'); }
  async getBalanceSheet() { return this.request('/reports/balance-sheet'); }
  async getBudgetVariance() { return this.request('/reports/budget-variance'); }
}

const api = new ApiClient();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { api, ApiClient };
} else if (typeof window !== 'undefined') {
  window.api = api;
}
