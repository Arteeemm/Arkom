const express = require('express');
const router = express.Router();
const User = require('../models/User');
const jwt = require('jwt-simple');
const { generateOTP, sendOTP } = require('../email');
const { validateEmail, sanitizeString, logger } = require('../security');
const nacl = require('tweetnacl');
const { encodeBase64 } = require('tweetnacl-util');

// ============ SEND OTP ============
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!validateEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Неверный email' 
      });
    }

    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

    // Ищем или создаем пользователя
    let user = await User.findOne({ email });
    
    if (!user) {
      // Генерируем пару ключей для E2E шифрования
      const keypair = nacl.box.keyPair();
      
      user = new User({
        email,
        username: email.split('@')[0] + Math.random().toString(36).substring(7),
        otp,
        otpExpiry,
        publicKey: encodeBase64(keypair.publicKey)
      });
    } else {
      user.otp = otp;
      user.otpExpiry = otpExpiry;
    }

    await user.save();

    // Отправляем OTP на email
    const sent = await sendOTP(email, otp);
    
    if (!sent) {
      return res.status(500).json({ 
        success: false, 
        message: 'Ошибка отправки письма' 
      });
    }

    logger.info('OTP отправлен', { email });

    res.json({ 
      success: true, 
      message: 'Код отправлен на email' 
    });
  } catch (error) {
    logger.error('Ошибка отправки OTP', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// ============ VERIFY OTP ============
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!validateEmail(email) || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email и OTP обязательны' 
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    // Проверяем блокировку
    if (user.isLocked) {
      return res.status(429).json({ 
        success: false, 
        message: 'Аккаунт заблокирован. Попробуйте позже' 
      });
    }

    // Проверяем OTP
    if (user.otp !== otp || new Date() > user.otpExpiry) {
      await user.incLoginAttempts();
      return res.status(401).json({ 
        success: false, 
        message: 'Неверный или истекший код' 
      });
    }

    // Успешная верификация
    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.resetLoginAttempts();

    // Генерируем JWT токены
    const payload = {
      id: user._id,
      email: user.email,
      username: user.username,
      iat: Math.floor(Date.now() / 1000)
    };

    const token = jwt.encode(payload, process.env.JWT_SECRET);
    const refreshToken = jwt.encode(payload, process.env.JWT_REFRESH_SECRET);

    logger.info('Пользователь успешно верифицирован', { email });

    res.json({ 
      success: true, 
      message: 'Успешная аутентификация',
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
        avatar: user.avatar,
        publicKey: user.publicKey
      }
    });
  } catch (error) {
    logger.error('Ошибка верификации OTP', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// ============ REFRESH TOKEN ============
router.post('/refresh-token', (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        message: 'Refresh токен не найден' 
      });
    }

    const decoded = jwt.decode(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    const payload = {
      id: decoded.id,
      email: decoded.email,
      username: decoded.username,
      iat: Math.floor(Date.now() / 1000)
    };

    const newToken = jwt.encode(payload, process.env.JWT_SECRET);

    logger.info('Токен обновлён', { email: decoded.email });

    res.json({ 
      success: true, 
      token: newToken 
    });
  } catch (error) {
    logger.warn('Ошибка refresh токена', { error: error.message });
    res.status(401).json({ 
      success: false, 
      message: 'Неверный refresh токен' 
    });
  }
});

module.exports = router;
