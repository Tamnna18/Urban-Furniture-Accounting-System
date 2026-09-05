/**
 * Member 3 - Payments Module
 * Handles Customer Receipts & Vendor Payments via Cash / Bank
 * Posts Double-Entry Journal Entries and updates document settlement status.
 */

class PaymentsService {
  constructor(storeInstance, mastersInstance, journalEngineInstance) {
    this.store = storeInstance;
    this.masters = mastersInstance;
    this.journalEngine = journalEngineInstance;
  }

  getPayments() {
    return this.store.get('urban_payments', []);
  }

  generatePaymentNumber() {
    const count = this.getPayments().length + 1;
    return `PAY-2026-${String(count).padStart(4, '0')}`;
  }

  /**
   * Registers a Vendor Payment (Outbound) against a posted Vendor Bill.
   * Dr Creditors / Cr Cash OR Bank
   */
  registerVendorPayment({ billId, method, paymentDate, reference, amount }) {
    return this.store.transaction(
      ['urban_bills', 'urban_payments', 'urban_journal_entries'],
      () => {
        const bills = this.store.get('urban_bills', []);
        const bill = bills.find(b => b.id === billId);
        if (!bill) throw new Error(`Vendor Bill ${billId} not found.`);
        if (bill.status !== 'posted') {
          throw new Error(`Cannot register payment for bill ${bill.billNumber} with status '${bill.status}'. Bill must be 'posted'.`);
        }

        const payAmount = Math.round(((Number(amount) || 0) + Number.EPSILON) * 100) / 100;
        if (payAmount <= 0) {
          throw new Error('Payment amount must be greater than 0.');
        }

        if (payAmount > bill.balanceDue + 0.001) {
          throw new Error(
            `Payment amount (${payAmount}) exceeds outstanding balance (${bill.balanceDue}) on bill ${bill.billNumber}.`
          );
        }

        const payMethod = method === 'Cash' ? 'Cash' : 'Bank';
        const journal = this.masters.getJournalByType(payMethod);
        if (!journal || !journal.defaultAccountId) {
          throw new Error(`No default account configured for ${payMethod} Journal.`);
        }
        const cashOrBankAccountId = journal.defaultAccountId;

        const creditorsAcc = this.masters.getAccountsByType('Liability').find(a => a.name.toLowerCase().includes('creditor')) ||
                             this.masters.getAccountsByType('Liability')[0];
        if (!creditorsAcc) {
          throw new Error('Creditors account not found in Chart of Accounts.');
        }

        const payment = {
          id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          paymentNumber: this.generatePaymentNumber(),
          direction: 'OUTBOUND',
          partnerId: bill.vendorId,
          partnerName: bill.vendorName,
          targetDocumentType: 'VendorBill',
          targetDocumentId: bill.id,
          targetDocumentNumber: bill.billNumber,
          paymentDate: paymentDate || new Date().toISOString().split('T')[0],
          method: payMethod,
          amount: payAmount,
          reference: reference || `Payment for ${bill.billNumber}`,
          journalEntryId: null,
          status: 'posted',
          createdAt: new Date().toISOString()
        };

        // 1. Post Journal Entry: Dr Creditors / Cr Cash or Bank
        const journalEntry = this.journalEngine.postVendorPayment({
          payment,
          creditorsAccountId: creditorsAcc.id,
          cashOrBankAccountId,
          date: payment.paymentDate
        });

        // 2. Attach Journal Entry to Payment
        payment.journalEntryId = journalEntry.id;
        const payments = this.getPayments();
        payments.push(payment);
        this.store.set('urban_payments', payments);

        // 3. Update Bill Settlement Figures
        bill.amountPaid = Math.round(((bill.amountPaid + payAmount) + Number.EPSILON) * 100) / 100;
        bill.balanceDue = Math.round(((bill.totalAmount - bill.amountPaid) + Number.EPSILON) * 100) / 100;

        if (bill.balanceDue <= 0.001) {
          bill.balanceDue = 0;
          bill.status = 'paid';
        }

        this.store.set('urban_bills', bills);
        this.store.emit('payment:posted', { payment, journalEntry, bill });
        return { payment, journalEntry, bill };
      }
    );
  }

