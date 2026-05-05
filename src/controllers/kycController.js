const Merchant = require('../models/Merchant');
const MerchantKYC = require('../models/MerchantKYC');
const cloudinaryService = require('../services/cloudinary');

// Get KYC Details
const getKYCDetails = async (req, res) => {
  try {
    const userId = req.userId;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const kyc = await MerchantKYC.findOne({ merchantId: merchant._id });
    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    res.json({
      success: true,
      kyc: {
        _id: kyc._id,
        status: kyc.status,
        verified: kyc.verified,
        kycLevel: kyc.kycLevel,
        businessRegistration: {
          number: kyc.businessRegistration?.number || null,
          verified: kyc.businessRegistration?.verified || false,
          uploaded: !!kyc.businessRegistration?.document
        },
        directors: kyc.directors?.map(d => ({
          _id: d._id,
          name: d.name,
          email: d.email,
          idType: d.idType,
          verified: d.verified,
          uploaded: !!d.idDocument
        })) || [],
        bankAccount: {
          accountNumber: kyc.bankAccount?.accountNumber ? 
            kyc.bankAccount.accountNumber.slice(-4).padStart(kyc.bankAccount.accountNumber.length, '*') : null,
          bankCode: kyc.bankAccount?.bankCode || null,
          bankName: kyc.bankAccount?.bankName || null,
          verified: kyc.bankAccount?.verified || false,
          documentUploaded: !!kyc.bankAccount?.verificationDocument
        },
        submissions: kyc.submissions || [],
        rejectionReason: kyc.rejectionReason || null,
        createdAt: kyc.createdAt
      }
    });
  } catch (err) {
    console.error('Get KYC details error:', err);
    res.status(500).json({ error: 'Failed to get KYC details' });
  }
};

