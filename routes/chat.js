const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const { logger, sanitizeString } = require('../security');

// ============ GET ALL CHATS ============
router.get('/', authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ users: req.user.id })
      .populate('users', 'username displayName avatar email')
      .populate('lastMessage')
      .sort({ updatedAt: -1 });

    res.json({ 
      success: true, 
      data: chats 
    });
  } catch (error) {
    logger.error('Ошибка получения чатов', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// ============ GET MESSAGES FROM CHAT ============
router.get('/messages/:chatId', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    // Проверяем что пользователь в чате
    const chat = await Chat.findById(chatId);
    if (!chat || !chat.users.includes(req.user.id)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Доступ запрещен' 
      });
    }

    const messages = await Message.find({ chat: chatId })
      .populate('sender', 'username displayName avatar email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({ 
      success: true, 
      data: messages.reverse() 
    });
  } catch (error) {
    logger.error('Ошибка получения сообщений', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// ============ START NEW CHAT ============
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { otherUserId } = req.body;

    if (!otherUserId) {
      return res.status(400).json({ 
        success: false, 
        message: 'otherUserId обязателен' 
      });
    }

    // Проверяем что пользователь существует
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    // Проверяем что чат не существует
    let chat = await Chat.findOne({
      users: { $all: [req.user.id, otherUserId] }
    });

    if (chat) {
      return res.json({ 
        success: true, 
        data: chat 
      });
    }

    // Создаем новый чат
    chat = new Chat({
      users: [req.user.id, otherUserId]
    });

    await chat.save();
    await chat.populate('users', 'username displayName avatar email');

    logger.info('Новый чат создан', { 
      user1: req.user.id,
      user2: otherUserId,
      chatId: chat._id
    });

    res.json({ 
      success: true, 
      data: chat 
    });
  } catch (error) {
    logger.error('Ошибка создания чата', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

// ============ SEARCH USERS ============
router.get('/users/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({ 
        success: false, 
        message: 'Поисковая строка должна быть минимум 2 символа' 
      });
    }

    const users = await User.find({
      _id: { $ne: req.user.id },
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { displayName: { $regex: q, $options: 'i' } }
      ]
    })
    .select('username email displayName avatar')
    .limit(10)
    .lean();

    res.json({ 
      success: true, 
      data: users 
    });
  } catch (error) {
    logger.error('Ошибка поиска пользователей', { error: error.message });
    res.status(500).json({ 
      success: false, 
      message: 'Ошибка сервера' 
    });
  }
});

module.exports = router;
