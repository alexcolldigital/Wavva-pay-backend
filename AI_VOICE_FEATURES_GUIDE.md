# AI Voice Banking Features - Implementation Guide

## ✅ System Overview

Your WavvaPay backend now has **production-ready AI voice banking capabilities** powered by OpenAI. The system enables users to perform banking operations and get customer support entirely through voice.

---

## 🎯 Core AI Components

### 1. **Speech-to-Text (STT)**
- **Provider**: OpenAI Whisper API
- **Model**: whisper-1
- **Capabilities**:
  - Supports multiple languages (en, ha, yo, ig, fr, etc.)
  - Confidence scoring
  - Automatic language detection
  - Handles accents and background noise

**File**: `src/services/voice/STTService.js`

### 2. **Intent Detection & Understanding**
- **Provider**: OpenAI GPT models
- **Model**: gpt-3.5-turbo (configurable)
- **Capabilities**:
  - Identifies user intent from natural speech
  - Extracts financial entities (amount, recipient, etc.)
  - Classifies risk level (low/medium/high)
  - Determines if confirmation required
  - Confidence scoring (0.0 - 1.0)

**File**: `src/services/voice/IntentDetectionService.js`

**Supported Intents**:
```
- check_balance: Check wallet balance
- recent_transactions: View transaction history
- send_money: Transfer funds to another user
- request_money: Request money from someone
- bill_payment: Pay bills or airtime
- transfer_status: Check transfer status
- reset_pin: Reset security PIN
- faq: General questions
- speak_to_agent: Request human support
- unknown: Unable to determine
```

### 3. **Text-to-Speech (TTS)**
- **Primary Provider**: OpenAI TTS (tts-1-hd)
- **Fallback Provider**: Google TTS (gtts)
- **Voices**: alloy, echo, fable, onyx, nova, shimmer
- **Features**:
  - High-quality audio output
  - Configurable speed (0.25 - 4.0x)
  - Automatic fallback if OpenAI fails
  - MP3 format output

**File**: `src/services/voice/TTSService.js`

### 4. **Financial Command Handler**
- Executes banking operations safely
- Enforces confirmation flow for high-risk operations
- Handles transaction state management
- Integrates with existing wallet/transaction infrastructure

**File**: `src/services/voice/FinancialCommandHandler.js`

---

## 🔒 Risk Classification System

All commands are classified into three risk levels:

### **LOW RISK** 🟢
No confirmation required. Pure information requests:
- Check balance
- View transaction history
- View transfer status
- FAQ queries

### **MEDIUM RISK** 🟡
Requires verification for sensitive information:
- Reset PIN
- Request money from someone

### **HIGH RISK** 🔴
**REQUIRES EXPLICIT USER CONFIRMATION**
- Send money
- Pay bills
- Large transactions (>₦500,000)

---

## 📊 Data Flow Architecture

```
User Voice Input
    ↓
[STT Service] → "Send ₦5000 to John"
    ↓
[Intent Detection Service]
    ├─ Parse intent → "send_money"
    ├─ Extract entities → {amount: 5000, recipient: "John"}
    ├─ Classify risk → "high"
    ├─ Generate response → "You are about to send..."
    └─ Confidence → 0.92
    ↓
[Backend Validation]
    ├─ Check user permissions
    ├─ Verify insufficient balance
    └─ Check recipient exists
    ↓
[Decision Gate]
    ├─ If LOW/MEDIUM risk → Execute
    └─ If HIGH risk → Request confirmation (PIN/OTP)
    ↓
[Financial Command Handler]
    ├─ Process transaction
    ├─ Update wallets
    └─ Log audit trail
    ↓
[Response Generation]
    ├─ Create response message
    └─ Generate audio via TTS
    ↓
[TTS Service] → Audio file (MP3)
    ↓
User hears response
```

---

## 🔐 Security & Confirmation Flow

### High-Risk Operations (e.g., Send Money)

**Step 1: User speaks request**
```
User: "Send ₦5000 to John"
```

**Step 2: System analyzes and requests confirmation**
```json
{
  "success": false,
  "requiresConfirmation": true,
  "confirmationType": "PIN",
  "details": {
    "recipient": "John Doe",
    "amount": 5000,
    "currency": "NGN"
  },
  "response": "You are about to send ₦5,000 to John Doe. Please confirm to continue."
}
```

**Step 3: User provides confirmation (PIN/OTP via voice or manual)**
```
User: "My PIN is 1234"
```

**Step 4: System executes transaction**
```json
{
  "success": true,
  "message": "Successfully sent ₦5,000 to John Doe",
  "transactionId": "61a84d3c5b5c2f001a2b3c4d",
  "details": {
    "recipient": "John Doe",
    "amount": 5000,
    "status": "completed"
  }
}
```

---

## 📍 API Endpoints

### Voice Session Management

**Start a voice session**
```
POST /api/voice/support/session/start
Body: { featureType: 'SUPPORT'|'BANKING' }
Response: { sessionId, expiresIn }
```

**End a voice session**
```
POST /api/voice/support/session/end
Body: { sessionId, reason }
```

### Audio Processing

**Transcribe audio to text**
```
POST /api/voice/support/transcribe
Body: { sessionId, language: 'en' }
Files: { audio: <audio-file> }

Response:
{
  "transcription": "Send 5000 to Mary",
  "confidence": 0.92,
  "intent": "send_money",
  "intentConfidence": 0.95,
  "risk": "high",
  "requiresConfirmation": true,
  "entities": {
    "amount": 5000,
    "recipient": "Mary",
    "currency": "NGN"
  },
  "response": "You are about to send ₦5,000 to Mary. Please confirm."
}
```

