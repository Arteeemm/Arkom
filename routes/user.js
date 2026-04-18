const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const { logger, sanitizeString } = require('../security');

// ============ GET PROFILE ============
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-otp -otpExpiry -lockUntil -loginAttempts');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    res.json({ 
      success: true, 
      data: user 
    });
  } catch (error) {
    logger.error('Ошибка получения профиля', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// ============ UPDATE PROFILE ============
router.put('/profile/update', authMiddleware, async (req, res) => {
  try {
    const { displayName, bio } = req.body;

    const updates = {};
    
    if (displayName) {
      updates.displayName = sanitizeString(displayName).substring(0, 50);
    }
    
    if (bio) {
      updates.bio = sanitizeString(bio).substring(0, 150);
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    ).select('-otp -otpExpiry -lockUntil -loginAttempts');

    logger.info('Профиль обновлён', { userId: req.user.id });

    res.json({ 
      success: true, 
      data: user 
    });
  } catch (error) {
    logger.error('Ошибка обновления профиля', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// ============ GET USER BY ID ============
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
      .select('username displayName avatar bio email');

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    res.json({ 
      success: true, 
      data: user 
    });
  } catch (error) {
    logger.error('Ошибка получения пользователя', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

module.exports = router;
