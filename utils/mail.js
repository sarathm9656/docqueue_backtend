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
    // Check if Resend API Key is configured (to bypass Render SMTP block)
    if (process.env.RESEND_API_KEY) {
      console.log("Using Resend HTTP API for sending email...");
      const fromAddress = process.env.MAIL_FROM_ADDRESS && process.env.MAIL_FROM_ADDRESS.includes('@clinic.com')
        ? 'onboarding@resend.dev' // Resend Free tier requires onboarding@resend.dev for unverified domains
        : process.env.MAIL_FROM_ADDRESS || 'onboarding@resend.dev';

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`
        },
        body: JSON.stringify({
          from: `"${process.env.MAIL_FROM_NAME || 'Clinic Queue System'}" <${fromAddress}>`,
          to,
          subject,
          text: text || '',
          html: html || '',
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Resend API returned an error.');
      }
      console.log(`Email sent successfully via Resend API: ${data.id}`);
      return { messageId: data.id };
    }

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
