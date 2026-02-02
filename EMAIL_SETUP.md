# Email Configuration for Wavva Pay

## Overview
Wavva Pay uses Gmail SMTP for sending verification codes. The connection timeout error typically occurs due to:
1. Incorrect credentials (must use App Password, not regular password)
2. Network/firewall blocking SMTP port 587
3. Gmail security restrictions

## Setup Instructions

### Step 1: Create a Gmail App Password

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Click **Security** in the left sidebar
3. Enable **2-Step Verification** if not already enabled
4. Scroll down and select **App passwords**
5. Choose **Mail** and **Windows Computer** (or your platform)
6. Google will generate a 16-character password
7. Copy this password (it won't be shown again)

### Step 2: Configure Environment Variables

Create a `.env` file in the `backend/` directory with:

```env
# Gmail SMTP Configuration
EMAIL_USER=your-email@gmail.com
# Do NOT commit real secrets to source control; set this locally or via a secret manager.
# For local development, copy .env.example to .env and replace the placeholder below:
EMAIL_PASSWORD=REPLACE_WITH_YOUR_16_CHAR_APP_PASSWORD
```

**Important:**
- `EMAIL_USER` must be your full Gmail address
- `EMAIL_PASSWORD` must be the 16-character App Password (not your regular password)
- Remove any spaces from the App Password

### Step 3: Verify Configuration

Check that the email service starts correctly:
- Look for: `✅ Email service configured`
- If you see: `⚠️ Email service not configured`, check your `.env` file

### Step 4: Test Email Sending

During development:
- Sign up for an account
- The verification code will be printed to server logs
- Check server console for: `Code: 123456 for your-email@gmail.com`
- If email fails, you'll see detailed error logs with:
  - Error code
  - Hostname and port
  - Errno information

## Troubleshooting

### "Connection timeout"
- **Cause**: Firewall/network blocking port 587
- **Solution**: 
  1. Check if your network allows SMTP port 587
  2. Contact your network administrator
  3. Try using a different network (mobile hotspot)

### "Invalid credentials"
- **Cause**: Wrong password or not an App Password
- **Solution**:
  1. Verify you're using the 16-character App Password (not your Gmail password)
  2. Re-generate the App Password in Google Account Settings
  3. Make sure 2-Step Verification is enabled

### "Email configured but still not working"
- **Cause**: Gmail account restrictions
- **Solution**:
  1. Allow "Less secure app access" (older Gmail accounts)
  2. Or use an App Password (recommended)
  3. Check Gmail recently signed in devices

### "ECONNREFUSED"
- **Cause**: Cannot reach Gmail servers
- **Solution**: Check internet connection and firewall settings

## Development vs Production

### Development Mode
- If email sending fails, the verification code is still saved
- You can see the code in server logs
- This allows testing without email configured

### Production Mode
- Email sending must succeed or endpoint returns error
- No fallback - verification codes aren't saved if email fails
- Monitor server logs for any email errors

## Environment Variables Reference

| Variable | Example | Required |
|----------|---------|----------|
| EMAIL_USER | `wavva-pay@gmail.com` | Yes |
| EMAIL_PASSWORD | `abcd efgh ijkl mnop` | Yes (16-char App Password) |
| NODE_ENV | `production` | No (defaults to development) |

## Testing the Setup

After configuration, test by:

1. Starting the backend server: `npm start`
2. Look for startup logs indicating email service status
3. Make a signup request to trigger verification email
4. Check server logs for send status
5. Verify email arrives in inbox (may take 1-2 minutes)

## Additional Resources

- [Google App Passwords Help](https://support.google.com/accounts/answer/185833)
- [Gmail SMTP Settings](https://support.google.com/mail/answer/7126229)
- [Nodemailer Gmail Configuration](https://nodemailer.com/smtp/gmail/)
