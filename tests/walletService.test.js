jest.mock('../src/models/User', () => ({ findById: jest.fn(), findByIdAndUpdate: jest.fn() }));
jest.mock('../src/models/UserKYC', () => ({ findOne: jest.fn() }));
jest.mock('../src/models/Wallet', () => ({ findOne: jest.fn() }));
jest.mock('../src/services/unifiedLedgerService', () => ({
  ensureUserWallet: jest.fn().mockResolvedValue(true),
  syncLegacyWalletFromV2: jest.fn().mockResolvedValue(true),
}));
jest.mock('../src/services/wema/virtualAccountService', () => ({
  createVirtualAccount: jest.fn().mockRejectedValue(new Error('Wema not configured')),
}));

const User = require('../src/models/User');
const UserKYC = require('../src/models/UserKYC');
const Wallet = require('../src/models/Wallet');

const mockCreateVirtualAccount = jest.fn();

jest.mock('../src/modules/flutterwave/flutterwaveService', () => {
  return jest.fn().mockImplementation(() => ({
    createVirtualAccount: mockCreateVirtualAccount,
  }));
});

const walletService = require('../src/services/walletService');

describe('walletService.createVirtualAccountForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateVirtualAccount.mockReset();
  });

  it('throws if user is not found', async () => {
    User.findById.mockResolvedValue(null);
    await expect(walletService.createVirtualAccountForUser('nonexistent')).rejects.toThrow('User not found');
  });

  it('throws if wallet is not found', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', firstName: 'Test', lastName: 'User', email: 'test@example.com', kyc: {} });
    UserKYC.findOne.mockResolvedValue(null);
    Wallet.findOne.mockResolvedValue(null);
    await expect(walletService.createVirtualAccountForUser('user1')).rejects.toThrow('Wallet not found for user');
  });

  it('returns existing virtual account if already created', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', firstName: 'Test', lastName: 'User', email: 'test@example.com', kyc: {} });
    UserKYC.findOne.mockResolvedValue(null);
    Wallet.findOne.mockResolvedValue({
      virtualAccountNumber: '1234567890',
      virtualAccountName: 'Test User',
      virtualAccountBank: 'Flutterwave',
    });

    const result = await walletService.createVirtualAccountForUser('user1');
    expect(result.success).toBe(true);
    expect(result.data.accountNumber).toBe('1234567890');
    expect(mockCreateVirtualAccount).not.toHaveBeenCalled();
  });

  it('creates a virtual account using NIN from UserKYC', async () => {
    const user = { _id: 'user2', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', kyc: {} };
    const walletMock = {
      virtualAccountNumber: null,
      save: jest.fn().mockResolvedValue(true),
      walletId: 'w1',
    };

    User.findById.mockResolvedValue(user);
    User.findByIdAndUpdate.mockResolvedValue(user);
    UserKYC.findOne.mockResolvedValue({ idType: 'nin', idNumber: '12345678901' });
    Wallet.findOne.mockResolvedValue(walletMock);

    mockCreateVirtualAccount.mockResolvedValue({
      status: 'success',
      data: {
        account_number: '0123456789',
        account_name: 'Jane Doe',
        bank_name: 'Flutterwave',
        tx_ref: 'WAVVA_VA_user2_1',
        is_permanent: true,
        id: 'va-id',
      },
    });

    const result = await walletService.createVirtualAccountForUser('user2');

    expect(result.success).toBe(true);
    expect(result.data.accountNumber).toBe('0123456789');
    expect(walletMock.virtualAccountNumber).toBe('0123456789');
    expect(walletMock.save).toHaveBeenCalled();
  });

  it('handles Flutterwave failure gracefully when no KYC', async () => {
    const user = { _id: 'user3', firstName: 'No', lastName: 'KYC', email: 'nokyc@example.com', kyc: {} };
    const walletMock = {
      virtualAccountNumber: null,
      save: jest.fn().mockResolvedValue(true),
    };

    User.findById.mockResolvedValue(user);
    UserKYC.findOne.mockResolvedValue(null);
    Wallet.findOne.mockResolvedValue(walletMock);

    mockCreateVirtualAccount.mockRejectedValue(new Error('BVN or NIN is required'));

    const result = await walletService.createVirtualAccountForUser('user3');
    expect(result.success).toBe(true);
    expect(result.requiresKYC).toBe(true);
    expect(result.data.status).toBe('pending_kyc');
  });
});