  /**
   * Registers a Customer Payment / Receipt (Inbound) against a posted Customer Invoice.
   * Dr Cash OR Bank / Cr Debtors
   */
  registerCustomerPayment({ invoiceId, method, paymentDate, reference, amount }) {
    return this.store.transaction(
      ['urban_invoices', 'urban_payments', 'urban_journal_entries'],
      () => {
        const invoices = this.store.get('urban_invoices', []);
        const invoice = invoices.find(inv => inv.id === invoiceId);
        if (!invoice) throw new Error(`Customer Invoice ${invoiceId} not found.`);
        if (invoice.status !== 'posted') {
          throw new Error(`Cannot register receipt for invoice ${invoice.invoiceNumber} with status '${invoice.status}'. Invoice must be 'posted'.`);
        }

        const payAmount = Math.round(((Number(amount) || 0) + Number.EPSILON) * 100) / 100;
        if (payAmount <= 0) {
          throw new Error('Payment amount must be greater than 0.');
        }

        if (payAmount > invoice.balanceDue + 0.001) {
          throw new Error(
            `Payment amount (${payAmount}) exceeds outstanding balance (${invoice.balanceDue}) on invoice ${invoice.invoiceNumber}.`
          );
        }

        const payMethod = method === 'Cash' ? 'Cash' : 'Bank';
        const journal = this.masters.getJournalByType(payMethod);
        if (!journal || !journal.defaultAccountId) {
          throw new Error(`No default account configured for ${payMethod} Journal.`);
        }
        const cashOrBankAccountId = journal.defaultAccountId;

        const debtorsAcc = this.masters.getAccountsByType('Asset').find(a => a.name.toLowerCase().includes('debtor')) ||
                           this.masters.getAccountsByType('Asset')[0];
        if (!debtorsAcc) {
          throw new Error('Debtors account not found in Chart of Accounts.');
        }

        const payment = {
          id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          paymentNumber: this.generatePaymentNumber(),
          direction: 'INBOUND',
          partnerId: invoice.customerId,
          partnerName: invoice.customerName,
          targetDocumentType: 'CustomerInvoice',
          targetDocumentId: invoice.id,
          targetDocumentNumber: invoice.invoiceNumber,
          paymentDate: paymentDate || new Date().toISOString().split('T')[0],
          method: payMethod,
          amount: payAmount,
          reference: reference || `Receipt for ${invoice.invoiceNumber}`,
          journalEntryId: null,
          status: 'posted',
          createdAt: new Date().toISOString()
        };

        // 1. Post Journal Entry: Dr Cash or Bank / Cr Debtors
        const journalEntry = this.journalEngine.postCustomerPayment({
          payment,
          debtorsAccountId: debtorsAcc.id,
          cashOrBankAccountId,
          date: payment.paymentDate
        });

        // 2. Attach Journal Entry to Payment
        payment.journalEntryId = journalEntry.id;
        const payments = this.getPayments();
        payments.push(payment);
        this.store.set('urban_payments', payments);

        // 3. Update Invoice Settlement Figures
        invoice.amountPaid = Math.round(((invoice.amountPaid + payAmount) + Number.EPSILON) * 100) / 100;
        invoice.balanceDue = Math.round(((invoice.grandTotal - invoice.amountPaid) + Number.EPSILON) * 100) / 100;

        if (invoice.balanceDue <= 0.001) {
          invoice.balanceDue = 0;
          invoice.status = 'paid';
        }

        this.store.set('urban_invoices', invoices);
        this.store.emit('payment:posted', { payment, journalEntry, invoice });
        return { payment, journalEntry, invoice };
      }
    );
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PaymentsService };
} else if (typeof window !== 'undefined') {
  window.PaymentsService = PaymentsService;
}