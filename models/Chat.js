const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  title: String,
  type: { type: String, default: "private", enum: ["private", "group"] },
  users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
}, { timestamps: true });

module.exports = mongoose.model("Chat", ChatSchema);
