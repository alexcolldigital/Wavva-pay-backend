# Email Configuration Quick Reference

## Current Status
- ✅ Code is ALWAYS saved to database
- ✅ Users can verify with code from backend logs if email fails
- ⚠️ Email sending is failing - needs configuration

## The Problem in 30 Seconds

Your email is not sending because of one of these:

1. **Using Gmail password instead of App Password** (Most likely)
2. 2-Step Verification not enabled
3. Network/firewall blocking port 465
4. Wrong email in `.env`

## The Fix in 5 Minutes

### Step 1: Enable 2-Step Verification (if not done)
1. Go to https://myaccount.google.com/security
2. Click "2-Step Verification"
3. Follow the steps

### Step 2: Generate App Password
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" app
3. Select "Windows Computer"
4. Copy the 16-character password (ignore spaces)

### Step 3: Update `.env`
```
EMAIL_USER=egbujilotachi@gmail.com
EMAIL_PASSWORD=<paste-your-16-char-password>
```

### Step 4: Restart Backend
```bash
# Stop current server
Ctrl+C

# Start server
npm start
```

### Step 5: Check Logs
Look for:
```
✅ Email service configured - using Gmail SMTP
✅ Email service verified - SMTP connection successful
```

## Expected Behavior After Fix

### When Code is Requested
```
📧 [VERIFY_CODE] Generating verification code...
✅ [VERIFY_CODE] Code saved to database
📧 [VERIFY_CODE] Attempting to send email...
✅ [VERIFY_CODE] Email sent successfully!
```

### If Email Still Fails
```
⚠️ [VERIFY_CODE] Code was saved to database despite email failure
⚠️ [VERIFY_CODE] User can still verify with code: 123456
```

## Error Messages & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Error port: undefined` | SMTP connection failing | Use App Password, not Gmail password |
| `Error hostname: undefined` | SMTP server unreachable | Check network/firewall for port 465 |
| `invalid login` | Wrong credentials | Verify email and password are correct |
| `connect ETIMEDOUT` | Network blocking port | Try different network or contact IT |
| `Email service NOT configured` | Missing `.env` vars | Add EMAIL_USER and EMAIL_PASSWORD |

## Testing Without Email (Development)

If you need to test the full signup flow without sending emails:

1. When user signs up, code is still saved
2. Check server logs for the code
3. Use that code in the frontend verification step

Example from logs:
```
📧 [VERIFY_CODE] ${user.email} - Code: 123456
```

## Files That Handle Email

- **Sending code**: `backend/src/services/notifications.js` → `sendEmailVerificationCode()`
- **Routes**: `backend/src/routes/auth.js` → `/send-email-verification-code`
- **Config**: `backend/.env` → `EMAIL_USER` and `EMAIL_PASSWORD`

## Support References

- **Gmail App Passwords**: https://myaccount.google.com/apppasswords
- **Gmail Security**: https://myaccount.google.com/security
- **Setup Guide**: `backend/EMAIL_SETUP.md`
- **Full Troubleshooting**: `backend/EMAIL_TROUBLESHOOTING.md`
