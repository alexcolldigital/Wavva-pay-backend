# Email Verification Code Not Sending - Debugging Guide

## Current Error: "Error port: undefined" 

If you're seeing errors like:
```
❌ [VERIFY_CODE] Error port: undefined
❌ [VERIFY_CODE] Error hostname: undefined
❌ [VERIFY_CODE] Error syscall: undefined
❌ [VERIFY_CODE] Error errno: undefined
⚠️ [VERIFY_CODE] Code was saved to database despite email failure
```

This means the SMTP connection itself is failing. **The good news:** Your verification code is still saved in the database and users can still verify their email.

### Common Causes & Quick Fixes

1. **Gmail Password Issue (Most Common)**
   - You're using your regular Gmail password instead of App Password
   - **Fix:** Go to https://myaccount.google.com/apppasswords and generate a new 16-character App Password
   - Update `.env`: `EMAIL_PASSWORD=your-16-char-app-password`
   - Restart the server

2. **2-Step Verification Not Enabled**
   - Gmail requires 2-Step Verification before App Passwords
   - **Fix:** Go to https://myaccount.google.com/security and enable 2-Step Verification
   - Then generate App Password

3. **Wrong Email Format**
   - Check `.env` for typos in EMAIL_USER
   - Make sure it's a valid Gmail address

4. **Network/Firewall Blocking**
   - Some networks block SMTP ports
   - **Test:** Try from a different network (mobile hotspot)
   - **Fix:** If corporate network, contact IT department

---

## Quick Checklist

### 1. Verify Environment Variables Are Set
Check your `.env` file in the backend folder:
```
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-16-char-app-password
```

**Important:** 
- Make sure there are NO spaces around the `=` sign
- The app password should be 16 characters (no spaces)
- Restart the backend server after changing `.env`

### 2. Check Server Startup Logs
When you start the backend, look for:

✅ **Good - Email Configured:**
```
✅ Email service configured - using Gmail SMTP
   From: your-email@gmail.com
```

❌ **Bad - Email Not Configured:**
```
⚠️ Email service NOT configured
   EMAIL_USER: ✗ missing
   EMAIL_PASSWORD: ✗ missing
```

### 3. During Signup/Code Request
Watch the server logs for:

✅ **Good - Code Sent:**
```
📧 Attempting to send verification code to user@example.com...
✅ Verification code sent to user@example.com
```

⚠️ **Warning - Email Failed but Code Saved:**
```
❌ Email send error: connect ETIMEDOUT
⚠️ Email failed but code was saved: 123456 for user@example.com
```

❌ **Bad - Email Not Configured:**
```
📧 Email not configured. Verification code for development:
Code: 123456 for user@example.com
```

## Common Issues & Fixes

### Issue 1: "Email service NOT configured"
**Cause:** Environment variables not set or server not restarted

**Fix:**
1. Add to `.env`:
   ```
   EMAIL_USER=your-gmail@gmail.com
   EMAIL_PASSWORD=your-app-password
   ```
2. Restart the backend server
3. Check logs for "✅ Email service configured"

### Issue 2: "connect ETIMEDOUT" or "Connection timeout"
**Cause:** Network/firewall blocking port 587, or Gmail account issue

**Fix:**
1. Verify Gmail credentials are correct:
   - Go to https://myaccount.google.com/
   - Check 2-Step Verification is ON
   - Generate a new App Password
   - Update `.env` with new password
   - Restart server

2. Check network/firewall:
   - Ask your network admin about port 587
   - Try from different network (mobile hotspot)

3. Check Gmail security:
   - Allow less secure apps if on older account
   - Or generate new App Password

### Issue 3: "invalid login" error
**Cause:** Wrong password or credentials format

**Fix:**
1. Go to [Google Account Settings](https://myaccount.google.com/security)
2. Make sure 2-Step Verification is enabled
3. Generate new App Password:
   - Select "Mail" app
   - Select "Windows Computer" (or your device)
   - Copy the 16-character password (remove spaces if any)
4. Update `.env`:
   ```
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-16-char-password
   ```
5. Restart server and try again

### Issue 4: Email arrives but takes forever
**Cause:** Gmail rate limiting or network delay

**Fix:**
- This is normal (can take 1-5 minutes)
- Check spam folder if not in inbox
- Try from different email address
- Wait a bit before retrying

## Testing Email Manually

### Option 1: Check Server Logs
1. Start backend: `npm start`
2. In another terminal, trigger verification code:
   ```bash
   curl -X POST http://localhost:3000/api/auth/send-email-verification-code \
     -H "Content-Type: application/json" \
     -d '{"userId":"YOUR_USER_ID"}'
   ```
3. Check server logs for success/error message

### Option 2: Use Development Mode
If email is not working in production, you can:
1. Check the verification code in server logs
2. The code will be displayed as: `Code: 123456 for user@example.com`
3. Use that code in the frontend to test

## Environment Variables Reference

| Variable | Example | Required |
|----------|---------|----------|
| EMAIL_USER | `wavva-pay@gmail.com` | Yes |
| EMAIL_PASSWORD | `abcd efgh ijkl mnop` | Yes (16-char App Password) |
| NODE_ENV | `production` | No |

## Still Not Working?

If you've gone through all steps and email still won't send:

1. **Check Gmail account:**
   - 2-Step Verification: ON
   - App Password: Generated for Mail app
   - Recent security events: No suspicious activity

2. **Check .env file:**
   - No extra spaces
   - Correct password (copy directly from Google)
   - File is in backend folder

3. **Restart everything:**
   - Stop backend server
   - Update .env
   - Run `npm start`
   - Try signup again

4. **Check logs carefully:**
   - Copy the exact error message
   - Search for the error code online
   - It will tell you the exact issue

## Gmail Security Warnings

If you see in logs:
```
Application-specific password required
```

**Solution:** You MUST use App Password, not your Gmail password. Get it here:
https://myaccount.google.com/apppasswords

If you don't see that option:
1. Go to https://myaccount.google.com/
2. Click Security
3. Enable 2-Step Verification if not already enabled
4. Then App passwords option will appear

## Production Deployment on Render

1. Set environment variables in Render:
   - Go to your service settings
   - Add environment variables:
     - `EMAIL_USER`: your Gmail
     - `EMAIL_PASSWORD`: your 16-char app password

2. Check logs in Render dashboard for startup messages

3. Try signup to trigger email

4. Monitor logs for success/error messages
