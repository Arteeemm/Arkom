const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({

  name: String,

  users: [
    { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  ]

});

module.exports = mongoose.model("Chat", ChatSchema);
