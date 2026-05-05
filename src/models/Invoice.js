const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true },
  transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'MerchantTransaction' },
  subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription' },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Invoice Details
  invoiceNumber: { type: String, unique: true, required: true }, // INV-2026-001
  invoiceDate: { type: Date, default: Date.now },
  dueDate: Date,
  
  // Customer Information
  customerName: String,
  customerEmail: String,
  customerPhone: String,
  customerAddress: String,
  
  // Line Items
  items: [{
    description: String,
    quantity: Number,
    unitPrice: Number, // in cents
    amount: Number, // in cents (quantity * unitPrice)
    _id: false
  }],
  
  // Amounts
  subtotal: { type: Number, default: 0 }, // in cents
  taxRate: { type: Number, default: 0 }, // percentage (e.g., 7.5)
  taxAmount: { type: Number, default: 0 }, // in cents
  discountAmount: { type: Number, default: 0 }, // in cents
  totalAmount: { type: Number, required: true }, // in cents
  
  // Payment Information
  currency: { type: String, enum: ['USD', 'NGN'], default: 'NGN' },
  status: { 
    type: String, 
    enum: ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'], 
    default: 'draft' 
  },
  
  // Payment Method
  paymentMethod: { type: String, enum: ['card', 'bank_transfer', 'wallet', 'cash'], default: 'card' },
  paymentReference: String,
  paidDate: Date,
  
  // PDF Storage
  pdfUrl: String,
  pdfPublicId: String, // Cloudinary ID
  
  // Additional Info
  notes: String,
  terms: String,
  Reference: String, // Custom reference (PO number, order ID, etc.)
  
  // Metadata
  metadata: {
    orderId: String,
    projectId: String,
    customFields: Map
  },
  
  // Tracking
  sentAt: Date,
  firstViewedAt: Date,
  lastViewedAt: Date,
  viewCount: { type: Number, default: 0 },
  
  // Reminders
  reminders: [{
    sentAt: Date,
    status: String, // pending, sent
    type: String // payment_reminder, overdue_notice
  }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

// Index for faster queries
invoiceSchema.index({ merchantId: 1, createdAt: -1 });
invoiceSchema.index({ merchantId: 1, status: 1 });
invoiceSchema.index({ invoiceNumber: 1 });
invoiceSchema.index({ customerId: 1 });
invoiceSchema.index({ dueDate: 1 });

// Auto-generate invoice number
invoiceSchema.pre('save', async function(next) {
  if (this.isNew && !this.invoiceNumber) {
    const count = await mongoose.model('Invoice').countDocuments({ merchantId: this.merchantId });
    const year = new Date().getFullYear();
    this.invoiceNumber = `INV-${year}-${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Invoice', invoiceSchema);
