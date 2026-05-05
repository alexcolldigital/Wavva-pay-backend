const Wallet = require('../models/Wallet');
const WalletV2 = require('../models/WalletV2');
const User = require('../models/User');
const walletModuleService = require('../modules/wallet/walletService');
const { recordCommission } = require('./commissionService');

const DEFAULT_CURRENCY = 'NGN';

const LEDGER_TYPE_MAP = {
  wallet_funding: 'funding',
  virtual_account_credit: 'funding',
  bill_payment: 'bill_payment',
  airtime: 'airtime',
  data_bundle: 'data',
  data: 'data',
  electricity: 'electricity',
  cable: 'cable',
  payout: 'withdrawal',
  transfer: 'transfer',
  peer_to_peer: 'transfer',
};

class UnifiedLedgerService {
  async ensureSystemWallets(currency = DEFAULT_CURRENCY) {
    await walletModuleService.initializeSystemWallets();

    let providerWallet = await WalletV2.getProviderWallet('vtpass', currency);
    if (!providerWallet) {
      providerWallet = await walletModuleService.createWallet({
        type: 'PROVIDER_WALLET',
        currency,
        provider: 'vtpass',
        name: `VTPass Fees (${currency})`,
        description: 'Tracks VTPass provider fees',
      });
    }

    return {
      commissionWallet: await WalletV2.getCommissionWallet(currency),
      settlementWallet: await WalletV2.getSettlementWallet(currency),
      flutterwaveWallet: await WalletV2.getProviderWallet('flutterwave', currency),
      wemaWallet: await WalletV2.getProviderWallet('wema', currency),
      vtpassWallet: providerWallet,
    };
  }

  async ensureUserWallet(userId, currency = DEFAULT_CURRENCY) {
    let wallet = await WalletV2.getUserWallet(userId, currency);
    if (wallet) {
      return wallet;
    }

    const legacyWallet = await Wallet.findOne({ userId });
    const initialBalance = this.getLegacyWalletBalance(legacyWallet, currency);
    const user = await User.findById(userId).select('firstName lastName');

    wallet = await walletModuleService.createWallet({
      type: 'USER_WALLET',
      userId,
      currency,
      balance: initialBalance,
      name: `${user?.firstName || 'User'} ${user?.lastName || 'Wallet'}`.trim(),
      description: 'Primary customer wallet',
      virtualAccount: this.buildVirtualAccountData(legacyWallet),
    });

    await this.syncLegacyWalletFromV2(userId, currency, wallet);
    return wallet;
  }

  async syncLegacyWalletFromV2(userId, currency = DEFAULT_CURRENCY, walletV2 = null) {
    const userWalletV2 = walletV2 || await this.ensureUserWallet(userId, currency);
    let legacyWallet = await Wallet.findOne({ userId });

    if (!legacyWallet) {
      legacyWallet = new Wallet({
        userId,
        balance: 0,
        currency,
        wallets: [],
      });
    }

    const legacyCurrencyWallet = legacyWallet.getOrCreateWallet(currency, 'general', `${currency} Wallet`);
    legacyCurrencyWallet.balance = userWalletV2.balance;
    legacyWallet.balance = userWalletV2.balance;

    if (userWalletV2.virtualAccount?.accountNumber) {
      legacyWallet.virtualAccountNumber = userWalletV2.virtualAccount.accountNumber;
      legacyWallet.virtualAccountName = userWalletV2.virtualAccount.accountName;
      legacyWallet.virtualAccountBank = userWalletV2.virtualAccount.bankName;
      legacyWallet.virtualAccountReference = userWalletV2.virtualAccount.providerReference;
      legacyWallet.virtualAccountStatus = userWalletV2.virtualAccount.status || 'active';
    }

    legacyWallet.markModified('wallets');
    await legacyWallet.save();

    await User.findByIdAndUpdate(userId, {
      walletId: legacyWallet._id,
      ...(userWalletV2.virtualAccount?.accountNumber ? {
        virtualAccount: {
          accountNumber: userWalletV2.virtualAccount.accountNumber,
          accountName: userWalletV2.virtualAccount.accountName,
          bankCode: '035',
          bankName: userWalletV2.virtualAccount.bankName,
          status: userWalletV2.virtualAccount.status || 'active',
          accountId: userWalletV2.providerIds?.wema?.virtualAccountId || userWalletV2.virtualAccount.providerReference,
          reference: userWalletV2.virtualAccount.providerReference,
          createdAt: new Date(),
        }
      } : {}),
    });

    return legacyWallet;
  }

  async processFundingSettlement({
    userId,
    transactionId,
    amount,
    currency = DEFAULT_CURRENCY,
    feeAmount = 0,
    provider = 'flutterwave',
    providerReference,
    reference,
    description,
    metadata = {},
  }) {
    const userWallet = await this.ensureUserWallet(userId, currency);
    const { settlementWallet } = await this.ensureSystemWallets(currency);
    const ledgerType = this.mapLedgerType('wallet_funding');
    const netAmount = amount - feeAmount;

    await walletModuleService.creditWallet(settlementWallet.walletId, amount, {
      transactionId,
      reference: `${reference}-SETTLEMENT`,
      type: 'settlement',
      provider,
      userId,
      description: `Settlement received from ${provider}`,
      providerReference,
      ...metadata,
    });

    if (feeAmount > 0) {
      await this.transferFee({
        userId,
        currency,
        amount: feeAmount,
        sourceWalletId: settlementWallet.walletId,
        provider,
        transactionId,
        reference: `${reference}-FEE`,
        description: `${provider} wallet funding fee`,
        commissionSource: 'wallet_funding',
        providerReference,
        metadata,
      });
    }

    await walletModuleService.transfer(
      settlementWallet.walletId,
      userWallet.walletId,
      netAmount,
      {
        transactionId,
        reference: `${reference}-USER`,
        type: ledgerType,
        provider,
        userId,
        description: description || 'Wallet funding settlement',
        providerReference,
        ...metadata,
      }
    );

    await this.syncLegacyWalletFromV2(userId, currency, userWallet);

    return {
      userWallet,
      netAmount,
      feeAmount,
    };
  }

