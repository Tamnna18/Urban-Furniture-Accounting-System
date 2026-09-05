/**
 * Member 2 - Master Data Module
 * Owns Contacts, Products, Chart of Accounts, Journals, Analytic Accounts, Budgets
 * Provides read-only query accessors and stock adjustment contract for Member 3.
 */

const SEED_CONTACTS = [
  { id: 'contact-azure', name: 'Azure Furniture', type: 'Vendor', email: 'orders@azurefurniture.com', mobile: '+91 98765 43210', address: { city: 'Mumbai', state: 'Maharashtra', pincode: '400001' } },
  { id: 'contact-rahul', name: 'Rahul Sharma', type: 'Vendor', email: 'rahul@sharmawood.in', mobile: '+91 98220 12345', address: { city: 'Jaipur', state: 'Rajasthan', pincode: '302001' } },
  { id: 'contact-nimesh', name: 'Nimesh Pathak', type: 'Customer', email: 'nimesh@pathak.com', mobile: '+91 99887 76655', address: { city: 'Ahmedabad', state: 'Gujarat', pincode: '380015' } },
  { id: 'contact-om', name: 'Om Furniture', type: 'Both', email: 'info@omfurniture.com', mobile: '+91 91234 56789', address: { city: 'Delhi', state: 'Delhi', pincode: '110001' } }
];

const SEED_PRODUCTS = [
  { id: 'prod-office-chair', name: 'Office Chair', type: 'Goods', salesPrice: 3500, cost: 2000, category: 'Seating', stock: 15 },
  { id: 'prod-wooden-chair', name: 'Wooden Chair', type: 'Goods', salesPrice: 2800, cost: 1500, category: 'Seating', stock: 20 },
  { id: 'prod-wooden-table', name: 'Wooden Table', type: 'Goods', salesPrice: 7500, cost: 4500, category: 'Tables', stock: 8 },
  { id: 'prod-assembly-svc', name: 'Assembly Service', type: 'Service', salesPrice: 800, cost: 0, category: 'Services', stock: 0 }
];

const SEED_ACCOUNTS = [
  { id: 'acc-cash', name: 'Cash in Hand', type: 'Asset', code: '1010' },
  { id: 'acc-bank', name: 'HDFC Bank', type: 'Asset', code: '1020' },
  { id: 'acc-debtors', name: 'Debtors (Accounts Receivable)', type: 'Asset', code: '1030' },
  { id: 'acc-creditors', name: 'Creditors (Accounts Payable)', type: 'Liability', code: '2010' },
  { id: 'acc-tax-payable', name: 'Tax Payable', type: 'Liability', code: '2020' },
  { id: 'acc-capital', name: 'Owner Capital', type: 'Capital', code: '3010' },
  { id: 'acc-sales-income', name: 'Sales Income', type: 'Income', code: '4010' },
  { id: 'acc-purchase-expense', name: 'Purchases Expense', type: 'Expense', code: '5010' },
  { id: 'acc-other-expense', name: 'Other Operating Expenses', type: 'Expense', code: '5020' }
];

const SEED_JOURNALS = [
  { id: 'jrnl-sales', name: 'Sales Journal', type: 'Sales', defaultAccountId: 'acc-sales-income' },
  { id: 'jrnl-purchase', name: 'Purchase Journal', type: 'Purchase', defaultAccountId: 'acc-purchase-expense' },
  { id: 'jrnl-bank', name: 'Bank Journal', type: 'Bank', defaultAccountId: 'acc-bank' },
  { id: 'jrnl-cash', name: 'Cash Journal', type: 'Cash', defaultAccountId: 'acc-cash' }
];

const SEED_ANALYTIC_ACCOUNTS = [
  { id: 'ana-showroom', name: 'Showroom Expansion', type: 'Expenses' },
  { id: 'ana-online', name: 'Online Store Operations', type: 'Income' }
];

const SEED_BUDGETS = [
  { id: 'bgt-2026-showroom', name: 'Showroom Setup 2026', period: '2026', responsible: 'Rahul Sharma', plannedAmount: 50000, analyticAccountId: 'ana-showroom' }
];

class MastersService {
  constructor(storeInstance) {
    this.store = storeInstance;
    this.init();
  }

  init() {
    if (!this.store.get('urban_contacts') || this.store.get('urban_contacts').length === 0) {
      this.store.set('urban_contacts', SEED_CONTACTS);
    }
    if (!this.store.get('urban_products') || this.store.get('urban_products').length === 0) {
      this.store.set('urban_products', SEED_PRODUCTS);
    }
    if (!this.store.get('urban_accounts') || this.store.get('urban_accounts').length === 0) {
      this.store.set('urban_accounts', SEED_ACCOUNTS);
    }
    if (!this.store.get('urban_journals') || this.store.get('urban_journals').length === 0) {
      this.store.set('urban_journals', SEED_JOURNALS);
    }
    if (!this.store.get('urban_analytic_accounts') || this.store.get('urban_analytic_accounts').length === 0) {
      this.store.set('urban_analytic_accounts', SEED_ANALYTIC_ACCOUNTS);
    }
    if (!this.store.get('urban_budgets') || this.store.get('urban_budgets').length === 0) {
      this.store.set('urban_budgets', SEED_BUDGETS);
    }
  }

  // Contacts
  getContacts() { return this.store.get('urban_contacts', []); }
  getContactById(id) { return this.getContacts().find(c => c.id === id); }
  getVendors() { return this.getContacts().filter(c => c.type === 'Vendor' || c.type === 'Both'); }
  getCustomers() { return this.getContacts().filter(c => c.type === 'Customer' || c.type === 'Both'); }

  // Products
  getProducts() { return this.store.get('urban_products', []); }
  getProductById(id) { return this.getProducts().find(p => p.id === id); }
  
  adjustProductStock(id, deltaQuantity) {
    const products = this.getProducts();
    const product = products.find(p => p.id === id);
    if (!product) throw new Error('Product ' + id + ' not found.');
    if (product.type === 'Goods') {
      const newStock = product.stock + deltaQuantity;
      if (newStock < 0) {
        throw new Error('Insufficient stock for ' + product.name + '. Current: ' + product.stock + ', required deduction: ' + Math.abs(deltaQuantity));
      }
      product.stock = newStock;
      this.store.set('urban_products', products);
      this.store.emit('stock:updated', { productId: id, stock: newStock });
    }
    return product;
  }

  // Accounts
  getAccounts() { return this.store.get('urban_accounts', []); }
  getAccountById(id) { return this.getAccounts().find(a => a.id === id); }
  getAccountsByType(type) { return this.getAccounts().filter(a => a.type === type); }

  // Journals
  getJournals() { return this.store.get('urban_journals', []); }
  getJournalById(id) { return this.getJournals().find(j => j.id === id); }
  getJournalByType(type) { return this.getJournals().find(j => j.type === type); }

  // Analytic Accounts
  getAnalyticAccounts() { return this.store.get('urban_analytic_accounts', []); }
  getAnalyticAccountById(id) { return this.getAnalyticAccounts().find(a => a.id === id); }

  // Budgets
  getBudgets() { return this.store.get('urban_budgets', []); }
  getBudgetById(id) { return this.getBudgets().find(b => b.id === id); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MastersService, SEED_CONTACTS, SEED_PRODUCTS, SEED_ACCOUNTS, SEED_JOURNALS, SEED_ANALYTIC_ACCOUNTS, SEED_BUDGETS };
} else if (typeof window !== 'undefined') {
  window.MastersService = MastersService;
}