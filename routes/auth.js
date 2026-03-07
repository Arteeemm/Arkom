const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

router.post("/login", async (req, res) => {

  const user = await User.findOne({ username: req.body.username });

  if (!user) return res.send("User not found");

  const valid = await bcrypt.compare(req.body.password, user.password);

  if (!valid) return res.send("Wrong password");

  const token = jwt.sign({ id: user._id }, "secret");

  res.json({ token });

});

module.exports = router;
