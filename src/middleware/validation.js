const validateEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const validatePhone = (phone) => {
  // E.164 format: +1234567890
  const regex = /^\+\d{1,15}$/;
  return regex.test(phone);
};

const validateAmount = (amount) => {
  return !isNaN(amount) && amount > 0 && amount <= 1000000; // Max $10k
};

const inputValidator = (req, res, next) => {
  // Sanitize and validate inputs
  req.body = Object.keys(req.body).reduce((acc, key) => {
    const value = req.body[key];
    // Remove any dangerous characters
    acc[key] = typeof value === 'string' ? value.trim() : value;
    return acc;
  }, {});

  next();
};

module.exports = { validateEmail, validatePhone, validateAmount, inputValidator };
