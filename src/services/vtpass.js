const axios = require('axios');

const SERVICE_MAPPINGS = {
  airtime: {
    mtn: 'mtn',
    glo: 'glo',
    airtel: 'airtel',
    '9mobile': 'etisalat',
  },
  data: {
    mtn: 'mtn-data',
    glo: 'glo-data',
    airtel: 'airtel-data',
    '9mobile': 'etisalat-data',
  },
  cable: {
    dstv: 'dstv',
    gotv: 'gotv',
    startimes: 'startimes',
  },
  electricity: {
    aedc: 'abuja-electric',
    ekedc: 'eko-electric',
    eedc: 'enugu-electric',
    ibedc: 'ibadan-electric',
    ikedc: 'ikeja-electric',
    phed: 'portharcourt-electric',
    kedco: 'kano-electric',
    jed: 'jos-electric',
  },
};

class VTPassService {
  constructor() {
    this.client = axios.create({
      baseURL: process.env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  getHeaders() {
    const headers = {};

    if (process.env.VTPASS_API_KEY) {
      headers['api-key'] = process.env.VTPASS_API_KEY;
    }
    if (process.env.VTPASS_PUBLIC_KEY) {
      headers['public-key'] = process.env.VTPASS_PUBLIC_KEY;
    }
    if (process.env.VTPASS_SECRET_KEY) {
      headers['secret-key'] = process.env.VTPASS_SECRET_KEY;
    }
    if (process.env.VTPASS_USERNAME && process.env.VTPASS_PASSWORD) {
      const token = Buffer.from(
        `${process.env.VTPASS_USERNAME}:${process.env.VTPASS_PASSWORD}`
      ).toString('base64');
      headers.Authorization = `Basic ${token}`;
    }

    return headers;
  }

  async buyAirtime(networkCode, phoneNumber, amountInKobo, metadata = {}) {
    const requestId = this.buildRequestId('AIRTIME');
    const serviceID = this.resolveServiceId('airtime', networkCode);

    return this.pay({
      request_id: requestId,
      serviceID,
      amount: amountInKobo / 100,
      phone: phoneNumber,
      metadata,
    }, {
      providerType: 'airtime',
      serviceID,
      requestId,
      phoneNumber,
      amountInKobo,
    });
  }

  async buyDataBundle(networkCode, phoneNumber, variationCode, amountInKobo, metadata = {}) {
    const requestId = this.buildRequestId('DATA');
    const serviceID = this.resolveServiceId('data', networkCode);

    return this.pay({
      request_id: requestId,
      serviceID,
      billersCode: phoneNumber,
      variation_code: variationCode,
      amount: amountInKobo / 100,
      phone: phoneNumber,
      metadata,
    }, {
      providerType: 'data',
      serviceID,
      requestId,
      phoneNumber,
      amountInKobo,
      variationCode,
    });
  }

  async payElectricityBill(providerId, meterNumber, meterType, amountInKobo, metadata = {}) {
    const requestId = this.buildRequestId('ELECTRICITY');
    const serviceID = this.resolveServiceId('electricity', providerId);

    return this.pay({
      request_id: requestId,
      serviceID,
      billersCode: meterNumber,
      variation_code: meterType,
      amount: amountInKobo / 100,
      phone: metadata.phone,
      metadata,
    }, {
      providerType: 'electricity',
      serviceID,
      requestId,
      meterNumber,
      meterType,
      amountInKobo,
    });
  }

  async payCableTVBill(providerId, smartCardNumber, variationCode, amountInKobo, metadata = {}) {
    const requestId = this.buildRequestId('CABLE');
    const serviceID = this.resolveServiceId('cable', providerId);

    return this.pay({
      request_id: requestId,
      serviceID,
      billersCode: smartCardNumber,
      variation_code: variationCode,
      amount: amountInKobo / 100,
      phone: metadata.phone,
      subscription_type: 'change',
      metadata,
    }, {
      providerType: 'cable',
      serviceID,
      requestId,
      smartCardNumber,
      variationCode,
      amountInKobo,
    });
  }

  async requery(requestId) {
    try {
      const response = await this.client.post(
        '/api/requery',
        { request_id: requestId },
        { headers: this.getHeaders() }
      );

      return {
        success: this.isSuccessful(response.data),
        status: response.data?.code || response.data?.content?.transactions?.status || 'unknown',
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.response_description || error.message,
      };
    }
  }

  async getDataPlans(networkCode) {
    return this.getServiceVariations(this.resolveServiceId('data', networkCode));
  }

  async getServiceVariations(serviceID) {
    try {
      const response = await this.client.get('/api/service-variations', {
        params: { serviceID },
        headers: this.getHeaders(),
      });

      const variations = response.data?.content?.varations || response.data?.content?.variations || [];
      return {
        success: true,
        plans: variations.map((variation) => ({
          id: variation.variation_code,
          name: variation.name,
          amount: Number(variation.variation_amount || variation.amount || 0) * 100,
          rawAmount: variation.variation_amount || variation.amount || 0,
          variationCode: variation.variation_code,
          validity: variation.fixedPrice ? 'fixed' : 'dynamic',
        })),
        count: variations.length,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.response_description || error.message,
        plans: [],
      };
    }
  }

  async getBillProviders(category = null) {
    const categories = category ? [category] : Object.keys(SERVICE_MAPPINGS);
    const providers = categories.flatMap((key) => {
      const mapping = SERVICE_MAPPINGS[key] || {};
      return Object.entries(mapping).map(([id, serviceID]) => ({
        id,
        serviceID,
        name: id.toUpperCase(),
        category: key,
      }));
    });

    return {
      success: true,
      providers,
      count: providers.length,
    };
  }

  async pay(payload, context = {}) {
    try {
      const response = await this.client.post('/api/pay', payload, {
        headers: this.getHeaders(),
      });

      const data = response.data;
      const success = this.isSuccessful(data);
      const providerReference =
        data?.content?.transactions?.transactionId ||
        data?.content?.transactions?.transaction_id ||
        data?.content?.transactions?.product_name ||
        payload.request_id;

      return {
        success,
        status: success ? 'success' : (data?.code || 'failed'),
        reference: payload.request_id,
        providerReference,
        requestId: payload.request_id,
        amount: context.amountInKobo,
        provider: 'vtpass',
        serviceID: context.serviceID,
        message: data?.response_description || data?.content?.transactions?.status || 'Request processed',
        raw: data,
      };
    } catch (error) {
      return {
        success: false,
        status: error.response?.data?.code || 'failed',
        error: error.response?.data?.response_description || error.message,
        raw: error.response?.data,
      };
    }
  }

  isSuccessful(data) {
    const code = String(data?.code || '').toLowerCase();
    const status = String(data?.content?.transactions?.status || data?.response_description || '').toLowerCase();
    return code === '000' || status.includes('delivered') || status.includes('successful') || status.includes('approved');
  }

  resolveServiceId(category, providerKey) {
    const normalized = String(providerKey || '').trim().toLowerCase();
    return SERVICE_MAPPINGS[category]?.[normalized] || normalized;
  }

  buildRequestId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  }
}

module.exports = new VTPassService();
