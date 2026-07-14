import nodemailer from 'nodemailer';

// Create a transporter using environment variables
const getTransporter = () => {
  const host = process.env.MAIL_HOST;
  const port = parseInt(process.env.MAIL_PORT || '587', 10);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;
  const secure = process.env.MAIL_SECURE === 'true';

  // Check if we have dummy or empty configuration
  const isDummyConfig = !user || !pass || user.includes('your_email') || pass.includes('your_app_password');

  if (isDummyConfig) {
    // Return a dummy/mock transporter that logs to console
    return {
      sendMail: async (mailOptions) => {
        console.log('\n--- [MOCK MAIL SERVICE] Sending Email ---');
        console.log(`To:      ${mailOptions.to}`);
        console.log(`From:    ${mailOptions.from}`);
        console.log(`Subject: ${mailOptions.subject}`);
        console.log(`Text:    ${mailOptions.text}`);
        if (mailOptions.html) {
          console.log(`HTML Content is available (${mailOptions.html.length} chars)`);
        }
        console.log('-----------------------------------------\n');
        return { messageId: 'mock-id-' + Date.now() };
      }
    };
  }

  // Create real nodemailer SMTP transporter
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });
};

/**
 * Sends an email using the configured SMTP transporter
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text content
 * @param {string} [options.html] - HTML content
 * @returns {Promise<Object>} - Nodemailer send info object
 */
export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const transporter = getTransporter();
    
    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME || 'Clinic Queue System'}" <${process.env.MAIL_FROM_ADDRESS || 'no-reply@clinic.com'}>`,
      to,
      subject,
      text: text || '',
      html: html || '',
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`Email sent successfully: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error.message);
    throw error;
  }
};

export default sendEmail;
