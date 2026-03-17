// Wema Bank List Service
// Provides list of Nigerian banks for transfers

const wemaApiClient = require('../../utils/wemaApiClient');
const logger = require('../../utils/logger');

// Static list of Nigerian banks (fallback if API fails)
const NIGERIAN_BANKS = [
  { code: '044', name: 'Access Bank' },
  { code: '023', name: 'Citibank Nigeria' },
  { code: '063', name: 'Diamond Bank' },
  { code: '050', name: 'Ecobank Nigeria' },
  { code: '084', name: 'Enterprise Bank' },
  { code: '070', name: 'Fidelity Bank' },
  { code: '011', name: 'First Bank of Nigeria' },
  { code: '214', name: 'First City Monument Bank' },
  { code: '058', name: 'Guaranty Trust Bank' },
  { code: '030', name: 'Heritage Bank' },
  { code: '301', name: 'Jaiz Bank' },
  { code: '082', name: 'Keystone Bank' },
  { code: '014', name: 'Mainstreet Bank' },
  { code: '076', name: 'Polaris Bank' },
  { code: '039', name: 'Stanbic IBTC Bank' },
  { code: '232', name: 'Sterling Bank' },
  { code: '032', name: 'Union Bank of Nigeria' },
  { code: '033', name: 'United Bank for Africa' },
  { code: '215', name: 'Unity Bank' },
  { code: '035', name: 'Wema Bank' },
  { code: '057', name: 'Zenith Bank' }
];

module.exports = {
  async getBankList() {
    try {
      // Try to get bank list from Wema API
      const response = await wemaApiClient.get('/fundstransferopenapi/v1/banks');

      if (response.data && response.data.success && response.data.data) {
        return {
          success: true,
          data: response.data.data.map(bank => ({
            code: bank.code,
            name: bank.name
          }))
        };
      }
    } catch (error) {
      logger.warn('Failed to fetch banks from Wema API, using static list:', error.message);
    }

    // Fallback to static list
    return {
      success: true,
      data: NIGERIAN_BANKS
    };
  },

  async getBankByCode(bankCode) {
    const banks = await this.getBankList();
    if (banks.success) {
      const bank = banks.data.find(b => b.code === bankCode);
      return bank || null;
    }
    return null;
  }
};