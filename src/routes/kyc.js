const express = require('express');
const authMiddleware = require('../middleware/auth');
const { uploadDocument } = require('../middleware/uploadMiddleware');
const kycController = require('../controllers/kycController');

const router = express.Router();

// All KYC routes require authentication
router.use(authMiddleware);

// Get KYC Details
router.get('/', kycController.getKYCDetails);

// Upload Business Registration Document
router.post('/upload/business-registration', uploadDocument, kycController.uploadBusinessRegistration);

// Add Director (without document)
router.post('/directors', kycController.addDirector);

// Upload Director ID
router.post('/directors/:directorId/upload-id', uploadDocument, kycController.uploadDirectorID);

// Upload new Director ID (without directorId, creates new)
router.post('/upload/director-id', uploadDocument, kycController.uploadDirectorID);

// Remove Director
router.delete('/directors/:directorId', kycController.removeDirector);

// Upload Bank Statement
router.post('/upload/bank-statement', uploadDocument, kycController.uploadBankStatement);

module.exports = router;
