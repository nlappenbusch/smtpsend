// SMTP Configuration Template
// Copy this file and customize for different SMTP providers

// ============================================
// CURRENT CONFIGURATION (Faltin Travel)
// ============================================
const FALTIN_CONFIG = {
    host: 'mail.pc4play.de',
    port: 587,
    secure: false,
    auth: {
        user: 'faltin@faltintravel.com',
        pass: 'myk3n0azSjJD6kt7'
    }
};

// ============================================
// ALTERNATIVE SMTP PROVIDERS
// ============================================

// Gmail
const GMAIL_CONFIG = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@gmail.com',
        pass: 'your-app-password' // Use App Password, not regular password!
    }
};

// Outlook/Hotmail
const OUTLOOK_CONFIG = {
    host: 'smtp-mail.outlook.com',
    port: 587,
    secure: false,
    auth: {
        user: 'your-email@outlook.com',
        pass: 'your-password'
    }
};

// SendGrid
const SENDGRID_CONFIG = {
    host: 'smtp.sendgrid.net',
    port: 587,
    secure: false,
    auth: {
        user: 'apikey',
        pass: 'your-sendgrid-api-key'
    }
};

// Mailgun
const MAILGUN_CONFIG = {
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    auth: {
        user: 'postmaster@your-domain.mailgun.org',
        pass: 'your-mailgun-password'
    }
};

// Amazon SES
const AWS_SES_CONFIG = {
    host: 'email-smtp.us-east-1.amazonaws.com', // Change region as needed
    port: 587,
    secure: false,
    auth: {
        user: 'your-aws-smtp-username',
        pass: 'your-aws-smtp-password'
    }
};

// Custom SMTP Server
const CUSTOM_CONFIG = {
    host: 'smtp.your-domain.com',
    port: 587, // or 465 for SSL, 25 for standard
    secure: false, // true for port 465, false for other ports
    auth: {
        user: 'your-username',
        pass: 'your-password'
    }
};

// ============================================
// USAGE INSTRUCTIONS
// ============================================
/*
To change SMTP provider:

1. Open script.js
2. Find the SMTP_CONFIG constant at the top
3. Replace it with one of the configurations above
4. Update the credentials with your actual values
5. Restart the server

Example:
const SMTP_CONFIG = GMAIL_CONFIG;

IMPORTANT NOTES:
- Gmail requires "App Passwords" (not your regular password)
  Enable at: https://myaccount.google.com/apppasswords
  
- Some providers have daily sending limits:
  * Gmail: ~500 emails/day
  * Brevo Free: 300 emails/day
  * SendGrid Free: 100 emails/day
  
- Always test with a small batch first!

- For production use, consider using environment variables
  instead of hardcoding credentials
*/

// ============================================
// RATE LIMITS BY PROVIDER
// ============================================
/*
Provider          | Free Tier Limit    | Recommended Delay
------------------|-------------------|------------------
Brevo (Sendinblue)| 300/day           | 2 seconds
Gmail             | 500/day           | 2-3 seconds
SendGrid          | 100/day           | 1-2 seconds
Mailgun           | 5,000/month       | 1 second
Amazon SES        | 200/day (sandbox) | 1 second
*/

module.exports = {
    BREVO_CONFIG,
    GMAIL_CONFIG,
    OUTLOOK_CONFIG,
    SENDGRID_CONFIG,
    MAILGUN_CONFIG,
    AWS_SES_CONFIG,
    CUSTOM_CONFIG
};
