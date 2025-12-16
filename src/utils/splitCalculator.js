/**
 * Calculate fair bill splits with rounding
 * @param {number} totalAmount - Total amount in cents
 * @param {number} numberOfPeople - Number of people to split between
 * @returns {object} Split breakdown
 */
const calculateEvenSplit = (totalAmount, numberOfPeople) => {
  if (numberOfPeople <= 0) throw new Error('Invalid number of people');
  
  const amountPerPerson = Math.floor(totalAmount / numberOfPeople);
  const remainder = totalAmount % numberOfPeople;
  
  const splits = Array(numberOfPeople).fill(amountPerPerson);
  
  // Distribute remainder evenly (add 1 cent to first few people)
  for (let i = 0; i < remainder; i++) {
    splits[i] += 1;
  }
  
  return {
    perPerson: amountPerPerson,
    withRemainder: splits,
    total: splits.reduce((a, b) => a + b, 0),
    remainder,
  };
};

/**
 * Calculate proportional split based on consumption
 * @param {number} totalAmount - Total in cents
 * @param {array} proportions - [user1Weight, user2Weight, ...]
 * @returns {object} Split breakdown
 */
const calculateProportionalSplit = (totalAmount, proportions) => {
  const totalWeight = proportions.reduce((a, b) => a + b, 0);
  
  if (totalWeight === 0) throw new Error('Total weight cannot be zero');
  
  const splits = proportions.map(proportion => {
    return Math.round((proportion / totalWeight) * totalAmount);
  });
  
  // Adjust for rounding errors
  const currentTotal = splits.reduce((a, b) => a + b, 0);
  const difference = totalAmount - currentTotal;
  
  if (difference !== 0) {
    splits[0] += difference;
  }
  
  return {
    percentages: proportions.map(p => ((p / totalWeight) * 100).toFixed(2)),
    splits,
    total: splits.reduce((a, b) => a + b, 0),
  };
};

/**
 * Calculate who owes whom (min transactions)
 * @param {object} balances - { userId: amount }
 * @returns {array} Transactions needed to settle
 */
const calculateSettlements = (balances) => {
  const transactions = [];
  const userIds = Object.keys(balances);
  
  // Separate debtors and creditors
  const debtors = userIds
    .filter(id => balances[id] < 0)
    .map(id => ({ id, amount: Math.abs(balances[id]) }))
    .sort((a, b) => b.amount - a.amount);
  
  const creditors = userIds
    .filter(id => balances[id] > 0)
    .map(id => ({ id, amount: balances[id] }))
    .sort((a, b) => b.amount - a.amount);
  
  // Match debtors with creditors
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    
    transactions.push({
      from: debtors[i].id,
      to: creditors[j].id,
      amount,
    });
    
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  
  return transactions;
};

module.exports = {
  calculateEvenSplit,
  calculateProportionalSplit,
  calculateSettlements,
};
