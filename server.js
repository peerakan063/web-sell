const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const app = express();
const SECRET = "nungklamtong_secret_2026";
const MONGO_URI = "mongodb://127.0.0.1:27017/websell";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: "thazxs.4@gmail.com", pass: "hzjivdmveipce gqv".replace(/ /g, "") }
});

app.use(cors());
app.use(express.json());
app.use(express.static("."));
app.use("/uploads", express.static("uploads"));
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("uploads/slips")) fs.mkdirSync("uploads/slips");
if (!fs.existsSync("uploads/products")) fs.mkdirSync("uploads/products");

mongoose.connect(MONGO_URI, { family: 4 })
  .then(() => console.log("✅ เชื่อมต่อ MongoDB สำเร็จ"))
  .catch(err => console.error("❌ MongoDB error:", err));

// ===== MODELS =====
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "user" },
  email: { type: String, default: "" },
  resetToken: { type: String, default: "" },
  resetExpire: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const accountSchema = new mongoose.Schema({
  detail: { type: String, required: true },
  price: { type: Number, required: true },
  status: { type: String, default: "available" },
  image: { type: String, default: "" },
  images: { type: [String], default: [] },
  game: { type: String, default: "freefire" },
  secret: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const Account = mongoose.model("Account", accountSchema);

const orderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  account_id: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
  detail: { type: String },
  price: { type: Number },
  status: { type: String, default: "pending" },
  slip: { type: String, default: "" },
  secret: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const Order = mongoose.model("Order", orderSchema);

const gachaTierSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  label: { type: String, default: "" },
  emoji: { type: String, default: "🎮" },
  price: { type: Number, default: 0 },
  minPrice: { type: Number, default: 0 },
  maxPrice: { type: Number, default: 9999 },
  color: { type: String, default: "#f97316" }
});
const GachaTier = mongoose.model("GachaTier", gachaTierSchema);

const gachaOrderSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  username: { type: String, default: "" },
  tier: { type: String, default: "bronze" },
  price: { type: Number, default: 0 },
  slip: { type: String, default: "" },
  ref: { type: String, default: "" },
  status: { type: String, default: "pending" },
  result: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now }
});
const GachaOrder = mongoose.model("GachaOrder", gachaOrderSchema);

// ★ GachaItem — ไอดีแยกต่างหากสำหรับวงล้อสุ่ม
const gachaItemSchema = new mongoose.Schema({
  detail: { type: String, required: true },
  tier: { type: String, required: true },
  game: { type: String, default: "freefire" },
  status: { type: String, default: "available" },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  claimedAt: { type: Date, default: null },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "GachaOrder", default: null },
  createdAt: { type: Date, default: Date.now }
});
const GachaItem = mongoose.model("GachaItem", gachaItemSchema);

const luckySchema = new mongoose.Schema({
  detail: { type: String, required: true },
  game: { type: String, default: "freefire" },
  status: { type: String, default: "available" },
  claimedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  claimedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});
const LuckyCode = mongoose.model("LuckyCode", luckySchema);

// ===== MULTER =====
const slipStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/slips/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/products/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});
const gachaSlipStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/slips/"),
  filename: (req, file, cb) => cb(null, "gacha-" + Date.now() + path.extname(file.originalname))
});
const uploadSlip = multer({ storage: slipStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadGachaSlip = multer({ storage: gachaSlipStorage, limits: { fileSize: 5 * 1024 * 1024 } });
const uploadProductAny = multer({ storage: productStorage, limits: { fileSize: 10 * 1024 * 1024 } }).any();

// ===== AUTH MIDDLEWARE =====
function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: "ไม่มี token", code: "NO_TOKEN" });
  try { req.user = jwt.verify(token, SECRET); next(); }
  catch (err) { res.status(401).json({ message: "token ไม่ถูกต้อง", code: err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "TOKEN_INVALID" }); }
}
function adminMiddleware(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "ไม่มีสิทธิ์ admin" });
  next();
}

