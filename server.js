const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Security
const {
  helmetConfig,
  loginLimiter,
  apiLimiter,
  emailLimiter,
  logger
} = require('./security');

// Socket.io
const ioModule = require('socket.io');

const app = express();

// ============ MIDDLEWARE ============

// Helmet для защиты
app.use(helmetConfig);

// CORS
app.use(cors({
  origin: ['http://localhost:3000', 'https://localhost:3000', 'http://localhost', 'https://localhost'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/send-otp', emailLimiter);
app.use('/api/auth/verify-otp', loginLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ============ MONGODB CONNECTION ============

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
})
.then(() => {
  logger.info('✅ MongoDB подключён успешно');
})
.catch(err => {
  logger.error('❌ Ошибка подключения MongoDB', { error: err.message });
  process.exit(1);
});

// ============ ROUTES ============

// Auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Chat routes
const chatRoutes = require('./routes/chat');
app.use('/api/chats', chatRoutes);

// User routes
const userRoutes = require('./routes/user');
app.use('/api/user', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// ============ 404 HANDLER ============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Маршрут не найден'
  });
});

// ============ HTTPS SERVER ============

let httpsServer;

try {
  const options = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
  };

  httpsServer = https.createServer(options, app);
  logger.info('✅ HTTPS сертификаты загружены');
} catch (error) {
  logger.error('❌ Ошибка загрузки сертификатов', { error: error.message });
  logger.info('Создайте сертификаты командой:');
  logger.info('openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365');
  process.exit(1);
}

// ============ SOCKET.IO ============

const io = ioModule(httpsServer, {
  cors: {
    origin: ['http://localhost:3000', 'https://localhost:3000'],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

// Middleware для Socket.io аутентификации
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      logger.warn('Socket.io: токен не найден');
      return next(new Error('Токен не найден'));
    }

    const jwt = require('jwt-simple');
    
    try {
      const decoded = jwt.decode(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.username = decoded.username;
      socket.email = decoded.email;
      next();
    } catch (err) {
      logger.warn('Socket.io: неверный токен', { error: err.message });
      next(new Error('Неверный токен'));
    }
  } catch (error) {
    logger.error('Socket.io: ошибка аутентификации', { error: error.message });
    next(error);
  }
});

