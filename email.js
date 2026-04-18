const nodemailer = require('nodemailer');
const { logger } = require('./security');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Генерирует 6-значный код
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Отправляет OTP
const sendOTP = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_FROM,
      to: email,
      subject: '🔐 Код верификации Мессенджера',
      html: `
        <div style="max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif;">
          <h2>🔐 Код верификации</h2>
          <p>Здравствуйте!</p>
          <p>Ваш код верификации:</p>
          <div style="background: #f0f0f0; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0;">
            <h1 style="letter-spacing: 5px; color: #007bff;">${otp}</h1>
          </div>
          <p>Код действует 10 минут.</p>
          <p style="color: #999; font-size: 12px;">Не делитесь этим кодом ни с кем.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    logger.info('OTP отправлен', { email });
    return true;
  } catch (error) {
    logger.error('Ошибка отправки OTP', { email, error: error.message });
    return false;
  }
};

module.exports = { generateOTP, sendOTP };
