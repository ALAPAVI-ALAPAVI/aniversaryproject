const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const ffmpeg = require('fluent-ffmpeg');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');

app.use(session({
  secret: 'video-archive-secret-key',
  resave: false,
  saveUninitialized: false
}));

const users = [
  { id: '1', username: 'admin', password: 'adminpassword', role: 'admin' },
  { id: '2', username: 'user', password: 'userpassword', role: 'user' }
];

let videos = [];
let accessTokens = {};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'public/uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Access Denied: Admins Only');
}

function convertToMp4(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('mp4')
      .videoCodec('libx264')
      .audioCodec('aac')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(err))
      .save(outputPath);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        return reject(new Error(`Failed to download: ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username && u.password === password);
  if (user) {
    req.session.user = user;
    return res.redirect('/');
  }
  res.render('login', { error: 'Invalid credentials' });
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/', requireAuth, (req, res) => {
  if (req.session.user.role === 'admin') {
    res.redirect('/admin/library');
  } else {
    res.redirect('/user/view');
  }
});

app.get('/admin/library', requireAuth, requireAdmin, (req, res) => {
  res.render('admin-library', { user: req.session.user, videos, tokens: accessTokens, host: req.headers.host });
});

app.get('/admin/upload', requireAuth, requireAdmin, (req, res) => {
  res.render('admin-upload', { user: req.session.user, message: null });
});

app.post('/admin/upload/file', requireAuth, requireAdmin, upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  
  const rawPath = req.file.path;
  const targetFilename = `std-${Date.now()}.mp4`;
  const targetPath = path.join('public/uploads', targetFilename);

  try {
    await convertToMp4(rawPath, targetPath);
    if (fs.existsSync(rawPath) && rawPath !== targetPath) fs.unlinkSync(rawPath);

    videos.push({
      id: uuidv4(),
      title: req.file.originalname,
      filename: targetFilename,
      createdAt: new Date().toLocaleString()
    });
    res.render('admin-upload', { user: req.session.user, message: 'File uploaded and converted successfully!' });
  } catch (err) {
    console.error(err);
    res.render('admin-upload', { user: req.session.user, message: 'Error processing video file.' });
  }
});

app.post('/admin/upload/url', requireAuth, requireAdmin, async (req, res) => {
  const { videoUrl, title } = req.body;
  if (!videoUrl) return res.status(400).send('URL required.');

  const tempFilename = `temp-${Date.now()}`;
  const tempPath = path.join('public/uploads', tempFilename);
  const targetFilename = `std-${Date.now()}.mp4`;
  const targetPath = path.join('public/uploads', targetFilename);

  try {
    await downloadFile(videoUrl, tempPath);
    await convertToMp4(tempPath, targetPath);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

    videos.push({
      id: uuidv4(),
      title: title || 'URL Video Import',
      filename: targetFilename,
      createdAt: new Date().toLocaleString()
    });
    res.render('admin-upload', { user: req.session.user, message: 'URL video imported and converted successfully!' });
  } catch (err) {
    console.error(err);
    res.render('admin-upload', { user: req.session.user, message: 'Error downloading or converting video URL.' });
  }
});

app.post('/admin/delete/:id', requireAuth, requireAdmin, (req, res) => {
  const videoIndex = videos.findIndex(v => v.id === req.params.id);
  if (videoIndex !== -1) {
    const video = videos[videoIndex];
    const filePath = path.join('public/uploads', video.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    videos.splice(videoIndex, 1);
  }
  res.redirect('/admin/library');
});

app.post('/admin/generate-access/:id', requireAuth, requireAdmin, async (req, res) => {
  const videoId = req.params.id;
  const token = uuidv4();
  const accessUrl = `http://${req.headers.host}/watch?token=${token}`;
  
  try {
    const qrCodeDataUrl = await QRCode.toDataURL(accessUrl);
    accessTokens[token] = { videoId, token, qrCodeDataUrl, accessUrl };
    res.redirect('/admin/library');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error generating access QR code.');
  }
});

app.get('/admin/account', requireAuth, requireAdmin, (req, res) => {
  res.render('account', { user: req.session.user, isAdmin: true });
});

app.get('/user/view', requireAuth, (req, res) => {
  res.render('user-view', { user: req.session.user, error: null });
});

app.get('/user/account', requireAuth, (req, res) => {
  res.render('account', { user: req.session.user, isAdmin: false });
});

app.get('/watch', requireAuth, (req, res) => {
  const token = req.query.token;
  const accessData = accessTokens[token];

  if (!accessData) {
    return res.render('user-view', { user: req.session.user, error: 'Invalid or expired video link/QR code access token.' });
  }

  const video = videos.find(v => v.id === accessData.videoId);
  if (!video) {
    return res.render('user-view', { user: req.session.user, error: 'Video no longer exists.' });
  }

  res.render('watch', { user: req.session.user, video });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
