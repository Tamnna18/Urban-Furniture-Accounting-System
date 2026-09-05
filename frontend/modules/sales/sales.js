/**
 * Member 3 - Sales Module
 * Implements Sales Order -> Stock Validation -> Customer Invoice -> Journal Posting
 * Manages physical stock decrements and prevents overselling of Goods products.
 */

class SalesService {
  constructor(storeInstance, mastersInstance, journalEngineInstance) {
    this.store = storeInstance;
    this.masters = mastersInstance;
    this.journalEngine = journalEngineInstance;
  }

  getSales() {
    return this.store.get('urban_sales', []);
  }

  getInvoices() {
    return this.store.get('urban_invoices', []);
  }

  generateSONumber() {
    const count = this.getSales().length + 1;
    return `SO-2026-${String(count).padStart(4, '0')}`;
  }

  generateInvoiceNumber() {
    const count = this.getInvoices().length + 1;
    return `INV-2026-${String(count).padStart(4, '0')}`;
  }

  /**
   * Creates a Sales Order in 'draft' status.
   */
  createSalesOrder({ customerId, orderDate, lines, notes }) {
    if (!customerId) throw new Error('Customer is required.');
    const customer = this.masters.getContactById(customerId);
    if (!customer || (customer.type !== 'Customer' && customer.type !== 'Both')) {
      throw new Error(`Invalid customer ID ${customerId}. Contact must be a Customer.`);
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      throw new Error('Sales order must contain at least one line item.');
    }

    let calculatedSubtotal = 0;
    let calculatedTaxTotal = 0;

    const validatedLines = lines.map((l, index) => {
      if (!l.productId) throw new Error(`Line ${index + 1}: Product is required.`);
      const product = this.masters.getProductById(l.productId);
      if (!product) throw new Error(`Line ${index + 1}: Product ID ${l.productId} not found.`);

      const qty = Number(l.quantity);
      if (!qty || qty <= 0 || !Number.isFinite(qty)) {
        throw new Error(`Line ${index + 1}: Quantity must be a positive number greater than 0.`);
      }

      const unitPrice = Number(l.unitPrice);
      if (unitPrice === undefined || unitPrice < 0 || !Number.isFinite(unitPrice)) {
        throw new Error(`Line ${index + 1}: Unit price must be a non-negative number.`);
      }

      const taxRate = Number(l.taxRate || 0);
      if (taxRate < 0 || !Number.isFinite(taxRate)) {
        throw new Error(`Line ${index + 1}: Tax rate must be a non-negative number.`);
      }

      const subtotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
      const taxAmount = Math.round((subtotal * (taxRate / 100) + Number.EPSILON) * 100) / 100;
      const lineTotal = Math.round((subtotal + taxAmount + Number.EPSILON) * 100) / 100;

      calculatedSubtotal += subtotal;
      calculatedTaxTotal += taxAmount;

      return {
        productId: l.productId,
        productName: product.name,
        productType: product.type,
        analyticAccountId: l.analyticAccountId || null,
        quantity: qty,
        unitPrice: unitPrice,
        taxRate: taxRate,
        subtotal,
        taxAmount,
        total: lineTotal
      };
    });

    calculatedSubtotal = Math.round((calculatedSubtotal + Number.EPSILON) * 100) / 100;
    calculatedTaxTotal = Math.round((calculatedTaxTotal + Number.EPSILON) * 100) / 100;
    const calculatedGrandTotal = Math.round((calculatedSubtotal + calculatedTaxTotal + Number.EPSILON) * 100) / 100;

    const so = {
      id: `so-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      soNumber: this.generateSONumber(),
      customerId,
      customerName: customer.name,
      orderDate: orderDate || new Date().toISOString().split('T')[0],
      status: 'draft',
      lines: validatedLines,
      subtotal: calculatedSubtotal,
      taxTotal: calculatedTaxTotal,
      grandTotal: calculatedGrandTotal,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const sales = this.getSales();
    sales.push(so);
    this.store.set('urban_sales', sales);
    this.store.emit('sale:created', so);
    return so;
  }

  /**
   * Confirms a Sales Order.
   * Validates available stock for Goods products before confirming.
   */
  confirmSalesOrder(soId) {
    const sales = this.getSales();
    const so = sales.find(s => s.id === soId);
    if (!so) throw new Error(`Sales Order ${soId} not found.`);
    if (so.status !== 'draft') {
      throw new Error(`Cannot confirm SO ${so.soNumber} in status '${so.status}'.`);
    }

    // Stock Invariant Check for Goods
    so.lines.forEach(line => {
      const product = this.masters.getProductById(line.productId);
      if (product && product.type === 'Goods') {
        if (line.quantity > product.stock) {
          throw new Error(
            `Insufficient stock for '${product.name}'. Available: ${product.stock}, Requested: ${line.quantity}. Sale cannot exceed available stock.`
          );
        }
      }
    });

    so.status = 'confirmed';
    this.store.set('urban_sales', sales);
    this.store.emit('sale:confirmed', so);
    return so;
  }

  /**
   * Converts a confirmed SO to a Customer Invoice in 'draft' status.
   */
  createCustomerInvoiceFromSO({ soId, invoiceDate, dueDate }) {
    const sales = this.getSales();
    const so = sales.find(s => s.id === soId);
    if (!so) throw new Error(`Sales Order ${soId} not found.`);
    if (so.status !== 'confirmed') {
      throw new Error(`Cannot create Customer Invoice. Sales Order ${so.soNumber} must be 'confirmed'.`);
    }

    const invoices = this.getInvoices();
    const existingInv = invoices.find(inv => inv.salesOrderId === soId && inv.status !== 'cancelled');
    if (existingInv) {
      throw new Error(`A Customer Invoice (${existingInv.invoiceNumber}) already exists for ${so.soNumber}.`);
    }

    const invDate = invoiceDate || new Date().toISOString().split('T')[0];
    const dueDt = dueDate || invDate;
    if (new Date(dueDt) < new Date(invDate)) {
      throw new Error('Due Date cannot be earlier than Invoice Date.');
    }

    const defaultIncomeAccount = this.masters.getAccountsByType('Income')[0];
    if (!defaultIncomeAccount) throw new Error('No Income account configured in Chart of Accounts.');

    const invoice = {
      id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      invoiceNumber: this.generateInvoiceNumber(),
      salesOrderId: so.id,
      soNumber: so.soNumber,
      customerId: so.customerId,
      customerName: so.customerName,
      invoiceDate: invDate,
      dueDate: dueDt,
      status: 'draft',
      lines: so.lines.map(l => ({
        ...l,
        accountId: defaultIncomeAccount.id
      })),
      subtotal: so.subtotal,
      taxTotal: so.taxTotal,
      grandTotal: so.grandTotal,
      amountPaid: 0,
      balanceDue: so.grandTotal,
      journalEntryId: null,
      createdAt: new Date().toISOString()
    };

    invoices.push(invoice);
    this.store.set('urban_invoices', invoices);
    this.store.emit('invoice:created', invoice);
    return invoice;
  }

  /**
   * Confirms and Posts a Customer Invoice:
   * 1. Re-verifies stock availability and decrements Goods stock.
   * 2. Posts Journal Entry:
   *    Dr Debtors (grandTotal)
   *    Cr Sales Income (subtotal)
   *    Cr Tax Payable (taxTotal, if > 0)
   * 3. Sets Invoice status to 'posted'.
   * 4. Sets SO status to 'invoiced'.
   * Uses atomic snapshot-and-rollback transaction.
   */
  confirmCustomerInvoice(invoiceId) {
    return this.store.transaction(
      ['urban_invoices', 'urban_sales', 'urban_products', 'urban_journal_entries'],
      () => {
        const invoices = this.getInvoices();
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) throw new Error(`Customer Invoice ${invoiceId} not found.`);
        if (invoice.status !== 'draft') {
          throw new Error(`Cannot confirm Invoice ${invoice.invoiceNumber} in status '${invoice.status}'.`);
        }

        // 1. Stock Decrement for Goods (with availability check)
        invoice.lines.forEach(line => {
          const product = this.masters.getProductById(line.productId);
          if (product && product.type === 'Goods') {
            if (line.quantity > product.stock) {
              throw new Error(
                `Insufficient stock for '${product.name}'. Available: ${product.stock}, Required: ${line.quantity}. Sale cannot exceed available stock.`
              );
            }
            this.masters.adjustProductStock(line.productId, -line.quantity);
          }
        });

        // 2. Identify Accounts
        const debtorsAcc = this.masters.getAccountsByType('Asset').find(a => a.name.toLowerCase().includes('debtor')) ||
                           this.masters.getAccountsByType('Asset')[0];
        const salesIncomeAcc = this.masters.getAccountById(invoice.lines[0]?.accountId) ||
                               this.masters.getAccountsByType('Income')[0];
        const taxAcc = this.masters.getAccountsByType('Liability').find(a => a.name.toLowerCase().includes('tax')) ||
                       this.masters.getAccountsByType('Liability')[0];

        if (!debtorsAcc || !salesIncomeAcc) {
          throw new Error('Missing Chart of Accounts mapping for Debtors or Sales Income.');
        }

        // 3. Post Journal Entry
        const journalEntry = this.journalEngine.postSale({
          invoice,
          debtorsAccountId: debtorsAcc.id,
          salesIncomeAccountId: salesIncomeAcc.id,
          taxAccountId: invoice.taxTotal > 0 ? taxAcc.id : null,
          date: invoice.invoiceDate
        });

        // 4. Update Invoice State
        invoice.status = 'posted';
        invoice.journalEntryId = journalEntry.id;
        this.store.set('urban_invoices', invoices);

        // 5. Update SO State
        const sales = this.getSales();
        const so = sales.find(s => s.id === invoice.salesOrderId);
        if (so) {
          so.status = 'invoiced';
          this.store.set('urban_sales', sales);
        }

        this.store.emit('invoice:posted', { invoice, journalEntry });
        return { invoice, journalEntry };
      }
    );
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SalesService };
} else if (typeof window !== 'undefined') {
  window.SalesService = SalesService;
}