### Financial Commands

**Execute a financial command**
```
POST /api/voice/support/execute
Body:
{
  "sessionId": "...",
  "intent": "send_money",
  "entities": {
    "amount": 5000,
    "recipient": "Mary"
  },
  "confirmationToken": null  // Only for high-risk with confirmation
}

Response:
{
  "success": true,
  "message": "Successfully sent ₦5,000 to Mary",
  "audio": "<base64-encoded-mp3>",
  "result": {
    "transactionId": "...",
    "status": "completed"
  }
}
```

**Confirm a pending action**
```
POST /api/voice/support/confirm
Body:
{
  "sessionId": "...",
  "intent": "send_money",
  "entities": { ... },
  "confirmationType": "PIN",
  "confirmationValue": "1234"  // User's PIN
}

Response:
{
  "success": true,
  "message": "Transaction confirmed and completed",
  "audio": "<base64-encoded-mp3>"
}
```

### Information Retrieval

**FAQ Response with voice**
```
POST /api/voice/support/respond
Body: { sessionId, userText, intent }

Response:
{
  "audio": "<base64-mp3>",
  "responseText": "Your current balance is...",
  "faqId": "faq_123",
  "type": "faq"
}
```

---

## 🛠️ Configuration

Set these environment variables in your `.env`:

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-...

# Voice Settings
LLM_PROVIDER=openai
STT_PROVIDER=whisper
TTS_PROVIDER=openai
VOICE_LANGUAGE=en
OPENAI_TTS_VOICE=nova  # Options: alloy, echo, fable, onyx, nova, shimmer

# Voice Session Settings
VOICE_MAX_AUDIO_DURATION=30  # Max 30 seconds per audio
VOICE_SESSION_TIMEOUT=1800   # Session expires after 30 minutes
VOICE_RATE_LIMIT=50          # Max 50 requests per minute

# Risk Configuration
TRANSACTION_LIMIT_HIGH_RISK=50000000  # ₦500,000
```

---

## 🎨 Example Use Cases

### Use Case 1: Check Balance (Low Risk)
```
❌ No confirmation needed

User: "What's my balance?"
  ↓
System: "Your current balance is ₦25,500"
System reads: [TTS audio plays response]
```

### Use Case 2: Send Money (High Risk)
```
✅ Confirmation required

User: "Send ₦10,000 to Chioma"
  ↓
[System identifies high-risk operation]
  ↓
System: "You are about to send ₦10,000 to Chioma. Please confirm with your PIN."
System reads: [TTS audio plays confirmation request]
  ↓
User: "My PIN is 5678"
  ↓
System: "Transaction confirmed. ₦10,000 sent to Chioma."
System reads: [TTS audio plays confirmation]
```

### Use Case 3: Bill Payment (High Risk)
```
✅ Confirmation required

User: "Pay ₦5,000 for airtime"
  ↓
System: "You are about to pay ₦5,000 for airtime. Please confirm."
  ↓
User: "Confirm"
  ↓
System: "Airtime payment of ₦5,000 completed."
```

---

## 🔍 Intent Confidence & Entity Extraction

The system uses GPT to intelligently extract information:

```json
{
  "intent": "send_money",
  "confidence": 0.95,
  "entities": {
    "amount": 10000,
    "recipient": "Chioma Okonkwo",
    "currency": "NGN",
    "account_type": "wallet",
    "transaction_type": "transfer"
  },
  "clarifications_needed": []
}
```

If some information is missing:
```json
{
  "intent": "send_money",
  "confidence": 0.85,
  "entities": {
    "amount": null,
    "recipient": "Chioma"
  },
  "clarifications_needed": [
    "How much do you want to send to Chioma?"
  ]
}
```

---

## ✨ Key Features

✅ **OpenAI Whisper** - Accurate speech recognition  
✅ **GPT Intent Detection** - Understands financial commands  
✅ **Risk Classification** - Automatically identifies high-risk operations  
✅ **Confirmation Flow** - Enforces PIN/OTP for sensitive actions  
✅ **Entity Extraction** - Parses amounts, recipients, currencies  
✅ **Natural Responses** - Generates human-friendly voice replies  
✅ **OpenAI TTS** - High-quality voice synthesis  
✅ **Fallback Support** - Google TTS backup if OpenAI fails  
✅ **Session Management** - Tracks ongoing voice conversations  
✅ **Audit Logging** - Records all voice interactions  
✅ **Multi-language** - Supports multiple languages  
✅ **Rate Limiting** - Protects against abuse  
✅ **Security** - No sensitive data in logs  

---

## 🚀 Ready for Production

Your AI voice banking system is now:
- ✅ Integrated with OpenAI services
- ✅ Configured with proper risk classification
- ✅ Protected with confirmation workflows
- ✅ Logged for compliance & auditing
- ✅ Tested and error-handled
- ✅ Documented with examples

**All financial operations are controlled by YOUR backend** - the AI only understands and confirms user intent!

---

## 📞 Support

For testing the voice features:

1. Use Postman or your frontend to call `/api/voice/support/session/start`
2. Record an audio file with your voice command
3. Upload to `/api/voice/support/transcribe` endpoint
4. Review the intent and risk classification
5. Execute and confirm the transaction

See the voice service files for detailed implementation examples.
