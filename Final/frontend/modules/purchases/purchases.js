/**
 * Member 3 - Purchases Module
 * Implements Purchase Order -> Goods Receipt -> Vendor Bill -> Journal Posting
 * Manages physical stock increments for Goods products.
 */

class PurchasesService {
  constructor(storeInstance, mastersInstance, journalEngineInstance) {
    this.store = storeInstance;
    this.masters = mastersInstance;
    this.journalEngine = journalEngineInstance;
  }

  getPurchases() {
    return this.store.get('urban_purchases', []);
  }

  getBills() {
    return this.store.get('urban_bills', []);
  }

  generatePONumber() {
    const count = this.getPurchases().length + 1;
    return `PO-2026-${String(count).padStart(4, '0')}`;
  }

  generateBillNumber() {
    const count = this.getBills().length + 1;
    return `BILL-2026-${String(count).padStart(4, '0')}`;
  }

  /**
   * Creates a Purchase Order in 'draft' status.
   */
  createPurchaseOrder({ vendorId, orderDate, lines, notes }) {
    if (!vendorId) throw new Error('Vendor is required.');
    const vendor = this.masters.getContactById(vendorId);
    if (!vendor || (vendor.type !== 'Vendor' && vendor.type !== 'Both')) {
      throw new Error(`Invalid vendor ID ${vendorId}. Contact must be a Vendor.`);
    }

    if (!Array.isArray(lines) || lines.length === 0) {
      throw new Error('Purchase order must contain at least one line item.');
    }

    let calculatedTotal = 0;
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

      const subtotal = Math.round((qty * unitPrice + Number.EPSILON) * 100) / 100;
      calculatedTotal += subtotal;

      return {
        productId: l.productId,
        productName: product.name,
        analyticAccountId: l.analyticAccountId || null,
        quantity: qty,
        unitPrice: unitPrice,
        subtotal
      };
    });

    calculatedTotal = Math.round((calculatedTotal + Number.EPSILON) * 100) / 100;

    const po = {
      id: `po-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      poNumber: this.generatePONumber(),
      vendorId,
      vendorName: vendor.name,
      orderDate: orderDate || new Date().toISOString().split('T')[0],
      status: 'draft',
      lines: validatedLines,
      totalAmount: calculatedTotal,
      notes: notes || '',
      createdAt: new Date().toISOString()
    };

    const purchases = this.getPurchases();
    purchases.push(po);
    this.store.set('urban_purchases', purchases);
    this.store.emit('purchase:created', po);
    return po;
  }

  /**
   * Confirms a Purchase Order.
   */
  confirmPurchaseOrder(poId) {
    const purchases = this.getPurchases();
    const po = purchases.find(p => p.id === poId);
    if (!po) throw new Error(`Purchase Order ${poId} not found.`);
    if (po.status !== 'draft') {
      throw new Error(`Cannot confirm PO ${po.poNumber} in status '${po.status}'.`);
    }

    po.status = 'confirmed';
    this.store.set('urban_purchases', purchases);
    this.store.emit('purchase:confirmed', po);
    return po;
  }

  /**
   * Converts a confirmed PO to a Vendor Bill in 'draft' status.
   */
  createVendorBillFromPO({ poId, billDate, dueDate }) {
    const purchases = this.getPurchases();
    const po = purchases.find(p => p.id === poId);
    if (!po) throw new Error(`Purchase Order ${poId} not found.`);
    if (po.status !== 'confirmed') {
      throw new Error(`Cannot create Vendor Bill. Purchase Order ${po.poNumber} must be 'confirmed'.`);
    }

    const bills = this.getBills();
    const existingBill = bills.find(b => b.purchaseOrderId === poId && b.status !== 'cancelled');
    if (existingBill) {
      throw new Error(`A Vendor Bill (${existingBill.billNumber}) already exists for ${po.poNumber}.`);
    }

    const invoiceDt = billDate || new Date().toISOString().split('T')[0];
    const dueDt = dueDate || invoiceDt;
    if (new Date(dueDt) < new Date(invoiceDt)) {
      throw new Error('Due Date cannot be earlier than Invoice Date.');
    }

    const defaultExpenseAccount = this.masters.getAccountsByType('Expense')[0];
    if (!defaultExpenseAccount) throw new Error('No Expense account configured in Chart of Accounts.');

    const bill = {
      id: `bill-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      billNumber: this.generateBillNumber(),
      purchaseOrderId: po.id,
      poNumber: po.poNumber,
      vendorId: po.vendorId,
      vendorName: po.vendorName,
      billDate: invoiceDt,
      dueDate: dueDt,
      status: 'draft',
      lines: po.lines.map(l => ({
        ...l,
        accountId: defaultExpenseAccount.id
      })),
      totalAmount: po.totalAmount,
      amountPaid: 0,
      balanceDue: po.totalAmount,
      journalEntryId: null,
      createdAt: new Date().toISOString()
    };

    bills.push(bill);
    this.store.set('urban_bills', bills);
    this.store.emit('bill:created', bill);
    return bill;
  }

  /**
   * Confirms and Posts a Vendor Bill:
   * 1. Increments Goods product stock.
   * 2. Posts Journal Entry: Dr Purchases Expense, Cr Creditors.
   * 3. Sets Bill status to 'posted'.
   * 4. Sets PO status to 'billed'.
   * Uses atomic snapshot-and-rollback transaction.
   */
  confirmVendorBill(billId) {
    return this.store.transaction(
      ['urban_bills', 'urban_purchases', 'urban_products', 'urban_journal_entries'],
      () => {
        const bills = this.getBills();
        const bill = bills.find(b => b.id === billId);
        if (!bill) throw new Error(`Vendor Bill ${billId} not found.`);
        if (bill.status !== 'draft') {
          throw new Error(`Cannot confirm Bill ${bill.billNumber} in status '${bill.status}'.`);
        }

        // 1. Stock Increment for Goods
        bill.lines.forEach(line => {
          const product = this.masters.getProductById(line.productId);
          if (product && product.type === 'Goods') {
            this.masters.adjustProductStock(line.productId, line.quantity);
          }
        });

        // 2. Identify Accounts
        const expenseAcc = this.masters.getAccountById(bill.lines[0]?.accountId) ||
                           this.masters.getAccountsByType('Expense')[0];
        const creditorsAcc = this.masters.getAccountsByType('Liability').find(a => a.name.toLowerCase().includes('creditor')) ||
                             this.masters.getAccountsByType('Liability')[0];

        if (!expenseAcc || !creditorsAcc) {
          throw new Error('Missing Chart of Accounts mapping for Purchases Expense or Creditors.');
        }

        // 3. Post Journal Entry
        const journalEntry = this.journalEngine.postCreditPurchase({
          bill,
          expenseAccountId: expenseAcc.id,
          creditorsAccountId: creditorsAcc.id,
          date: bill.billDate
        });

        // 4. Update Bill State
        bill.status = 'posted';
        bill.journalEntryId = journalEntry.id;
        this.store.set('urban_bills', bills);

        // 5. Update PO State
        const purchases = this.getPurchases();
        const po = purchases.find(p => p.id === bill.purchaseOrderId);
        if (po) {
          po.status = 'billed';
          this.store.set('urban_purchases', purchases);
        }

        this.store.emit('bill:posted', { bill, journalEntry });
        return { bill, journalEntry };
      }
    );
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PurchasesService };
} else if (typeof window !== 'undefined') {
  window.PurchasesService = PurchasesService;
}