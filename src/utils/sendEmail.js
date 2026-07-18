const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html, text }) => {
  // If SMTP configs are not present, fallback to log to console
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (!smtpHost || !smtpUser || !smtpPass) {
    console.log('\n==================================================');
    console.log(`✉️  EMAIL MOCK TO: ${to}`);
    console.log(`✉️  SUBJECT: ${subject}`);
    console.log('--------------------------------------------------');
    console.log(text || html);
    console.log('==================================================\n');
    return { mock: true, message: 'Email logged to server console.' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort == 465, // true for 465, false for other ports
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });

    const info = await transporter.sendMail({
      from: `"Student Voice Portal" <${smtpUser}>`,
      to,
      subject,
      text,
      html,
    });

    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Failed to send email via SMTP:', error);
    // Log to console as fallback anyway so the developer is not blocked
    console.log('\n==================================================');
    console.log(`✉️  EMAIL FALLBACK TO: ${to}`);
    console.log(`✉️  SUBJECT: ${subject}`);
    console.log('--------------------------------------------------');
    console.log(text || html);
    console.log('==================================================\n');
    return { mock: true, error: error.message };
  }
};

module.exports = sendEmail;
