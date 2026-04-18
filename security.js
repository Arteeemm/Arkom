const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');

// Helmet для защиты заголовков
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000, // 1 год
    includeSubDomains: true,
    preload: true
  }
});

// Rate limiting для логина
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // максимум 5 попыток
  message: 'Слишком много попыток логина, попробуйте позже',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Пропускаем на разработке
    return process.env.NODE_ENV === 'development';
  }
});

// Rate limiting для API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Слишком много запросов, попробуйте позже'
});

// Rate limiting для отправки email
const emailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 3, // максимум 3 письма в час
  message: 'Слишком много запросов на отправку кода, попробуйте позже'
});

// Валидация email
const validateEmail = (email) => {
  if (!email) return false;
  return validator.isEmail(email);
};

// Валидация пароля (если нужен)
const validatePassword = (password) => {
  if (!password || password.length < 8) return false;
  // Хотя бы одна заглавная, одна строчная, одна цифра, один спецсимвол
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
};

// Санитизация строк (защита от XSS)
const sanitizeString = (str) => {
  if (!str) return '';
  return validator.escape(str).trim();
};

// Логирование
const logger = {
  info: (msg, data = {}) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${msg}`, data);
  },
  warn: (msg, data = {}) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${msg}`, data);
  },
  error: (msg, data = {}) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`, data);
  }
};

module.exports = {
  helmetConfig,
  loginLimiter,
  apiLimiter,
  emailLimiter,
  validateEmail,
  validatePassword,
  sanitizeString,
  logger
};
