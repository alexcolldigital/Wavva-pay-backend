const FlutterwaveWebhookService = require('../flutterwave/flutterwaveService');
const WemaWebhookService = require('../wema/wemaService');

class WebhookHandler {
  // Flutterwave webhook handler
  static async handleFlutterwaveWebhook(req, res) {
    try {
      // Verify webhook signature
      const flutterwaveService = new FlutterwaveWebhookService();
      if (!flutterwaveService.verifyWebhook(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const result = await flutterwaveService.processWebhook(req.body);

      res.json({
        status: 'success',
        message: result.message || 'Webhook processed successfully',
        data: result
      });

    } catch (error) {
      console.error('Flutterwave webhook error:', error);
      res.status(500).json({
        error: 'Webhook processing failed',
        message: error.message
      });
    }
  }

  // Wema webhook handler
  static async handleWemaWebhook(req, res) {
    try {
      // Verify webhook signature
      const wemaService = new WemaWebhookService();
      if (!wemaService.verifyWebhook(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const result = await wemaService.processWebhook(req.body);

      res.json({
        status: 'success',
        message: result.message || 'Webhook processed successfully',
        data: result
      });

    } catch (error) {
      console.error('Wema webhook error:', error);
      res.status(500).json({
        error: 'Webhook processing failed',
        message: error.message
      });
    }
  }

  // Generic webhook handler for other providers
  static async handleGenericWebhook(req, res) {
    try {
      const { provider } = req.params;
      const webhookData = req.body;

      // Log webhook for debugging
      console.log(`Received ${provider} webhook:`, webhookData);

      // Basic validation
      if (!webhookData.event || !webhookData.data) {
        return res.status(400).json({ error: 'Invalid webhook format' });
      }

      // For now, just acknowledge receipt
      // In production, implement specific logic for each provider
      res.json({
        status: 'success',
        message: `${provider} webhook received`,
        provider,
        event: webhookData.event
      });

    } catch (error) {
      console.error('Generic webhook error:', error);
      res.status(500).json({
        error: 'Webhook processing failed',
        message: error.message
      });
    }
  }

  // Webhook verification endpoint
  static async verifyWebhook(req, res) {
    try {
      const { provider, reference } = req.params;

      let verificationResult;

      if (provider === 'flutterwave') {
        const flutterwaveService = new FlutterwaveWebhookService();
        verificationResult = await flutterwaveService.verifyTransaction(reference);
      } else if (provider === 'wema') {
        const wemaService = new WemaWebhookService();
        verificationResult = await wemaService.getTransactionStatus(reference);
      } else {
        return res.status(400).json({ error: 'Unsupported provider' });
      }

      res.json({
        status: 'success',
        provider,
        reference,
        verification: verificationResult
      });

    } catch (error) {
      console.error('Webhook verification error:', error);
      res.status(500).json({
        error: 'Verification failed',
        message: error.message
      });
    }
  }
}

module.exports = WebhookHandler;