// ===== AUTH ROUTES =====
app.post("/register", async (req, res) => {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
    if (!email) return res.status(400).json({ message: "กรุณากรอก Email" });
    if (password.length < 6) return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
    if (await User.findOne({ username })) return res.status(400).json({ message: "ชื่อผู้ใช้นี้มีแล้ว" });
    if (await User.findOne({ email })) return res.status(400).json({ message: "Email นี้ถูกใช้แล้ว" });
    await User.create({ username, password: await bcrypt.hash(password, 10), email });
    res.json({ message: "สมัครสมาชิกสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "ไม่พบผู้ใช้นี้" });
    if (!await bcrypt.compare(password, user.password)) return res.status(400).json({ message: "รหัสผ่านไม่ถูกต้อง" });
    const token = jwt.sign({ id: user._id, username: user.username, role: user.role }, SECRET, { expiresIn: "7d" });
    res.json({ token, username: user.username, role: user.role });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/me", authMiddleware, async (req, res) => {
  try { res.json(await User.findById(req.user.id).select("-password")); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/change-password", authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ message: "กรุณากรอกข้อมูลให้ครบ" });
    if (newPassword.length < 6) return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
    const user = await User.findById(req.user.id);
    if (!await bcrypt.compare(currentPassword, user.password)) return res.status(400).json({ message: "รหัสผ่านปัจจุบันไม่ถูกต้อง" });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "กรุณากรอก Email" });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "ไม่พบ Email นี้ในระบบ" });
    const token = crypto.randomBytes(32).toString("hex");
    user.resetToken = token;
    user.resetExpire = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    const resetLink = `http://localhost:3000/reset-password.html?token=${token}`;
    await transporter.sendMail({
      from: '"หนุ่มกล้ามทอง" <thazxs.4@gmail.com>',
      to: email,
      subject: "🔐 รีเซ็ตรหัสผ่าน | หนุ่มกล้ามทอง",
      html: `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#0f0f1a;color:#e8e8f0;border-radius:12px;overflow:hidden"><div style="background:linear-gradient(135deg,#f97316,#ea6500);padding:24px;text-align:center"><h1 style="color:white;margin:0;font-size:22px">🎮 หนุ่มกล้ามทอง</h1></div><div style="padding:32px"><h2 style="color:#ffd700;margin-bottom:12px">รีเซ็ตรหัสผ่าน</h2><p style="color:#aaa;line-height:1.7">สวัสดีครับคุณ <strong style="color:white">${user.username}</strong><br>มีคำขอรีเซ็ตรหัสผ่านสำหรับบัญชีของคุณ</p><div style="text-align:center;margin:28px 0"><a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#f97316,#ea6500);color:white;text-decoration:none;border-radius:10px;font-weight:700;font-size:16px">🔑 รีเซ็ตรหัสผ่าน</a></div><p style="color:#666;font-size:13px">ลิงก์หมดอายุใน <strong style="color:#ffd700">30 นาที</strong></p></div></div>`
    });
    res.json({ message: "ส่ง Email สำเร็จแล้ว!" });
  } catch (err) { res.status(500).json({ message: "ส่ง Email ไม่ได้: " + err.message }); }
});

