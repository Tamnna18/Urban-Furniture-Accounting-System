/**
 * Member 2 - Master Data Module for Urban Furniture Accounting System
 * Owns Contacts, Products, Chart of Accounts, Journals, Analytic Accounts, Budgets
 * Full CRUD, Validation, Search/Filter, Image Compression, and Shared Data Contract
 */

const SEED_CONTACTS = [
  { id: 'contact-azure', name: 'Azure Furniture', type: 'Vendor', email: 'orders@azurefurniture.com', mobile: '9876543210', address: { streetAddress: '102 Industrial Zone', city: 'Mumbai', state: 'Maharashtra', pincode: '400001' }, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'contact-rahul', name: 'Rahul Sharma', type: 'Vendor', email: 'rahul@sharmawood.in', mobile: '9822012345', address: { streetAddress: '45 Sawmill Lane', city: 'Jaipur', state: 'Rajasthan', pincode: '302001' }, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'contact-nimesh', name: 'Nimesh Pathak', type: 'Customer', email: 'nimesh@pathak.com', mobile: '9988776655', address: { streetAddress: '88 Heritage Park', city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' }, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'contact-om', name: 'Om Furniture', type: 'Both', email: 'info@omfurniture.com', mobile: '9123456789', address: { streetAddress: '12 Connaught Hub', city: 'Delhi', state: 'Delhi', pincode: '110001' }, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' }
];

const SEED_PRODUCTS = [
  { id: 'prod-office-chair', name: 'Office Chair', type: 'Goods', salesPrice: 3500, cost: 2000, costPrice: 2000, category: 'Seating', stock: 15, stockQuantity: 15, description: 'Ergonomic high-back office chair', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'prod-wooden-chair', name: 'Wooden Chair', type: 'Goods', salesPrice: 2800, cost: 1500, costPrice: 1500, category: 'Seating', stock: 20, stockQuantity: 20, description: 'Solid teakwood dining chair', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'prod-wooden-table', name: 'Wooden Table', type: 'Goods', salesPrice: 7500, cost: 4500, costPrice: 4500, category: 'Tables', stock: 8, stockQuantity: 8, description: 'Handcrafted 6-seater dining table', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'prod-assembly-svc', name: 'Assembly Service', type: 'Service', salesPrice: 800, cost: 0, costPrice: 0, category: 'Services', stock: 0, stockQuantity: 0, description: 'On-site furniture installation', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' }
];

const SEED_ACCOUNTS = [
  { id: 'acc-cash', name: 'Cash in Hand', type: 'Asset', code: '1010', currentBalance: 25000, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-bank', name: 'HDFC Bank', type: 'Asset', code: '1020', currentBalance: 485000, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-debtors', name: 'Debtors (Accounts Receivable)', type: 'Asset', code: '1030', currentBalance: 120000, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-creditors', name: 'Creditors (Accounts Payable)', type: 'Liability', code: '2010', currentBalance: 65000, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-tax-payable', name: 'Tax Payable', type: 'Liability', code: '2020', currentBalance: 1750, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-capital', name: 'Owner Capital', type: 'Capital', code: '3010', currentBalance: 1000000, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-sales-income', name: 'Sales Income', type: 'Income', code: '4010', currentBalance: 850000, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-purchase-expense', name: 'Purchases Expense', type: 'Expense', code: '5010', currentBalance: 310000, isSystemAccount: true, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'acc-other-expense', name: 'Other Operating Expenses', type: 'Expense', code: '5020', currentBalance: 45000, isSystemAccount: false, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' }
];

const SEED_JOURNALS = [
  { id: 'jrnl-sales', name: 'Sales Journal', type: 'Sales', code: 'SJ', defaultAccountId: 'acc-sales-income', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'jrnl-purchase', name: 'Purchase Journal', type: 'Purchase', code: 'PJ', defaultAccountId: 'acc-purchase-expense', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'jrnl-bank', name: 'Bank Journal', type: 'Bank', code: 'BNK', defaultAccountId: 'acc-bank', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'jrnl-cash', name: 'Cash Journal', type: 'Cash', code: 'CSH', defaultAccountId: 'acc-cash', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' }
];

const SEED_ANALYTIC_ACCOUNTS = [
  { id: 'ana-showroom', name: 'Showroom Expansion', code: 'CC-SHOWROOM', type: 'Expenses', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'ana-online', name: 'Online Store Operations', code: 'CC-ONLINE', type: 'Income', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' }
];

const SEED_BUDGETS = [
  { id: 'bgt-2026-showroom', name: 'Showroom Setup 2026', period: '2026', periodObj: { startDate: '2026-01-01', endDate: '2026-12-31', label: '2026' }, responsible: 'Rahul Sharma', responsiblePerson: 'Rahul Sharma', plannedAmount: 50000, analyticAccountId: 'ana-showroom', createdAt: '2026-01-01T00:00:00.000Z' }
];

class MastersService {
  constructor(storeInstance) {
    this.store = storeInstance;
    this.init();
  }

  init(forceReset = false) {
    if (forceReset || !this.store.get('urban_contacts') || this.store.get('urban_contacts').length === 0) {
      this.store.set('urban_contacts', SEED_CONTACTS);
    }
    if (forceReset || !this.store.get('urban_products') || this.store.get('urban_products').length === 0) {
      this.store.set('urban_products', SEED_PRODUCTS);
    }
    if (forceReset || !this.store.get('urban_accounts') || this.store.get('urban_accounts').length === 0) {
      this.store.set('urban_accounts', SEED_ACCOUNTS);
    }
    if (forceReset || !this.store.get('urban_journals') || this.store.get('urban_journals').length === 0) {
      this.store.set('urban_journals', SEED_JOURNALS);
    }
    if (forceReset || !this.store.get('urban_analytic_accounts') || this.store.get('urban_analytic_accounts').length === 0) {
      this.store.set('urban_analytic_accounts', SEED_ANALYTIC_ACCOUNTS);
    }
    if (forceReset || !this.store.get('urban_budgets') || this.store.get('urban_budgets').length === 0) {
      this.store.set('urban_budgets', SEED_BUDGETS);
    }
  }

  // --- CONTACTS ---
  getContacts(filter) {
    let contacts = this.store.get('urban_contacts', []);
    if (!filter) return contacts;

    if (filter.type && filter.type !== 'All') {
      contacts = contacts.filter(c => c.type === filter.type || c.type === 'Both');
    }
    if (filter.status === 'Active') {
      contacts = contacts.filter(c => c.isActive !== false);
    } else if (filter.status === 'Archived') {
      contacts = contacts.filter(c => c.isActive === false);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      contacts = contacts.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.email.toLowerCase().includes(q) || 
        (c.mobile && c.mobile.includes(q)) ||
        (c.address && c.address.city && c.address.city.toLowerCase().includes(q))
      );
    }
    return contacts;
  }

  getContactById(id) {
    return this.getContacts().find(c => c.id === id);
  }

  getVendors() {
    return this.getContacts().filter(c => (c.type === 'Vendor' || c.type === 'Both') && c.isActive !== false);
  }

  getCustomers() {
    return this.getContacts().filter(c => (c.type === 'Customer' || c.type === 'Both') && c.isActive !== false);
  }

  saveContact(data) {
    if (!data.name || !data.name.trim()) throw new Error('Contact name is required.');
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Valid email address is required.');
    if (!data.mobile || !/^\d{10,12}$/.test(data.mobile.replace(/\D/g, ''))) throw new Error('Mobile phone must be 10-12 digits.');
    if (!data.address || !data.address.city) throw new Error('City is required.');
    if (!data.address.pincode || !/^\d{6}$/.test(data.address.pincode)) throw new Error('Pincode must be 6 digits.');

    const contacts = this.store.get('urban_contacts', []);
    const now = new Date().toISOString();

    if (data.id) {
      const idx = contacts.findIndex(c => c.id === data.id);
      if (idx !== -1) {
        contacts[idx] = { ...contacts[idx], ...data, updatedAt: now };
        this.store.set('urban_contacts', contacts);
        return contacts[idx];
      }
    }

    const newContact = {
      ...data,
      id: 'contact-' + Date.now(),
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };
    contacts.unshift(newContact);
    this.store.set('urban_contacts', contacts);
    return newContact;
  }

  archiveContact(id) {
    const contacts = this.store.get('urban_contacts', []);
    const c = contacts.find(item => item.id === id);
    if (c) {
      c.isActive = !c.isActive;
      c.updatedAt = new Date().toISOString();
      this.store.set('urban_contacts', contacts);
      return true;
    }
    return false;
  }

  // --- PRODUCTS ---
  getProducts(filter) {
    let products = this.store.get('urban_products', []);
    if (!filter) return products;

    if (filter.type && filter.type !== 'All') {
      const t = filter.type.toLowerCase();
      products = products.filter(p => p.type.toLowerCase() === t);
    }
    if (filter.category && filter.category !== 'All') {
      products = products.filter(p => p.category === filter.category);
    }
    if (filter.status === 'Active') {
      products = products.filter(p => p.isActive !== false);
    } else if (filter.status === 'Archived') {
      products = products.filter(p => p.isActive === false);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      products = products.filter(p => 
        p.name.toLowerCase().includes(q) || 
        p.category.toLowerCase().includes(q)
      );
    }
    return products;
  }

  getProductById(id) {
    return this.getProducts().find(p => p.id === id);
  }

  saveProduct(data) {
    if (!data.name || !data.name.trim()) throw new Error('Product name is required.');
    if (!data.category || !data.category.trim()) throw new Error('Category is required.');

    const sp = Number(data.salesPrice);
    if (isNaN(sp) || sp < 0) throw new Error('Sales price must be a valid number >= 0.');

    const cp = Number(data.cost !== undefined ? data.cost : data.costPrice);
    if (isNaN(cp) || cp < 0) throw new Error('Cost price must be a valid number >= 0.');

    const products = this.store.get('urban_products', []);
    const now = new Date().toISOString();

    const costVal = cp;
    const stockVal = data.type === 'Service' ? 0 : (data.stock !== undefined ? Number(data.stock) : Number(data.stockQuantity || 0));

    if (data.id) {
      const idx = products.findIndex(p => p.id === data.id);
      if (idx !== -1) {
        products[idx] = {
          ...products[idx],
          ...data,
          cost: costVal,
          costPrice: costVal,
          stock: stockVal,
          stockQuantity: stockVal,
          updatedAt: now
        };
        this.store.set('urban_products', products);
        return products[idx];
      }
    }

    const newProduct = {
      ...data,
      id: 'prod-' + Date.now(),
      cost: costVal,
      costPrice: costVal,
      stock: stockVal,
      stockQuantity: stockVal,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };
    products.unshift(newProduct);
    this.store.set('urban_products', products);
    return newProduct;
  }

  adjustProductStock(id, deltaQuantity) {
    const products = this.getProducts();
    const product = products.find(p => p.id === id);
    if (!product) throw new Error('Product ' + id + ' not found.');
    if (product.type === 'Goods' || product.type === 'combo' || product.type === 'Combo') {
      const newStock = (product.stock || 0) + deltaQuantity;
      if (newStock < 0) {
        throw new Error('Insufficient stock for ' + product.name + '. Current: ' + (product.stock || 0) + ', required deduction: ' + Math.abs(deltaQuantity));
      }
      product.stock = newStock;
      product.stockQuantity = newStock;
      this.store.set('urban_products', products);
      this.store.emit('stock:updated', { productId: id, stock: newStock });
    }
    return product;
  }

  archiveProduct(id) {
    const products = this.getProducts();
    const p = products.find(item => item.id === id);
    if (p) {
      p.isActive = !p.isActive;
      p.updatedAt = new Date().toISOString();
      this.store.set('urban_products', products);
      return true;
    }
    return false;
  }

  // --- CHART OF ACCOUNTS ---
  getAccounts(filter) {
    let accounts = this.store.get('urban_accounts', []);
    if (!filter) return accounts;

    if (filter.type && filter.type !== 'All') {
      accounts = accounts.filter(a => a.type === filter.type);
    }
    if (filter.status === 'Active') {
      accounts = accounts.filter(a => a.isActive !== false);
    } else if (filter.status === 'Archived') {
      accounts = accounts.filter(a => a.isActive === false);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      accounts = accounts.filter(a => 
        a.name.toLowerCase().includes(q) || 
        a.code.toLowerCase().includes(q)
      );
    }
    return accounts;
  }

  getAccountById(id) {
    return this.getAccounts().find(a => a.id === id);
  }

  getAccountsByType(type) {
    return this.getAccounts().filter(a => a.type === type && a.isActive !== false);
  }

  isAccountCodeTaken(code, currentId) {
    return this.getAccounts().some(a => a.code.toLowerCase() === code.trim().toLowerCase() && a.id !== currentId);
  }

  saveAccount(data) {
    if (!data.code || !data.code.trim()) throw new Error('Account code is required.');
    if (this.isAccountCodeTaken(data.code, data.id)) throw new Error('Account code is already taken.');
    if (!data.name || !data.name.trim()) throw new Error('Account name is required.');

    const accounts = this.store.get('urban_accounts', []);
    const now = new Date().toISOString();

    if (data.id) {
      const idx = accounts.findIndex(a => a.id === data.id);
      if (idx !== -1) {
        accounts[idx] = { ...accounts[idx], ...data, updatedAt: now };
        this.store.set('urban_accounts', accounts);
        return accounts[idx];
      }
    }

    const newAccount = {
      ...data,
      id: 'acc-' + Date.now(),
      isSystemAccount: false,
      isActive: data.isActive ?? true,
      currentBalance: data.currentBalance || 0,
      createdAt: now,
      updatedAt: now
    };
    accounts.unshift(newAccount);
    this.store.set('urban_accounts', accounts);
    return newAccount;
  }

  archiveAccount(id) {
    const accounts = this.getAccounts();
    const a = accounts.find(item => item.id === id);
    if (a) {
      if (a.isSystemAccount) {
        throw new Error('System default accounts cannot be archived or deleted.');
      }
      a.isActive = !a.isActive;
      a.updatedAt = new Date().toISOString();
      this.store.set('urban_accounts', accounts);
      return true;
    }
    return false;
  }

  canDeleteAccount(accountId) {
    const journals = this.getJournals();
    const ref = journals.find(j => j.defaultAccountId === accountId);
    if (ref) return { allowed: false, reason: 'Account is default account for Journal ' + ref.name };
    const acc = this.getAccountById(accountId);
    if (acc && acc.isSystemAccount) return { allowed: false, reason: 'System account cannot be deleted.' };
    return { allowed: true };
  }

  // --- JOURNALS ---
  getJournals(filter) {
    let journals = this.store.get('urban_journals', []);
    if (!filter) return journals;

    if (filter.type && filter.type !== 'All') {
      journals = journals.filter(j => j.type === filter.type);
    }
    if (filter.status === 'Active') {
      journals = journals.filter(j => j.isActive !== false);
    } else if (filter.status === 'Archived') {
      journals = journals.filter(j => j.isActive === false);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      journals = journals.filter(j => 
        j.name.toLowerCase().includes(q) || 
        (j.code && j.code.toLowerCase().includes(q))
      );
    }
    return journals;
  }

  getJournalById(id) {
    return this.getJournals().find(j => j.id === id);
  }

  getJournalByType(type) {
    return this.getJournals().find(j => j.type === type);
  }

  isJournalCodeTaken(code, currentId) {
    return this.getJournals().some(j => j.code && j.code.toLowerCase() === code.trim().toLowerCase() && j.id !== currentId);
  }

  saveJournal(data) {
    if (!data.code || !data.code.trim()) throw new Error('Journal short code is required.');
    if (this.isJournalCodeTaken(data.code, data.id)) throw new Error('Journal code is already taken.');
    if (!data.name || !data.name.trim()) throw new Error('Journal name is required.');
    if (!data.defaultAccountId) throw new Error('Default account selection is required.');

    const journals = this.store.get('urban_journals', []);
    const now = new Date().toISOString();

    if (data.id) {
      const idx = journals.findIndex(j => j.id === data.id);
      if (idx !== -1) {
        journals[idx] = { ...journals[idx], ...data, updatedAt: now };
        this.store.set('urban_journals', journals);
        return journals[idx];
      }
    }

    const newJournal = {
      ...data,
      id: 'jrnl-' + Date.now(),
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };
    journals.unshift(newJournal);
    this.store.set('urban_journals', journals);
    return newJournal;
  }

  archiveJournal(id) {
    const journals = this.getJournals();
    const j = journals.find(item => item.id === id);
    if (j) {
      j.isActive = !j.isActive;
      j.updatedAt = new Date().toISOString();
      this.store.set('urban_journals', journals);
      return true;
    }
    return false;
  }

  // --- ANALYTIC ACCOUNTS ---
  getAnalyticAccounts(filter) {
    let analytics = this.store.get('urban_analytic_accounts', []);
    if (!filter) return analytics;

    if (filter.type && filter.type !== 'All') {
      analytics = analytics.filter(a => a.type === filter.type);
    }
    if (filter.status === 'Active') {
      analytics = analytics.filter(a => a.isActive !== false);
    } else if (filter.status === 'Archived') {
      analytics = analytics.filter(a => a.isActive === false);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      analytics = analytics.filter(a => 
        a.name.toLowerCase().includes(q) || 
        (a.code && a.code.toLowerCase().includes(q))
      );
    }
    return analytics;
  }

  getAnalyticAccountById(id) {
    return this.getAnalyticAccounts().find(a => a.id === id);
  }

  isAnalyticCodeTaken(code, currentId) {
    return this.getAnalyticAccounts().some(a => a.code && a.code.toLowerCase() === code.trim().toLowerCase() && a.id !== currentId);
  }

  saveAnalyticAccount(data) {
    if (!data.code || !data.code.trim()) throw new Error('Cost center code is required.');
    if (this.isAnalyticCodeTaken(data.code, data.id)) throw new Error('Cost center code is already taken.');
    if (!data.name || !data.name.trim()) throw new Error('Analytic account name is required.');

    const analytics = this.store.get('urban_analytic_accounts', []);
    const now = new Date().toISOString();

    if (data.id) {
      const idx = analytics.findIndex(a => a.id === data.id);
      if (idx !== -1) {
        analytics[idx] = { ...analytics[idx], ...data, updatedAt: now };
        this.store.set('urban_analytic_accounts', analytics);
        return analytics[idx];
      }
    }

    const newAnalytic = {
      ...data,
      id: 'ana-' + Date.now(),
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now
    };
    analytics.unshift(newAnalytic);
    this.store.set('urban_analytic_accounts', analytics);
    return newAnalytic;
  }

  archiveAnalyticAccount(id) {
    const analytics = this.getAnalyticAccounts();
    const a = analytics.find(item => item.id === id);
    if (a) {
      a.isActive = !a.isActive;
      a.updatedAt = new Date().toISOString();
      this.store.set('urban_analytic_accounts', analytics);
      return true;
    }
    return false;
  }

  // --- BUDGETS ---
  getBudgets(filter) {
    let budgets = this.store.get('urban_budgets', []);
    if (!filter) return budgets;

    if (filter.responsible && filter.responsible !== 'All') {
      budgets = budgets.filter(b => b.responsible === filter.responsible || b.responsiblePerson === filter.responsible);
    }
    if (filter.searchQuery) {
      const q = filter.searchQuery.toLowerCase();
      budgets = budgets.filter(b => 
        b.name.toLowerCase().includes(q) || 
        b.responsible.toLowerCase().includes(q) ||
        (b.period && typeof b.period === 'string' && b.period.toLowerCase().includes(q))
      );
    }
    return budgets;
  }

  getBudgetById(id) {
    return this.getBudgets().find(b => b.id === id);
  }

  saveBudget(data) {
    if (!data.name || !data.name.trim()) throw new Error('Budget title is required.');
    const amt = Number(data.plannedAmount);
    if (isNaN(amt) || amt <= 0) throw new Error('Planned amount must be greater than 0.');
    if (!data.analyticAccountId) throw new Error('Relevant analytic account is required.');
    
    const resp = data.responsible || data.responsiblePerson || '';
    if (!resp.trim()) throw new Error('Responsible person is required.');

    const budgets = this.store.get('urban_budgets', []);
    const now = new Date().toISOString();

    if (data.id) {
      const idx = budgets.findIndex(b => b.id === data.id);
      if (idx !== -1) {
        budgets[idx] = {
          ...budgets[idx],
          ...data,
          responsible: resp,
          responsiblePerson: resp,
          updatedAt: now
        };
        this.store.set('urban_budgets', budgets);
        return budgets[idx];
      }
    }

    const newBudget = {
      ...data,
      id: 'bgt-' + Date.now(),
      responsible: resp,
      responsiblePerson: resp,
      createdAt: now,
      updatedAt: now
    };
    budgets.unshift(newBudget);
    this.store.set('urban_budgets', budgets);
    return newBudget;
  }

  deleteBudget(id) {
    let budgets = this.store.get('urban_budgets', []);
    const initLen = budgets.length;
    budgets = budgets.filter(b => b.id !== id);
    if (budgets.length !== initLen) {
      this.store.set('urban_budgets', budgets);
      return true;
    }
    return false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MastersService, SEED_CONTACTS, SEED_PRODUCTS, SEED_ACCOUNTS, SEED_JOURNALS, SEED_ANALYTIC_ACCOUNTS, SEED_BUDGETS };
} else if (typeof window !== 'undefined') {
  window.MastersService = MastersService;
}