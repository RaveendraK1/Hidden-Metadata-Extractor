const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { ExifTool } = require('exiftool-vendored');
const exiftool = new ExifTool({ taskTimeoutMillis: 5000 });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const publicDir = path.join(__dirname, 'public');

app.use(cors());
app.use(express.static(publicDir));
app.use(express.json());

function normaliseLocation(metadata) {
  const latitude = metadata.GPSLatitude || metadata.GPSLatitudeDecimal || null;
  const longitude = metadata.GPSLongitude || metadata.GPSLongitudeDecimal || null;
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    altitude: metadata.GPSAltitude || null,
    provider: metadata.GPSMapDatum || null
  };
}

function guessDevice(metadata) {
  const make = metadata.Make || metadata.CameraMake || metadata['com.apple.quicktime.camera'] || null;
  const model = metadata.Model || metadata.CameraModelName || metadata['com.apple.quicktime.Model'] || null;
  const software = metadata.Software || metadata.ProcessingSoftware || metadata.ImageProcessingSoftware || null;
  const device = [make, model].filter(Boolean).join(' ').trim();
  return device || software || 'Unknown device';
}

function guessTimestamp(metadata) {
  const candidates = [
    metadata.DateTimeOriginal,
    metadata.CreateDate,
    metadata.ModifyDate,
    metadata.MediaCreateDate,
    metadata.TrackCreateDate,
    metadata.CreationDate,
    metadata.FileModifyDate,
    metadata.FileCreateDate
  ];
  return candidates.find(Boolean) || 'Unknown time';
}

function wasEdited(metadata) {
  const editTags = [
    'Software',
    'ProcessingSoftware',
    'ImageProcessingSoftware',
    'History',
    'Description',
    'ImageDescription'
  ];
  const editIndicators = [
    'Adobe',
    'Photoshop',
    'Lightroom',
    'GIMP',
    'Snapseed',
    'VSCO',
    'Instagram',
    'WhatsApp',
    'Pixelmator',
    'Paint',
    'ImageMagick',
    'FFmpeg',
    'Premier',
    'After Effects',
    'Premiere Pro',
    'DaVinci',
    'CapCut',
    'InShot',
    'KineMaster'
  ];
  for (const key of editTags) {
    if (metadata[key]) {
      const value = String(metadata[key]);
      if (editIndicators.some(indicator => value.includes(indicator))) {
        return true;
      }
    }
  }
  if (metadata.ModifyDate && metadata.DateTimeOriginal && metadata.ModifyDate !== metadata.DateTimeOriginal) {
    return true;
  }
  return false;
}

app.post('/upload', upload.single('media'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File upload missing.' });
  }

  const tempName = `metadata-upload-${Date.now()}${path.extname(req.file.originalname)}`;
  const tempPath = path.join(os.tmpdir(), tempName);

  try {
    await fs.writeFile(tempPath, req.file.buffer);
    const metadata = await exiftool.read(tempPath);

    const response = {
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      size: req.file.size,
      device: guessDevice(metadata),
      timestamp: guessTimestamp(metadata),
      location: normaliseLocation(metadata),
      edited: wasEdited(metadata),
      raw: metadata
    };

    res.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Unable to analyze file metadata.' });
  } finally {
    try {
      await fs.unlink(tempPath);
    } catch (ignore) {}
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Hidden Metadata Extractor running at http://localhost:${port}`);
});
