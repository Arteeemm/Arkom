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

router.get("/chats", auth, async (req, res) => {
  const chats = await Chat.find({ users: req.userId })
    .populate("users", "username avatar")
    .populate("lastMessage")
    .sort({ updatedAt: -1 });
  res.json(chats);
});

router.get("/messages/:chatId", auth, async (req, res) => {
  const messages = await Message.find({ chat: req.params.chatId })
    .populate("sender", "username avatar")
    .sort({ createdAt: 1 })
    .limit(100);
  res.json(messages);
});

router.post("/chat/start", auth, async (req, res) => {
  const { otherUserId } = req.body;
  if (!otherUserId) return res.status(400).json({ error: "otherUserId required" });

  let chat = await Chat.findOne({
    type: "private",
    users: { $all: [req.userId, otherUserId], $size: 2 }
  });

  if (!chat) {
    chat = new Chat({ type: "private", users: [req.userId, otherUserId] });
    await chat.save();
  }

  res.json(chat);
});

router.get("/users/search", auth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);

  const users = await User.find({
    username: { $regex: q, $options: "i" },
    _id: { $ne: req.userId }
  }).select("username avatar _id").limit(10);

  res.json(users);
});

module.exports = router;
