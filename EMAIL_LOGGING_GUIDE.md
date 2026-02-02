# Email Verification Logging Guide

## What Gets Logged

Now you have **detailed logging** at every step of the email verification process. Here's what to look for:

### On Server Startup
```
✅ Email service configured - using Gmail SMTP
   From: <EMAIL_ADDRESS>
```

OR

```
⚠️ Email service NOT configured
   EMAIL_USER: ✗ missing (set via environment variable EMAIL_USER or in .env)
   EMAIL_PASSWORD: ✗ missing (set via environment variable EMAIL_PASSWORD or in .env)
```

---

## 1. Generating Verification Code

When generating a code, you'll see:

### ✅ Successful Generation
```
📧 [VERIFY_CODE] Generating verification code for user@example.com
📧 [VERIFY_CODE] Code: 123456
📧 [VERIFY_CODE] Expires in: 15 minutes
✅ [VERIFY_CODE] Code saved to database for user@example.com
```

### 🔌 Attempting to Send Email
```
📧 [VERIFY_CODE] Attempting to send email to user@example.com...
📧 [VERIFY_CODE] From: <SENDER_EMAIL>
📧 [VERIFY_CODE] To: user@example.com
```

### ✅ Email Sent Successfully
```
✅ [VERIFY_CODE] Email sent successfully!
📧 [VERIFY_CODE] Response: 250 2.0.0 OK
📧 [VERIFY_CODE] Message ID: <abc123@example.com>
```

### ⚠️ Email Not Configured (Dev Mode)
```
⚠️ [VERIFY_CODE] Email transporter not initialized
📧 [VERIFY_CODE] Development mode: Code available in logs
📧 [VERIFY_CODE] user@example.com - Code: 123456
```

### ❌ Email Send Failed
```
❌ [VERIFY_CODE] ERROR - Failed to send verification code
❌ [VERIFY_CODE] User email: user@example.com
❌ [VERIFY_CODE] Error message: connect ETIMEDOUT
❌ [VERIFY_CODE] Error code: ETIMEDOUT
❌ [VERIFY_CODE] Error errno: ETIMEDOUT
❌ [VERIFY_CODE] Error syscall: connect
❌ [VERIFY_CODE] Error hostname: smtp.gmail.com
❌ [VERIFY_CODE] Error port: 587
❌ [VERIFY_CODE] SMTP Response: (if available)
⚠️ [VERIFY_CODE] Code was saved to database despite email failure
⚠️ [VERIFY_CODE] User can still verify with code: 123456
```

---

## 2. Resending Code (Frontend Resend Button)

When user clicks "Resend Code":

### ✅ Successful Resend Request
```
🔐 [RESEND_CODE] Request received
🔐 [RESEND_CODE] User ID: 65abc123def456
🔐 [RESEND_CODE] User found: user@example.com
🔐 [RESEND_CODE] Starting code generation and send process...
📧 [VERIFY_CODE] Generating verification code for user@example.com
📧 [VERIFY_CODE] Code: 654321
📧 [VERIFY_CODE] Expires in: 15 minutes
✅ [VERIFY_CODE] Code saved to database for user@example.com
✅ [VERIFY_CODE] Email sent successfully!
✅ [RESEND_CODE] Success - Code sent for user@example.com
```

### ⚠️ Email Already Verified
```
🔐 [RESEND_CODE] Request received
🔐 [RESEND_CODE] User ID: 65abc123def456
🔐 [RESEND_CODE] User found: user@example.com
⚠️ [RESEND_CODE] Email already verified: user@example.com
```

### ❌ User Not Found
```
🔐 [RESEND_CODE] Request received
🔐 [RESEND_CODE] User ID: invalid123
⚠️ [RESEND_CODE] User not found: invalid123
```

---

## 3. Verifying Code (User Submits Code)

When user enters 6-digit code and clicks verify:

### ✅ Successful Verification
```
✅ [VERIFY_CODE] Verification attempt received
✅ [VERIFY_CODE] User ID: 65abc123def456
✅ [VERIFY_CODE] Code submitted: 654321
✅ [VERIFY_CODE] User found: user@example.com
✅ [VERIFY_CODE] Stored code: 654321
✅ [VERIFY_CODE] Code expires at: 2026-01-14T15:30:00.000Z
✅ [VERIFY_CODE] Code matches! Marking email as verified...
✅ [VERIFY_CODE] SUCCESS - Email verified for user@example.com
```

