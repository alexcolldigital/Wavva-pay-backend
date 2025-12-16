const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const createConnectAccount = async (user) => {
  try {
    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      business_type: 'individual',
      individual: {
        first_name: user.firstName,
        last_name: user.lastName,
        email: user.email,
        phone: user.phone,
      },
    });

    return { success: true, accountId: account.id };
  } catch (err) {
    console.error('Stripe account creation error:', err);
    return { success: false, error: err.message };
  }
};

const createPaymentIntent = async (amount, currency = 'usd') => {
  try {
    const intent = await stripe.paymentIntents.create({
      amount,
      currency,
      automatic_payment_methods: { enabled: true },
    });

    return { success: true, clientSecret: intent.client_secret, intentId: intent.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

const transferFunds = async (recipientStripeAccountId, amount, currency = 'usd') => {
  try {
    const transfer = await stripe.transfers.create({
      amount,
      currency,
      destination: recipientStripeAccountId,
    });

    return { success: true, transferId: transfer.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

module.exports = {
  createConnectAccount,
  createPaymentIntent,
  transferFunds,
};