  async processVirtualAccountCredit({
    userId,
    transactionId,
    amount,
    currency = DEFAULT_CURRENCY,
    provider = 'wema',
    providerReference,
    reference,
    description,
    metadata = {},
  }) {
    return this.processFundingSettlement({
      userId,
      transactionId,
      amount,
      currency,
      feeAmount: 0,
      provider,
      providerReference,
      reference,
      description: description || 'Virtual account funding',
      metadata,
    });
  }

  async processUtilityPurchase({
    userId,
    transactionId,
    amount,
    feeAmount = 0,
    providerFee = 0,
    currency = DEFAULT_CURRENCY,
    provider = 'vtpass',
    providerReference,
    reference,
    type = 'bill_payment',
    description,
    metadata = {},
  }) {
    const userWallet = await this.ensureUserWallet(userId, currency);
    const { settlementWallet } = await this.ensureSystemWallets(currency);
    const totalDebit = amount + feeAmount;

    if (!userWallet.canTransact(totalDebit)) {
      throw new Error('Insufficient balance to cover amount and fee');
    }

    await walletModuleService.transfer(
      userWallet.walletId,
      settlementWallet.walletId,
      amount,
      {
        transactionId,
        reference: `${reference}-SETTLEMENT`,
        type: this.mapLedgerType(type),
        provider,
        userId,
        description: description || `${type} purchase`,
        providerReference,
        ...metadata,
      }
    );

    if (feeAmount > 0) {
      await this.transferFee({
        userId,
        currency,
        amount: feeAmount,
        sourceWalletId: userWallet.walletId,
        provider,
        transactionId,
        reference: `${reference}-FEE`,
        description: `${type} fee`,
        commissionSource: this.mapCommissionSource(type),
        providerReference,
        metadata,
      });
    }

    if (providerFee > 0) {
      const providerWallet = await WalletV2.getProviderWallet(provider, currency);
      if (providerWallet) {
        await walletModuleService.transfer(
          settlementWallet.walletId,
          providerWallet.walletId,
          providerFee,
          {
            transactionId,
            reference: `${reference}-PROVIDER`,
            type: 'fee_collection',
            provider,
            userId,
            description: `${provider} provider fee for ${type}`,
            providerFee,
            providerReference,
            ...metadata,
          }
        );
      }
    }

    await this.syncLegacyWalletFromV2(userId, currency, await WalletV2.getUserWallet(userId, currency));

    return {
      totalDebit,
      userWallet: await WalletV2.getUserWallet(userId, currency),
    };
  }

  async processPayoutReservation({
    userId,
    transactionId,
    amount,
    feeAmount = 0,
    currency = DEFAULT_CURRENCY,
    provider = 'wema',
    providerReference,
    reference,
    description,
    metadata = {},
  }) {
    return this.processUtilityPurchase({
      userId,
      transactionId,
      amount,
      feeAmount,
      currency,
      provider,
      providerReference,
      reference,
      type: 'payout',
      description: description || 'Bank transfer payout',
      metadata,
    });
  }

  mapLedgerType(type) {
    return LEDGER_TYPE_MAP[type] || type;
  }

  mapCommissionSource(type) {
    if (['airtime', 'data_bundle', 'bill_payment'].includes(type)) {
      return 'bill_payment';
    }
    return type;
  }

  async transferFee({
    userId,
    currency,
    amount,
    sourceWalletId,
    provider,
    transactionId,
    reference,
    description,
    commissionSource,
    providerReference,
    metadata = {},
  }) {
    const commissionWallet = await WalletV2.getCommissionWallet(currency);
    await walletModuleService.transfer(
      sourceWalletId,
      commissionWallet.walletId,
      amount,
      {
        transactionId,
        reference,
        type: 'fee_collection',
        provider,
        userId,
        description,
        commission: amount,
        providerReference,
        ...metadata,
      }
    );

    await recordCommission({
      transactionId,
      amount,
      currency,
      source: commissionSource,
      fromUser: userId,
      description,
      grossAmount: metadata.grossAmount || amount,
      feePercentage: metadata.feePercentage,
      notes: providerReference ? `Provider reference: ${providerReference}` : undefined,
      auditOnly: true,
    });
  }

  getLegacyWalletBalance(legacyWallet, currency) {
    if (!legacyWallet) {
      return 0;
    }

    const matchedWallet = legacyWallet.wallets?.find(
      (wallet) => wallet.currency === currency && wallet.purpose === 'general' && wallet.isActive
    );

    if (matchedWallet) {
      return matchedWallet.balance;
    }

    return currency === legacyWallet.currency ? legacyWallet.balance : 0;
  }

  buildVirtualAccountData(legacyWallet) {
    if (!legacyWallet?.virtualAccountNumber) {
      return undefined;
    }

    return {
      accountNumber: legacyWallet.virtualAccountNumber,
      accountName: legacyWallet.virtualAccountName,
      bankName: legacyWallet.virtualAccountBank || 'Wema Bank',
      provider: 'wema',
      providerReference: legacyWallet.virtualAccountReference,
      status: legacyWallet.virtualAccountStatus || 'active',
    };
  }
}

module.exports = new UnifiedLedgerService();
