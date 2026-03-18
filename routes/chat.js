const express = require("express");
const jwt = require("jsonwebtoken");
const Chat = require("../models/Chat");
const Message = require("../models/Message");
const User = require("../models/User");

const router = express.Router();

const auth = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "No token" });

  try {
    const decoded = jwt.verify(token, "secret");
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};

// ✅ Получить все чаты текущего пользователя
router.get("/chats", auth, async (req, res) => {
  try {
    const chats = await Chat.find({ users: req.userId })
      .populate("users", "username avatar displayName")
      .populate("lastMessage")
      .sort({ updatedAt: -1 });
    res.json(chats);
  } catch (err) {
    console.error("Ошибка при загрузке чатов:", err);
    res.status(500).json({ error: "Ошибка загрузки чатов" });
  }
});

// ✅ Получить сообщения из чата
router.get("/messages/:chatId", auth, async (req, res) => {
  try {
    const messages = await Message.find({ chat: req.params.chatId })
      .populate("sender", "username avatar displayName")
      .sort({ createdAt: 1 })
      .limit(100);
    res.json(messages);
  } catch (err) {
    console.error("Ошибка при загрузке сообщений:", err);
    res.status(500).json({ error: "Ошибка загрузки сообщений" });
  }
});

// ✅ Начать новый чат
router.post("/chat/start", auth, async (req, res) => {
  try {
    const { otherUserId } = req.body;
    if (!otherUserId) return res.status(400).json({ error: "otherUserId required" });

    // Проверяем, что пользователь существует
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) return res.status(404).json({ error: "User not found" });

    let chat = await Chat.findOne({
      type: "private",
      users: { $all: [req.userId, otherUserId] }
    }).populate("users", "username avatar displayName").populate("lastMessage");

    if (!chat) {
      chat = new Chat({ type: "private", users: [req.userId, otherUserId] });
      await chat.save();
      await chat.populate("users", "username avatar displayName");
    }

    res.json(chat);
  } catch (err) {
    console.error("Ошибка при создании чата:", err);
    res.status(500).json({ error: "Ошибка создания чата" });
  }
});

// ✅ Поиск пользователей
router.get("/users/search", auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: "i" } },
        { displayName: { $regex: q, $options: "i" } }
      ],
      _id: { $ne: req.userId }
    }).select("username avatar displayName _id").limit(10);

    res.json(users);
  } catch (err) {
    console.error("Ошибка при поиске пользователей:", err);
    res.status(500).json({ error: "Ошибка поиска" });
  }
});

module.exports = router;