// Upload Business Registration Document
const uploadBusinessRegistration = async (req, res) => {
  try {
    const userId = req.userId;
    const { businessRegNumber } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let kyc = await MerchantKYC.findOne({ merchantId: merchant._id });
    if (!kyc) {
      kyc = new MerchantKYC({ merchantId: merchant._id });
    }

    // Delete old document if exists
    if (kyc.businessRegistration?.documentPublicId) {
      try {
        await cloudinaryService.deleteFile(kyc.businessRegistration.documentPublicId);
      } catch (err) {
        console.error('Error deleting old document:', err);
      }
    }

    // Upload new document to Cloudinary
    const uploadResult = await cloudinaryService.uploadDocument(
      req.file.buffer,
      merchant._id,
      'business-registration',
      req.file.originalname
    );

    kyc.businessRegistration = {
      number: businessRegNumber || null,
      document: uploadResult.secure_url,
      documentPublicId: uploadResult.public_id,
      verified: false
    };

    // Add submission record
    kyc.submissions = kyc.submissions || [];
    kyc.submissions.push({
      submittedAt: new Date(),
      status: 'pending',
      comment: 'Business registration document submitted'
    });

    await kyc.save();

    res.json({
      success: true,
      message: 'Business registration document uploaded successfully',
      kyc: {
        businessRegistration: {
          verified: kyc.businessRegistration.verified,
          uploaded: true
        }
      }
    });
  } catch (err) {
    console.error('Upload business registration error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Upload Director ID
const uploadDirectorID = async (req, res) => {
  try {
    const userId = req.userId;
    const { directorName, directorEmail, idType, idNumber, directorId } = req.body;

    if (!directorName || !idType || !idNumber) {
      return res.status(400).json({ 
        error: 'Director name, ID type, and ID number are required' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let kyc = await MerchantKYC.findOne({ merchantId: merchant._id });
    if (!kyc) {
      kyc = new MerchantKYC({ merchantId: merchant._id });
    }

    // Upload document to Cloudinary
    const uploadResult = await cloudinaryService.uploadDocument(
      req.file.buffer,
      merchant._id,
      `director-${idType}`,
      req.file.originalname
    );

    // Add or update director
    let director;
    if (directorId) {
      // Update existing director
      director = kyc.directors.id(directorId);
      if (!director) {
        return res.status(404).json({ error: 'Director not found' });
      }

      // Delete old document
      if (director.idDocumentPublicId) {
        try {
          await cloudinaryService.deleteFile(director.idDocumentPublicId);
        } catch (err) {
          console.error('Error deleting old document:', err);
        }
      }

      director.name = directorName;
      director.email = directorEmail || director.email;
      director.idType = idType;
      director.idNumber = idNumber;
      director.idDocument = uploadResult.secure_url;
      director.idDocumentPublicId = uploadResult.public_id;
      director.verified = false;
    } else {
      // Add new director
      director = {
        name: directorName,
        email: directorEmail,
        idType,
        idNumber,
        idDocument: uploadResult.secure_url,
        idDocumentPublicId: uploadResult.public_id,
        verified: false
      };
      kyc.directors.push(director);
    }

    // Add submission record
    kyc.submissions = kyc.submissions || [];
    kyc.submissions.push({
      submittedAt: new Date(),
      status: 'pending',
      comment: `${directorName} ID document submitted`
    });

    await kyc.save();

    res.json({
      success: true,
      message: 'Director ID document uploaded successfully',
      director: {
        _id: director._id,
        name: director.name,
        idType: director.idType,
        verified: director.verified,
        uploaded: true
      }
    });
  } catch (err) {
    console.error('Upload director ID error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Upload Bank Statement
const uploadBankStatement = async (req, res) => {
  try {
    const userId = req.userId;
    const { accountNumber, bankCode, bankName, accountName } = req.body;

    if (!accountNumber || !bankCode || !bankName || !accountName) {
      return res.status(400).json({ 
        error: 'Account number, bank code, bank name, and account name are required' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let kyc = await MerchantKYC.findOne({ merchantId: merchant._id });
    if (!kyc) {
      kyc = new MerchantKYC({ merchantId: merchant._id });
    }

    // Delete old document if exists
    if (kyc.bankAccount?.documentPublicId) {
      try {
        await cloudinaryService.deleteFile(kyc.bankAccount.documentPublicId);
      } catch (err) {
        console.error('Error deleting old document:', err);
      }
    }

    // Upload document to Cloudinary
    const uploadResult = await cloudinaryService.uploadDocument(
      req.file.buffer,
      merchant._id,
      'bank-statement',
      req.file.originalname
    );

    kyc.bankAccount = {
      accountNumber,
      bankCode,
      bankName,
      accountName,
      verificationDocument: uploadResult.secure_url,
      documentPublicId: uploadResult.public_id,
      verified: false
    };

    // Add submission record
    kyc.submissions = kyc.submissions || [];
    kyc.submissions.push({
      submittedAt: new Date(),
      status: 'pending',
      comment: 'Bank statement submitted for verification'
    });

    await kyc.save();

    res.json({
      success: true,
      message: 'Bank statement uploaded successfully',
      bankAccount: {
        accountNumber: accountNumber.slice(-4).padStart(accountNumber.length, '*'),
        bankName,
        verified: kyc.bankAccount.verified,
        uploaded: true
      }
    });
  } catch (err) {
    console.error('Upload bank statement error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Add Director
const addDirector = async (req, res) => {
  try {
    const userId = req.userId;
    const { name, email, phone } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Director name is required' });
    }

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    let kyc = await MerchantKYC.findOne({ merchantId: merchant._id });
    if (!kyc) {
      kyc = new MerchantKYC({ merchantId: merchant._id });
    }

    const director = {
      name,
      email: email || null,
      phone: phone || null,
      idType: null,
      idNumber: null,
      idDocument: null,
      verified: false
    };

    kyc.directors.push(director);
    await kyc.save();

    const newDirector = kyc.directors[kyc.directors.length - 1];

    res.json({
      success: true,
      message: 'Director added. Please upload ID next.',
      director: {
        _id: newDirector._id,
        name: newDirector.name,
        email: newDirector.email
      }
    });
  } catch (err) {
    console.error('Add director error:', err);
    res.status(500).json({ error: 'Failed to add director' });
  }
};

// Remove Director
const removeDirector = async (req, res) => {
  try {
    const userId = req.userId;
    const { directorId } = req.params;

    const merchant = await Merchant.findOne({ userId });
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }

    const kyc = await MerchantKYC.findOne({ merchantId: merchant._id });
    if (!kyc) {
      return res.status(404).json({ error: 'KYC record not found' });
    }

    const director = kyc.directors.id(directorId);
    if (!director) {
      return res.status(404).json({ error: 'Director not found' });
    }

    // Delete document from Cloudinary
    if (director.idDocumentPublicId) {
      try {
        await cloudinaryService.deleteFile(director.idDocumentPublicId);
      } catch (err) {
        console.error('Error deleting document:', err);
      }
    }

    director.deleteOne();
    await kyc.save();

    res.json({
      success: true,
      message: 'Director removed successfully'
    });
  } catch (err) {
    console.error('Remove director error:', err);
    res.status(500).json({ error: 'Failed to remove director' });
  }
};

module.exports = {
  getKYCDetails,
  uploadBusinessRegistration,
  uploadDirectorID,
  uploadBankStatement,
  addDirector,
  removeDirector
};
