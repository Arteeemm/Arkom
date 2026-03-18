const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const authRoutes = require("./routes/auth");
const chatRoutes = require("./routes/chat");
const userRoutes = require("./routes/user");

const Message = require("./models/Message");
const Chat = require("./models/Chat");
const User = require("./models/User");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ✅ Добавить заголовки для разрешения inline scripts
app.use((req, res, next) => {
  res.setHeader("Content-Security-Policy", "default-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' https://socket.io; style-src 'self' 'unsafe-inline'");
  next();
});

// ✅ ПРАВИЛЬНЫЙ ПОРЯДОК РОУТОВ
app.use("/api/auth", authRoutes);
app.use("/api", chatRoutes);      // /api/chats, /api/messages, /api/chat/start, /api/users/search
app.use("/api/user", userRoutes); // /api/user/profile, /api/user/profile/update, /api/user/profile/avatar

mongoose.connect("mongodb://localhost:27017/messenger")
  .then(() => console.log("✅ MongoDB подключён успешно"))
  .catch(err => console.error("❌ Ошибка подключения к MongoDB:", err));

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Authentication error"));

  try {
    const decoded = jwt.verify(token, "secret");
    socket.user = await User.findById(decoded.id).select("username _id");
    if (!socket.user) return next(new Error("User not found"));
    next();
  } catch (err) {
    next(new Error("Authentication error"));
  }
});

io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.user.username}`);

  socket.on("joinChats", async () => {
    const chats = await Chat.find({ users: socket.user._id });
    chats.forEach(chat => socket.join(chat._id.toString()));
  });

  socket.on("sendMessage", async (data) => {
    try {
      const message = new Message({
        chat: data.chatId,
        sender: socket.user._id,
        text: data.text.trim()
      });
      await message.save();

      await Chat.findByIdAndUpdate(data.chatId, { lastMessage: message._id });

      const populatedMsg = await Message.findById(message._id)
        .populate("sender", "username avatar displayName");

      io.to(data.chatId).emit("newMessage", populatedMsg);
    } catch (err) {
      console.error("❌ Ошибка при отправке сообщения:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected");
  });
});

server.listen(3000, () => console.log("🚀 Server running on port 3000"));