// Socket.io обработчики
io.on('connection', (socket) => {
  logger.info('✅ Пользователь подключен', { 
    userId: socket.userId, 
    socketId: socket.id,
    email: socket.email
  });

  // Присоединяем пользователя к его комнате
  socket.join(`user_${socket.userId}`);

  // Присоединение к чатам пользователя
  socket.on('joinChats', async () => {
    try {
      const Chat = require('./models/Chat');
      const chats = await Chat.find({
        users: socket.userId
      });

      // Присоединяем к каждому чату
      chats.forEach(chat => {
        socket.join(`chat_${chat._id}`);
      });

      logger.info('Пользователь присоединился к чатам', { 
        userId: socket.userId,
        chatCount: chats.length
      });
    } catch (error) {
      logger.error('Ошибка joinChats', { error: error.message });
    }
  });

  // Присоединение к конкретному чату
  socket.on('joinChat', (chatId) => {
    try {
      socket.join(`chat_${chatId}`);
      logger.info('Пользователь присоединился к чату', { 
        userId: socket.userId,
        chatId
      });
    } catch (error) {
      logger.error('Ошибка joinChat', { error: error.message });
    }
  });

  // Отправка сообщения
  socket.on('sendMessage', async (data) => {
    try {
      const Message = require('./models/Message');
      const Chat = require('./models/Chat');

      // Валидация
      if (!data.chatId || !data.text) {
        logger.warn('Невалидные данные сообщения', { userId: socket.userId });
        socket.emit('error', 'Невалидные данные');
        return;
      }

      // Проверяем что пользователь в чате
      const chat = await Chat.findById(data.chatId);
      if (!chat || !chat.users.includes(socket.userId)) {
        logger.warn('Пользователь пытается отправить сообщение в чат, где он не участник', {
          userId: socket.userId,
          chatId: data.chatId
        });
        socket.emit('error', 'Доступ запрещен');
        return;
      }

      // Сохраняем сообщение
      const message = new Message({
        chat: data.chatId,
        sender: socket.userId,
        text: data.text,
        encryptedText: data.encryptedText || null,
        createdAt: new Date()
      });

      await message.save();
const express = require('express');
const mongoose = require('mongoose');
const https = require('https');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Security
const {
  helmetConfig,
  loginLimiter,
  apiLimiter,
  emailLimiter,
  logger
} = require('./security');

// Socket.io
const ioModule = require('socket.io');

const app = express();

// ============ MIDDLEWARE ============

// Helmet для защиты
app.use(helmetConfig);

// CORS
app.use(cors({
  origin: ['http://localhost:3000', 'https://localhost:3000', 'http://localhost', 'https://localhost'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/auth/send-otp', emailLimiter);
app.use('/api/auth/verify-otp', loginLimiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Логирование запросов
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// ============ MONGODB CONNECTION ============

mongoose.connect(process.env.MONGO_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
})
.then(() => {
  logger.info('✅ MongoDB подключён успешно');
})
.catch(err => {
  logger.error('❌ Ошибка подключения MongoDB', { error: err.message });
  process.exit(1);
});

// ============ ROUTES ============

// Auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// Chat routes
const chatRoutes = require('./routes/chat');
app.use('/api/chats', chatRoutes);

// User routes
const userRoutes = require('./routes/user');
app.use('/api/user', userRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// ============ 404 HANDLER ============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Маршрут не найден'
  });
});

// ============ HTTPS SERVER ============

let httpsServer;

try {
  const options = {
    key: fs.readFileSync(path.join(__dirname, 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'cert.pem'))
  };

  httpsServer = https.createServer(options, app);
  logger.info('✅ HTTPS сертификаты загружены');
} catch (error) {
  logger.error('❌ Ошибка загрузки сертификатов', { error: error.message });
  logger.info('Создайте сертификаты командой:');
  logger.info('openssl req -x509 -newkey rsa:4096 -nodes -out cert.pem -keyout key.pem -days 365');
  process.exit(1);
}

// ============ SOCKET.IO ============

const io = ioModule(httpsServer, {
  cors: {
    origin: ['http://localhost:3000', 'https://localhost:3000'],
    credentials: true
  },
  pingInterval: 25000,
  pingTimeout: 60000
});

// Middleware для Socket.io аутентификации
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      logger.warn('Socket.io: токен не найден');
      return next(new Error('Токен не найден'));
    }

    const jwt = require('jwt-simple');
    
    try {
      const decoded = jwt.decode(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.username = decoded.username;
      socket.email = decoded.email;
      next();
    } catch (err) {
      logger.warn('Socket.io: неверный токен', { error: err.message });
      next(new Error('Неверный токен'));
    }
  } catch (error) {
    logger.error('Socket.io: ошибка аутентификации', { error: error.message });
    next(error);
  }
});

// Socket.io обработчики
io.on('connection', (socket) => {
  logger.info('✅ Пользователь подключен', { 
    userId: socket.userId, 
    socketId: socket.id,
    email: socket.email
  });

  // Присоединяем пользователя к его комнате
  socket.join(`user_${socket.userId}`);

  // Присоединение к чатам пользователя
  socket.on('joinChats', async () => {
    try {
      const Chat = require('./models/Chat');
      const chats = await Chat.find({
        users: socket.userId
      });

      // Присоединяем к каждому чату
      chats.forEach(chat => {
        socket.join(`chat_${chat._id}`);
      });

      logger.info('Пользователь присоединился к чатам', { 
        userId: socket.userId,
        chatCount: chats.length
      });
    } catch (error) {
      logger.error('Ошибка joinChats', { error: error.message });
    }
  });

  // Присоединение к конкретному чату
  socket.on('joinChat', (chatId) => {
    try {
      socket.join(`chat_${chatId}`);
      logger.info('Пользователь присоединился к чату', { 
        userId: socket.userId,
        chatId
      });
    } catch (error) {
      logger.error('Ошибка joinChat', { error: error.message });
    }
  });

  // Отправка сообщения
  socket.on('sendMessage', async (data) => {
    try {
      const Message = require('./models/Message');
      const Chat = require('./models/Chat');

      // Валидация
      if (!data.chatId || !data.text) {
        logger.warn('Невалидные данные сообщения', { userId: socket.userId });
        socket.emit('error', 'Невалидные данные');
        return;
      }

      // Проверяем что пользователь в чате
      const chat = await Chat.findById(data.chatId);
      if (!chat || !chat.users.includes(socket.userId)) {
        logger.warn('Пользователь пытается отправить сообщение в чат, где он не участник', {
          userId: socket.userId,
          chatId: data.chatId
        });
        socket.emit('error', 'Доступ запрещен');
        return;
      }

      // Сохраняем сообщение
      const message = new Message({
        chat: data.chatId,
        sender: socket.userId,
        text: data.text,
        encryptedText: data.encryptedText || null,
        createdAt: new Date()
      });

      await message.save();

      // Обновляем lastMessage в чате
      await Chat.findByIdAndUpdate(data.chatId, {
        lastMessage: message._id,
        updatedAt: new Date()
      });

      // Получаем полные данные отправителя
      const User = require('./models/User');
      const sender = await User.findById(socket.userId).select('_id username displayName avatar email');

      // Отправляем всем в чате
      io.to(`chat_${data.chatId}`).emit('newMessage', {
        _id: message._id,
        chat: data.chatId,
        sender: {
          _id: sender._id,
          username: sender.username,
          displayName: sender.displayName || sender.username,
          avatar: sender.avatar
        },
        text: data.text,
        encryptedText: data.encryptedText || null,
        createdAt: message.createdAt
      });

      logger.info('Сообщение отправлено', { 
        userId: socket.userId, 
        chatId: data.chatId,
        messageId: message._id
      });
    } catch (error) {
      logger.error('Ошибка отправки сообщения', { 
        error: error.message,
        userId: socket.userId
      });
      socket.emit('error', 'Ошибка отправки сообщения');
    }
  });

  // Пользователь печатает
  socket.on('typing', (data) => {
    try {
      if (!data.chatId) return;

      io.to(`chat_${data.chatId}`).emit('userTyping', {
        userId: socket.userId,
        username: socket.username,
        isTyping: true
      });
    } catch (error) {
      logger.error('Ошибка typing', { error: error.message });
    }
  });

  // Пользователь перестал печатать
  socket.on('stopTyping', (data) => {
    try {
      if (!data.chatId) return;

      io.to(`chat_${data.chatId}`).emit('userTyping', {
        userId: socket.userId,
        username: socket.username,
        isTyping: false
      });
    } catch (error) {
      logger.error('Ошибка stopTyping', { error: error.message });
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    logger.info('❌ Пользователь отключен', { 
      userId: socket.userId,
      socketId: socket.id
    });
  });

  // Обработка ошибок
  socket.on('error', (error) => {
    logger.error('Socket.io ошибка', { 
      userId: socket.userId,
      error: error.message 
    });
  });
});

// ============ ERROR HANDLING ============

app.use((err, req, res, next) => {
  logger.error('Необработанная ошибка', { 
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Внутренняя ошибка сервера',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// ============ GRACEFUL SHUTDOWN ============

process.on('SIGTERM', () => {
  logger.info('SIGTERM получен, закрываем сервер...');
  httpsServer.close(() => {
    logger.info('HTTPS сервер закрыт');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB соединение закрыто');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT получен, закрываем сервер...');
  httpsServer.close(() => {
    logger.info('HTTPS сервер закрыт');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB соединение закрыто');
      process.exit(0);
    });
  });
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

httpsServer.listen(PORT, HOST, () => {
  logger.info(`🚀 HTTPS сервер запущен на https://${HOST}:${PORT}`);
  logger.info('⚠️  Используется самоподписанный сертификат');
  logger.info('📚 API документация доступна на https://localhost:3000/health');
  logger.info('');
  logger.info('🔐 Безопасность включена:');
  logger.info('  ✅ HTTPS/TLS шифрование');
  logger.info('  ✅ Rate limiting');
  logger.info('  ✅ CORS защита');
  logger.info('  ✅ Helmet.js заголовки');
  logger.info('  ✅ JWT аутентификация');
  logger.info('  ✅ Socket.io аутентификация');
  logger.info('');
});

module.exports = { app, io, httpsServer };
      // Обновляем lastMessage в чате
      await Chat.findByIdAndUpdate(data.chatId, {
        lastMessage: message._id,
        updatedAt: new Date()
      });

      // Получаем полные данные отправителя
      const User = require('./models/User');
      const sender = await User.findById(socket.userId).select('_id username displayName avatar email');

      // Отправляем всем в чате
      io.to(`chat_${data.chatId}`).emit('newMessage', {
        _id: message._id,
        chat: data.chatId,
        sender: {
          _id: sender._id,
          username: sender.username,
          displayName: sender.displayName || sender.username,
          avatar: sender.avatar
        },
        text: data.text,
        encryptedText: data.encryptedText || null,
        createdAt: message.createdAt
      });

      logger.info('Сообщение отправлено', { 
        userId: socket.userId, 
        chatId: data.chatId,
        messageId: message._id
      });
    } catch (error) {
      logger.error('Ошибка отправки сообщения', { 
        error: error.message,
        userId: socket.userId
      });
      socket.emit('error', 'Ошибка отправки сообщения');
    }
  });

  // Пользователь печатает
  socket.on('typing', (data) => {
    try {
      if (!data.chatId) return;

      io.to(`chat_${data.chatId}`).emit('userTyping', {
        userId: socket.userId,
        username: socket.username,
        isTyping: true
      });
    } catch (error) {
      logger.error('Ошибка typing', { error: error.message });
    }
  });

  // Пользователь перестал печатать
  socket.on('stopTyping', (data) => {
    try {
      if (!data.chatId) return;

      io.to(`chat_${data.chatId}`).emit('userTyping', {
        userId: socket.userId,
        username: socket.username,
        isTyping: false
      });
    } catch (error) {
      logger.error('Ошибка stopTyping', { error: error.message });
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    logger.info('❌ Пользователь отключен', { 
      userId: socket.userId,
      socketId: socket.id
    });
  });

  // Обработка ошибок
  socket.on('error', (error) => {
    logger.error('Socket.io ошибка', { 
      userId: socket.userId,
      error: error.message 
    });
  });
});

// ============ ERROR HANDLING ============

app.use((err, req, res, next) => {
  logger.error('Необработанная ошибка', { 
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Внутренняя ошибка сервера',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// ============ GRACEFUL SHUTDOWN ============

process.on('SIGTERM', () => {
  logger.info('SIGTERM получен, закрываем сервер...');
  httpsServer.close(() => {
    logger.info('HTTPS сервер закрыт');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB соединение закрыто');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT получен, закрываем сервер...');
  httpsServer.close(() => {
    logger.info('HTTPS сервер закрыт');
    mongoose.connection.close(false, () => {
      logger.info('MongoDB соединение закрыто');
      process.exit(0);
    });
  });
});

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

httpsServer.listen(PORT, HOST, () => {
  logger.info(`🚀 HTTPS сервер запущен на https://${HOST}:${PORT}`);
  logger.info('⚠️  Используется самоподписанный сертификат');
  logger.info('📚 API документация доступна на https://localhost:3000/health');
  logger.info('');
  logger.info('🔐 Безопасность включена:');
  logger.info('  ✅ HTTPS/TLS шифрование');
  logger.info('  ✅ Rate limiting');
  logger.info('  ✅ CORS защита');
  logger.info('  ✅ Helmet.js заголовки');
  logger.info('  ✅ JWT аутентификация');
  logger.info('  ✅ Socket.io аутентификация');
  logger.info('');
});

module.exports = { app, io, httpsServer };
