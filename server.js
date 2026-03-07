const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const mongoose = require("mongoose");

const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static("public"));

mongoose.connect("mongodb://localhost:27017/messenger");

io.on("connection", (socket) => {

  socket.on("sendMessage", async (data) => {

    const message = new Message({
      chat: data.chatId,
      sender: data.userId,
      text: data.text
    });

    await message.save();

    io.to(data.chatId).emit("newMessage", message);

  });

});

server.listen(3000, () => {
    console.log("Server running on port 3000");
});