app.post("/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: "ข้อมูลไม่ครบ" });
    if (password.length < 6) return res.status(400).json({ message: "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" });
    const user = await User.findOne({ resetToken: token, resetExpire: { $gt: new Date() } });
    if (!user) return res.status(400).json({ message: "ลิงก์หมดอายุหรือไม่ถูกต้อง" });
    user.password = await bcrypt.hash(password, 10);
    user.resetToken = ""; user.resetExpire = null;
    await user.save();
    res.json({ message: "เปลี่ยนรหัสผ่านสำเร็จแล้ว!" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== ACCOUNT ROUTES =====
app.get("/accounts", async (req, res) => {
  try { res.json(await Account.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/accounts/:id", async (req, res) => {
  try {
    const a = await Account.findById(req.params.id);
    if (!a) return res.status(404).json({ message: "ไม่พบสินค้า" });
    res.json(a);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== ORDER ROUTES =====
app.post("/order/create", authMiddleware, async (req, res) => {
  try {
    const { account_id } = req.body;
    const account = await Account.findById(account_id);
    if (!account) return res.status(404).json({ message: "ไม่พบสินค้า" });
    if (account.status === "sold") return res.status(400).json({ message: "สินค้าหมดแล้ว", order: null });
    const order = await Order.create({ user_id: req.user.id, account_id, detail: account.detail, price: account.price, status: "pending" });
    res.json({ order, price: account.price });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/order/upload-slip", authMiddleware, uploadSlip.single("slip"), async (req, res) => {
  try {
    const { order_id } = req.body;
    const order = await Order.findOne({ _id: order_id, user_id: req.user.id });
    if (!order) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    order.slip = "/uploads/slips/" + req.file.filename;
    order.status = "paid";
    await order.save();
    await Account.findByIdAndUpdate(order.account_id, { status: "sold" });
    res.json({ message: "ส่งสลิปสำเร็จ! รอแอดมินยืนยัน" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/my-orders", authMiddleware, async (req, res) => {
  try { res.json(await Order.find({ user_id: req.user.id }).sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== ADMIN: ACCOUNT =====
app.post("/admin/account", authMiddleware, adminMiddleware, (req, res, next) => {
  uploadProductAny(req, res, (err) => {
    if (err) {
      if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ message: "ไฟล์ใหญ่เกินไป" });
      return res.status(400).json({ message: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { detail, price, game, secret } = req.body;
    if (!detail || !price) return res.status(400).json({ message: "กรุณากรอก detail และ price" });
    const imageFiles = (req.files || []).filter(f => f.fieldname === "images").slice(0, 8);
    const images = imageFiles.map(f => "/uploads/products/" + f.filename);
    const account = await Account.create({ detail, price: Number(price), game: game || "freefire", image: images[0] || "", images, secret: secret || "" });
    res.json({ message: "เพิ่มสินค้าสำเร็จ", account });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/admin/account/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const account = await Account.findById(req.params.id);
    if (account) {
      const allImgs = account.images?.length ? account.images : (account.image ? [account.image] : []);
      allImgs.forEach(imgPath => { const fp = path.join(__dirname, imgPath); if (fs.existsSync(fp)) fs.unlinkSync(fp); });
    }
    await Account.findByIdAndDelete(req.params.id);
    res.json({ message: "ลบสินค้าสำเร็จ" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== ADMIN: ORDER =====
app.get("/admin/orders", authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await Order.find().populate("user_id", "username").sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/admin/order/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    order.status = status;
    if (status === "confirmed") { const a = await Account.findById(order.account_id); order.secret = a?.secret || ""; }
    if (status === "rejected") { order.secret = ""; await Account.findByIdAndUpdate(order.account_id, { status: "available" }); }
    await order.save();
    res.json({ message: "อัพเดทออเดอร์แล้ว", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/make-admin", async (req, res) => {
  try {
    const { username, secret } = req.body;
    if (secret !== "nungklamtong2026") return res.status(403).json({ message: "secret ไม่ถูก" });
    const user = await User.findOneAndUpdate({ username }, { role: "admin" }, { new: true });
    if (!user) return res.status(404).json({ message: "ไม่พบผู้ใช้" });
    res.json({ message: `${username} เป็น admin แล้ว` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== GACHA TIERS =====
app.get("/gacha/tiers", async (req, res) => {
  try {
    let tiers = await GachaTier.find();
    if (!tiers.length) {
      await GachaTier.insertMany([
        { key: "bronze", label: "สุ่มไอดีงบนักเรียน", emoji: "🎮", price: 10, minPrice: 0, maxPrice: 20, color: "#f97316" },
        { key: "silver", label: "สุ่มไอดีปืน 7", emoji: "⚔️", price: 49, minPrice: 21, maxPrice: 60, color: "#60a5fa" },
        { key: "gold", label: "สุ่มไอดีสุดเทพ", emoji: "👑", price: 99, minPrice: 61, maxPrice: 99999, color: "#ffd700" }
      ]);
      tiers = await GachaTier.find();
    }
    res.json(tiers);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/admin/gacha/tier/:key", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { label, emoji, price, minPrice, maxPrice, color } = req.body;
    const tier = await GachaTier.findOneAndUpdate({ key: req.params.key }, { label, emoji, price, minPrice, maxPrice, color }, { new: true, upsert: true });
    res.json({ message: "อัพเดท tier สำเร็จ", tier });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== GACHA ITEMS =====
app.post("/admin/gacha/item", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { detail, tier, game } = req.body;
    if (!detail || !tier) return res.status(400).json({ message: "กรุณากรอก detail และ tier" });
    const item = await GachaItem.create({ detail, tier, game: game || "freefire" });
    res.json({ message: "เพิ่มไอดี Gacha สำเร็จ", item });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/admin/gacha/items", authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await GachaItem.find().populate("claimedBy", "username").sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/admin/gacha/item/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try { await GachaItem.findByIdAndDelete(req.params.id); res.json({ message: "ลบแล้ว" }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/gacha/item-stats", async (req, res) => {
  try {
    const bronze = await GachaItem.countDocuments({ tier: "bronze", status: "available" });
    const silver = await GachaItem.countDocuments({ tier: "silver", status: "available" });
    const gold = await GachaItem.countDocuments({ tier: "gold", status: "available" });
    res.json({ bronze, silver, gold });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== GACHA ORDERS =====
app.post("/gacha/order", authMiddleware, uploadGachaSlip.single("slip"), async (req, res) => {
  try {
    const { tier, ref } = req.body;
    const tierData = await GachaTier.findOne({ key: tier });
    if (!tierData) return res.status(400).json({ message: "ไม่พบ tier นี้" });
    const order = await GachaOrder.create({
      user_id: req.user.id, username: req.user.username, tier,
      price: tierData.price, slip: req.file ? "/uploads/slips/" + req.file.filename : "",
      ref: ref || "", status: "pending"
    });
    res.json({ message: "ส่งสลิปสำเร็จ รอแอดมินยืนยัน", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/gacha/my-orders", authMiddleware, async (req, res) => {
  try { res.json(await GachaOrder.find({ user_id: req.user.id }).sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/admin/gacha/orders", authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await GachaOrder.find().sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.put("/admin/gacha/order/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status, result } = req.body;
    const order = await GachaOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "ไม่พบออเดอร์" });
    order.status = status;
    if (status === "confirmed") {
      if (result && result.trim()) {
        order.result = result.trim();
      } else {
        const available = await GachaItem.find({ tier: order.tier, status: "available" });
        if (available.length) {
          const item = available[Math.floor(Math.random() * available.length)];
          item.status = "claimed"; item.claimedBy = order.user_id;
          item.claimedAt = new Date(); item.orderId = order._id;
          await item.save();
          order.result = item.detail;
        } else {
          order.result = "⚠️ ไม่มีไอดีใน tier นี้ กรุณาติดต่อแอดมิน";
        }
      }
    }
    await order.save();
    res.json({ message: "อัพเดทแล้ว", order });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== LUCKY CODE =====
app.post("/lucky/spin", authMiddleware, async (req, res) => {
  try {
    const available = await LuckyCode.find({ status: "available" });
    if (!available.length) return res.status(400).json({ message: "ขออภัย! ไอดีหมดแล้วในตอนนี้ครับ" });
    const lucky = available[Math.floor(Math.random() * available.length)];
    lucky.status = "claimed"; lucky.claimedBy = req.user.id; lucky.claimedAt = new Date();
    await lucky.save();
    res.json({ message: "ยินดีด้วย! คุณได้รับไอดีแล้ว", lucky });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/lucky/my", authMiddleware, async (req, res) => {
  try { res.json(await LuckyCode.find({ claimedBy: req.user.id }).sort({ claimedAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/lucky/stats", async (req, res) => {
  try {
    res.json({
      total: await LuckyCode.countDocuments(),
      avail: await LuckyCode.countDocuments({ status: "available" }),
      claimed: await LuckyCode.countDocuments({ status: "claimed" })
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post("/admin/lucky", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { detail, game } = req.body;
    if (!detail) return res.status(400).json({ message: "กรุณากรอก detail" });
    res.json({ message: "เพิ่มไอดีสุ่มสำเร็จ", code: await LuckyCode.create({ detail, game: game || "freefire" }) });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get("/admin/lucky", authMiddleware, adminMiddleware, async (req, res) => {
  try { res.json(await LuckyCode.find().populate("claimedBy", "username").sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete("/admin/lucky/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try { await LuckyCode.findByIdAndDelete(req.params.id); res.json({ message: "ลบแล้ว" }); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// ===== START =====
app.listen(3000, () => {
  console.log("🚀 Server รันที่ http://localhost:3000");
  console.log("📁 เปิดเว็บได้ที่ http://localhost:3000/index.html");
});