const express = require("express");
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const router = express.Router();
const JWT_SECRET = "secret";

// Middleware для проверки токена
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Токен не найден" });
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    res.status(401).json({ error: "Неверный токен" });
  }
};

// Конфиг multer для загрузки аватаров
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../public/uploads");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `avatar_${req.userId}_${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Только изображения допускаются"));
    }
  }
});

// Получить свой профиль
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password");
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получить профиль другого пользователя
router.get("/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password");
    if (!user) return res.status(404).json({ error: "Пользователь не найден" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Обновить профиль (имя и описание)
router.put("/profile/update", authMiddleware, async (req, res) => {
  try {
    const { displayName, bio } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        displayName: displayName || "",
        bio: bio ? bio.substring(0, 150) : ""
      },
      { new: true }
    ).select("-password");
    
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Ошибка обновления профиля" });
  }
});

// Загрузить аватар
router.post("/profile/avatar", authMiddleware, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Файл не загружен" });
    
    const user = await User.findById(req.userId);
    if (user.avatar && user.avatar !== "") {
      const oldPath = path.join(__dirname, "../public", user.avatar);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    const avatarPath = `/uploads/${req.file.filename}`;
    const updatedUser = await User.findByIdAndUpdate(
      req.userId,
      { avatar: avatarPath },
      { new: true }
    ).select("-password");
    
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: "Ошибка загрузки аватара" });
  }
});

module.exports = router;