### ❌ Code Mismatch
```
✅ [VERIFY_CODE] Verification attempt received
✅ [VERIFY_CODE] User ID: 65abc123def456
✅ [VERIFY_CODE] Code submitted: 999999
✅ [VERIFY_CODE] User found: user@example.com
✅ [VERIFY_CODE] Stored code: 654321
⚠️ [VERIFY_CODE] Code mismatch!
⚠️ [VERIFY_CODE] Expected: 654321, Got: 999999
```

### ⚠️ Code Expired
```
✅ [VERIFY_CODE] Verification attempt received
✅ [VERIFY_CODE] User ID: 65abc123def456
✅ [VERIFY_CODE] Code submitted: 654321
✅ [VERIFY_CODE] User found: user@example.com
✅ [VERIFY_CODE] Stored code: 654321
✅ [VERIFY_CODE] Code expires at: 2026-01-14T15:15:00.000Z
⚠️ [VERIFY_CODE] Code expired at 2026-01-14T15:15:00.000Z
```

---

## Troubleshooting with Logs

### Problem: "Email service NOT configured"
**Look for:**
```
⚠️ Email service NOT configured
   EMAIL_USER: ✗ missing
   EMAIL_PASSWORD: ✗ missing
```

**Solution:** Add credentials to `.env` and restart server

---

### Problem: "connect ETIMEDOUT"
**Look for:**
```
❌ [VERIFY_CODE] Error syscall: connect
❌ [VERIFY_CODE] Error hostname: smtp.gmail.com
❌ [VERIFY_CODE] Error port: 587
```

**Possible causes:**
- Firewall blocking port 587
- Gmail account restrictions
- Network issue

---

### Problem: "invalid login"
**Look for:**
```
❌ [VERIFY_CODE] Error message: invalid login
```

**Solution:** 
- Verify app password is correct
- Check 2-Step Verification is enabled
- Generate new app password

---

### Problem: Code doesn't match
**Look for:**
```
⚠️ [VERIFY_CODE] Expected: 654321, Got: 999999
```

**Possible causes:**
- User entered wrong code
- User copied code from log instead of email
- Code was regenerated

---

## Development Mode

In development, if email fails:
```
⚠️ [VERIFY_CODE] Code was saved to database despite email failure
⚠️ [VERIFY_CODE] User can still verify with code: 123456
```

You can manually use this code to test the verification flow without email working!

---

## Log Format

All logs use consistent prefixes for easy filtering:

| Prefix | Meaning |
|--------|---------|
| `📧 [VERIFY_CODE]` | Verification code generation/sending |
| `✅ [VERIFY_CODE]` | Successful verification steps |
| `⚠️ [VERIFY_CODE]` | Warnings/issues |
| `❌ [VERIFY_CODE]` | Errors |
| `🔐 [RESEND_CODE]` | Resend request handling |
| `📧 [EMAIL_VERIFY]` | Email verification (signup) |

You can filter logs by searching for these prefixes!

---

## Real-World Example Flow

### Successful signup + verification:

**1. User signs up:**
```
✅ [EMAIL_VERIFY] Generating email verification for newuser@example.com
✅ [EMAIL_VERIFY] User ID: abc123
✅ [EMAIL_VERIFY] Token: abc123def4...
📧 [EMAIL_VERIFY] Attempting to send email...
✅ [EMAIL_VERIFY] Email sent successfully!
```

**2. Code generation automatically happens:**
```
📧 [VERIFY_CODE] Generating verification code for newuser@example.com
📧 [VERIFY_CODE] Code: 456789
✅ [VERIFY_CODE] Code saved to database
✅ [VERIFY_CODE] Email sent successfully!
```

**3. User clicks resend after 30 seconds:**
```
🔐 [RESEND_CODE] Request received
🔐 [RESEND_CODE] User ID: abc123
🔐 [RESEND_CODE] User found: newuser@example.com
📧 [VERIFY_CODE] Generating verification code for newuser@example.com
📧 [VERIFY_CODE] Code: 789012
✅ [VERIFY_CODE] Email sent successfully!
✅ [RESEND_CODE] Success - Code sent
```

**4. User verifies with new code:**
```
✅ [VERIFY_CODE] Verification attempt received
✅ [VERIFY_CODE] User ID: abc123
✅ [VERIFY_CODE] Code submitted: 789012
✅ [VERIFY_CODE] Code matches!
✅ [VERIFY_CODE] SUCCESS - Email verified for newuser@example.com
```

Perfect! No errors means everything worked.
