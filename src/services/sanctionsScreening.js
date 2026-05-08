const axios = require('axios');
const logger = require('../utils/logger');

class SanctionsScreeningService {
  constructor() {
    this.worldCheckApiKey = process.env.WORLD_CHECK_API_KEY;
    this.baseURL = process.env.WORLD_CHECK_BASE_URL;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.worldCheckApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    // Fallback sanctions lists (basic implementation)
    this.sanctionedEntities = [
      // OFAC SDN List (sample entries)
      'TERRORIST ORGANIZATION',
      'DRUG CARTEL',
      'MONEY LAUNDERING NETWORK',
      // Add more as needed
    ];

    this.sanctionedCountries = [
      'IR', // Iran
      'KP', // North Korea
      'SY', // Syria
      // Add more as needed
    ];
  }

  async screenEntity(entityData) {
    try {
      // Try World-Check API first
      if (this.worldCheckApiKey && this.worldCheckApiKey !== 'your-world-check-api-key') {
        return await this.worldCheckScreening(entityData);
      }
      
      // Fallback to basic screening
      return await this.basicScreening(entityData);
    } catch (error) {
      logger.error('Sanctions screening failed', {
        entity: entityData.name,
        error: error.message,
      });
      return {
        success: false,
        error: 'Sanctions screening failed',
      };
    }
  }

  async worldCheckScreening(entityData) {
    try {
      const payload = {
        groupId: 'default',
        entityType: entityData.type || 'INDIVIDUAL',
        providerTypes: ['WATCHLIST'],
        name: entityData.name,
        secondaryFields: [
          {
            typeId: 'SFCT_1', // Date of Birth
            value: entityData.dateOfBirth,
          },
          {
            typeId: 'SFCT_2', // Country
            value: entityData.country,
          },
        ],
      };

      const response = await this.client.post('/cases', payload);
      
      const caseId = response.data.caseId;
      
      // Get screening results
      const resultsResponse = await this.client.get(`/cases/${caseId}/results`);
      
      const matches = resultsResponse.data.results || [];
      const highRiskMatches = matches.filter(match => match.matchStrength >= 0.8);
      
      return {
        success: true,
        isSanctioned: highRiskMatches.length > 0,
        matches: highRiskMatches,
        riskScore: this.calculateRiskScore(highRiskMatches),
        caseId,
      };
    } catch (error) {
      logger.error('World-Check screening failed', {
        entity: entityData.name,
        error: error.response?.data || error.message,
      });
      
      // Fallback to basic screening
      return await this.basicScreening(entityData);
    }
  }

  async basicScreening(entityData) {
    try {
      const name = entityData.name.toUpperCase();
      const country = entityData.country;
      
      // Check against sanctioned entities
      const nameMatch = this.sanctionedEntities.some(sanctioned => 
        name.includes(sanctioned) || this.fuzzyMatch(name, sanctioned)
      );
      
      // Check against sanctioned countries
      const countryMatch = this.sanctionedCountries.includes(country);
      
      // Check for PEP (Politically Exposed Person) indicators
      const pepIndicators = ['MINISTER', 'PRESIDENT', 'GOVERNOR', 'SENATOR', 'AMBASSADOR'];
      const pepMatch = pepIndicators.some(indicator => name.includes(indicator));
      
      const isSanctioned = nameMatch || countryMatch;
      const riskScore = this.calculateBasicRiskScore(nameMatch, countryMatch, pepMatch);
      
      return {
        success: true,
        isSanctioned,
        isPEP: pepMatch,
        riskScore,
        reasons: [
          ...(nameMatch ? ['Name match with sanctions list'] : []),
          ...(countryMatch ? ['Country under sanctions'] : []),
          ...(pepMatch ? ['Politically Exposed Person indicators'] : []),
        ],
      };
    } catch (error) {
      logger.error('Basic sanctions screening failed', {
        entity: entityData.name,
        error: error.message,
      });
      return {
        success: false,
        error: 'Sanctions screening failed',
      };
    }
  }

  fuzzyMatch(str1, str2, threshold = 0.8) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length >= threshold;
  }

  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  calculateRiskScore(matches) {
    if (!matches || matches.length === 0) return 0;
    
    let maxScore = 0;
    matches.forEach(match => {
      const score = match.matchStrength * 100;
      if (score > maxScore) maxScore = score;
    });
    
    return Math.min(maxScore, 100);
  }

  calculateBasicRiskScore(nameMatch, countryMatch, pepMatch) {
    let score = 0;
    
    if (nameMatch) score += 90;
    if (countryMatch) score += 70;
    if (pepMatch) score += 50;
    
    return Math.min(score, 100);
  }

  async screenTransaction(transactionData) {
    try {
      const results = [];
      
      // Screen sender
      if (transactionData.sender) {
        const senderResult = await this.screenEntity({
          name: transactionData.sender.name,
          country: transactionData.sender.country,
          dateOfBirth: transactionData.sender.dateOfBirth,
          type: 'INDIVIDUAL',
        });
        results.push({ party: 'sender', ...senderResult });
      }
      
      // Screen recipient
      if (transactionData.recipient) {
        const recipientResult = await this.screenEntity({
          name: transactionData.recipient.name,
          country: transactionData.recipient.country,
          dateOfBirth: transactionData.recipient.dateOfBirth,
          type: 'INDIVIDUAL',
        });
        results.push({ party: 'recipient', ...recipientResult });
      }
      
      const highestRisk = Math.max(...results.map(r => r.riskScore || 0));
      const isSanctioned = results.some(r => r.isSanctioned);
      
      return {
        success: true,
        isSanctioned,
        riskScore: highestRisk,
        results,
      };
    } catch (error) {
      logger.error('Transaction sanctions screening failed', {
        transactionId: transactionData.transactionId,
        error: error.message,
      });
      return {
        success: false,
        error: 'Transaction screening failed',
      };
    }
  }
}

module.exports = new SanctionsScreeningService();