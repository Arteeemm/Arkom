const jwt = require('jwt-simple');
const { logger } = require('../security');

const verifyToken = (token) => {
  try {
    const decoded = jwt.decode(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    logger.warn('Ошибка проверки токена', { error: error.message });
    throw new Error('Неверный токен');
  }
};

const authMiddleware = (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Токен не найден' 
      });
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    logger.warn('Ошибка аутентификации', { error: error.message });
    res.status(401).json({ 
      success: false, 
      message: 'Неверный токен' 
    });
  }
};

module.exports = verifyToken;
module.exports.authMiddleware = authMiddleware;
