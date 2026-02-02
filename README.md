# Wavva Pay Backend

CBN-compliant Nigerian fintech backend with comprehensive KYC, AML monitoring, and payment processing.

## Features

- **CBN Compliance**: KYC tiers, transaction limits, AML monitoring
- **Payment Integration**: Paystack & Flutterwave support
- **Security**: JWT auth, encryption, rate limiting
- **Real-time Monitoring**: Risk scoring, compliance alerts
- **Nigerian Validations**: BVN, NIN, phone number validation

## Quick Start

```bash
npm install
cp .env.example .env
npm run db:setup
npm start
```

## Testing

```bash
npm test                 # Run all tests
npm run test:integration # Integration tests
npm run test:coverage    # Coverage report
```

## Deployment

```bash
npm run docker:build    # Build Docker image
npm run docker:deploy    # Deploy with Docker Compose
```

## API Documentation

Visit `/api-docs` when server is running for Swagger documentation.

## Environment Variables

See `.env.production` for required production configuration.

## License

MIT