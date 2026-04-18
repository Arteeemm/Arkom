const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: /.+\@.+\..+/
  },
  phoneNumber: {
    type: String,
    unique: true,
    sparse: true
  },
  displayName: String,
  avatar: String,
  bio: String,
  
  // OTP верификация
  otp: String,
  otpExpiry: Date,
  isVerified: {
    type: Boolean,
    default: false
  },
  
  // Публичный ключ для E2E шифрования
  publicKey: String,
  
  // Безопасность
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Индексы для производительности
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });

// Метод для сравнения паролей (на случай если понадобится)
userSchema.methods.comparePassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Проверка блокировки после неудачных попыток
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Инкрементируем попытки логина
userSchema.methods.incLoginAttempts = async function() {
  // Если уже заблокирован, ничего не делаем
  if (this.isLocked) {
    return;
  }
  
  // Инкрементируем
  let updates = { $inc: { loginAttempts: 1 } };
  
  // Блокируем после 5 попыток на 2 часа
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: new Date(Date.now() + 2 * 60 * 60 * 1000) };
  }
  
  return this.updateOne(updates);
};

// Сбрасываем попытки при успешном логине
userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $set: { loginAttempts: 0, lockUntil: null },
    lastLogin: new Date()
  });
};

module.exports = mongoose.model('User', userSchema);
