jest.mock('../../src/models/User', () => ({ findById: jest.fn() }));
jest.mock('../../src/models/UserKYC', () => ({ findOne: jest.fn() }));
jest.mock('../../src/models/Wallet', () => ({ findOne: jest.fn() }));

const User = require('../../src/models/User');
const UserKYC = require('../../src/models/UserKYC');
const Wallet = require('../../src/models/Wallet');

const mockCreateVirtualAccount = jest.fn();

jest.mock('../../src/modules/flutterwave/flutterwaveService', () => {
  return jest.fn().mockImplementation(() => ({
    createVirtualAccount: mockCreateVirtualAccount
  }));
});

const walletService = require('../../src/services/walletService');

describe('walletService.createVirtualAccountForUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateVirtualAccount.mockReset();
  });

  it('throws if BVN/NIN is missing from user and KYC data', async () => {
    User.findById.mockResolvedValue({ _id: 'user1', firstName: 'Test', lastName: 'User', email: 'test@example.com', kyc: {} });
    UserKYC.findOne.mockResolvedValue(null);
    Wallet.findOne.mockResolvedValue({ virtualAccountNumber: null });

    await expect(walletService.createVirtualAccountForUser('user1')).rejects.toThrow('BVN or NIN is required');

    expect(User.findById).toHaveBeenCalledWith('user1');
    expect(UserKYC.findOne).toHaveBeenCalledWith({ userId: 'user1' });
  });

  it('creates a virtual account using NIN from UserKYC', async () => {
    const user = { _id: 'user2', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', kyc: {} };
    const walletMock = {
      virtualAccountNumber: null,
      save: jest.fn().mockResolvedValue(true),
      walletId: 'w1'
    };

    User.findById.mockResolvedValue(user);
    UserKYC.findOne.mockResolvedValue({ idType: 'nin', idNumber: '12345678901' });
    Wallet.findOne.mockResolvedValue(walletMock);

    mockCreateVirtualAccount.mockResolvedValue({
      status: 'success',
      data: {
        account_number: '0123456789',
        account_name: 'Jan Doe',
        bank_name: 'Flutterwave',
        tx_ref: 'WAVVA_VA_user2_1',
        is_permanent: true,
        id: 'va-id',
      }
    });

    const result = await walletService.createVirtualAccountForUser('user2');

    expect(result.success).toBe(true);
    expect(result.data.accountNumber).toBe('0123456789');
    expect(walletMock.virtualAccountNumber).toBe('0123456789');
    expect(walletMock.virtualAccountReference).toBe('WAVVA_VA_user2_1');
    expect(walletMock.save).toHaveBeenCalled();
  });
});
