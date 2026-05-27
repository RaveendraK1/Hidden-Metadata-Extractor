const path = require('path');
const os = require('os');
const fs = require('fs').promises;
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { ExifTool } = require('exiftool-vendored');
const exiftool = new ExifTool({ taskTimeoutMillis: 10000 });

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const publicDir = path.join(__dirname, 'public');

app.use(cors());
app.use(express.static(publicDir));
app.use(express.json());

// Safely convert any ExifDateTime / raw value to a readable string
function safeStr(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return String(val);
  // ExifDateTime / ExifDate objects expose .rawValue or .toString()
  if (val && typeof val.rawValue === 'string') return val.rawValue;
  if (val && typeof val.toString === 'function') {
    const s = val.toString();
    if (s !== '[object Object]') return s;
  }
  try { return JSON.stringify(val); } catch { return null; }
}

function safeNum(val) {
  if (val == null) return null;
  const n = Number(safeStr(val));
  return isNaN(n) ? null : n;
}

// Convert GPS DMS strings like "28 deg 30' 12.34\" N" → decimal
function dmsToDecimal(dmsStr, ref) {
  if (dmsStr == null) return null;
  const s = safeStr(dmsStr);
  if (!s) return null;
  // Try parse as plain number first
  const plain = parseFloat(s);
  if (!isNaN(plain) && !s.includes('deg')) {
    return (ref === 'S' || ref === 'W') ? -plain : plain;
  }
  const match = s.match(/(\d+)\s*deg\s*(\d+)'\s*([\d.]+)"/);
  if (!match) return null;
  let dec = parseInt(match[1]) + parseInt(match[2]) / 60 + parseFloat(match[3]) / 3600;
  if (ref === 'S' || ref === 'W') dec = -dec;
  return parseFloat(dec.toFixed(7));
}

function normaliseLocation(m) {
  const latRaw = m.GPSLatitude ?? m.GPSLatitudeDecimal ?? null;
  const lngRaw = m.GPSLongitude ?? m.GPSLongitudeDecimal ?? null;
  if (latRaw == null || lngRaw == null) return null;
  const lat = dmsToDecimal(latRaw, safeStr(m.GPSLatitudeRef));
  const lng = dmsToDecimal(lngRaw, safeStr(m.GPSLongitudeRef));
  if (lat == null || lng == null) return null;
  return {
    latitude: lat,
    longitude: lng,
    altitude: safeStr(m.GPSAltitude) || null,
    altitudeRef: safeStr(m.GPSAltitudeRef) || null,
    bearing: safeStr(m.GPSImgDirection) || null,
    speed: safeStr(m.GPSSpeed) || null,
    timestamp: safeStr(m.GPSTimeStamp) || null,
    datestamp: safeStr(m.GPSDateStamp) || null,
    mapDatum: safeStr(m.GPSMapDatum) || null,
    dop: safeStr(m.GPSDOP) || null,
    mapsUrl: `https://maps.google.com/?q=${lat},${lng}`
  };
}

function guessDevice(m) {
  const make  = safeStr(m.Make  || m.CameraMake  || m['com.apple.quicktime.make']  || null);
  const model = safeStr(m.Model || m.CameraModelName || m['com.apple.quicktime.model'] || null);
  const sw    = safeStr(m.Software || m.ProcessingSoftware || null);
  const device = [make, model].filter(Boolean).join(' ').trim();
  return { make, model, device: device || null, software: sw };
}

function guessTimestamp(m) {
  const fields = [
    'DateTimeOriginal','CreateDate','ModifyDate',
    'MediaCreateDate','TrackCreateDate','CreationDate',
    'FileModifyDate','FileCreateDate'
  ];
  for (const f of fields) {
    const v = safeStr(m[f]);
    if (v && v !== 'Unknown time') return v;
  }
  return null;
}

function editAnalysis(m) {
  const editSoftware = [
    'Adobe','Photoshop','Lightroom','GIMP','Snapseed','VSCO','Instagram',
    'WhatsApp','Pixelmator','Paint','ImageMagick','FFmpeg','Premiere',
    'After Effects','DaVinci','CapCut','InShot','KineMaster','Canva',
    'PicsArt','Facetune','BeautyPlus','Meitu','Cymera'
  ];
  const reasons = [];

  const sw = safeStr(m.Software || m.ProcessingSoftware || m.ImageProcessingSoftware || '');
  if (sw && editSoftware.some(e => sw.toLowerCase().includes(e.toLowerCase()))) {
    reasons.push(`Software: "${sw}"`);
  }
  const hist = safeStr(m.History || '');
  if (hist) reasons.push('XMP history present');

  const orig = safeStr(m.DateTimeOriginal);
  const mod  = safeStr(m.ModifyDate);
  if (orig && mod && orig !== mod) reasons.push(`Modified date differs from capture date`);

  const desc = safeStr(m.ImageDescription || m.Description || '');
  if (desc && editSoftware.some(e => desc.toLowerCase().includes(e.toLowerCase()))) {
    reasons.push(`Description mentions editing tool`);
  }

  return { edited: reasons.length > 0, reasons };
}

function cameraSettings(m) {
  return {
    iso:           safeStr(m.ISO || m.ISOSpeedRatings) || null,
    aperture:      safeStr(m.FNumber || m.ApertureValue) || null,
    shutterSpeed:  safeStr(m.ExposureTime || m.ShutterSpeedValue) || null,
    focalLength:   safeStr(m.FocalLength) || null,
    focalLength35: safeStr(m.FocalLengthIn35mmFormat || m['FocalLengthIn35mmFilm']) || null,
    whiteBalance:  safeStr(m.WhiteBalance) || null,
    flash:         safeStr(m.Flash) || null,
    exposureMode:  safeStr(m.ExposureMode) || null,
    exposureProgram: safeStr(m.ExposureProgram) || null,
    meteringMode:  safeStr(m.MeteringMode) || null,
    sceneCaptureType: safeStr(m.SceneCaptureType) || null,
    digitalZoom:   safeStr(m.DigitalZoomRatio) || null,
    brightnessValue: safeStr(m.BrightnessValue) || null,
    exposureBias:  safeStr(m.ExposureCompensation || m.ExposureBiasValue) || null,
    maxAperture:   safeStr(m.MaxApertureValue) || null,
    lightSource:   safeStr(m.LightSource) || null,
    contrast:      safeStr(m.Contrast) || null,
    saturation:    safeStr(m.Saturation) || null,
    sharpness:     safeStr(m.Sharpness) || null,
    lensModel:     safeStr(m.LensModel || m.Lens) || null,
    lensInfo:      safeStr(m.LensInfo) || null,
  };
}

function imageProperties(m) {
  return {
    width:       safeStr(m.ImageWidth  || m.ExifImageWidth  || m.PixelXDimension) || null,
    height:      safeStr(m.ImageHeight || m.ExifImageHeight || m.PixelYDimension) || null,
    orientation: safeStr(m.Orientation) || null,
    colorSpace:  safeStr(m.ColorSpace) || null,
    bitDepth:    safeStr(m.BitsPerSample || m.BitDepth) || null,
    compression: safeStr(m.Compression) || null,
    xResolution: safeStr(m.XResolution) || null,
    yResolution: safeStr(m.YResolution) || null,
    resolutionUnit: safeStr(m.ResolutionUnit) || null,
    YCbCrPositioning: safeStr(m.YCbCrPositioning) || null,
    megapixels:  safeStr(m.Megapixels) || null,
    quality:     safeStr(m.Quality) || null,
    imageUniqueId: safeStr(m.ImageUniqueID) || null,
  };
}

function authorInfo(m) {
  return {
    artist:      safeStr(m.Artist) || null,
    copyright:   safeStr(m.Copyright) || null,
    creator:     safeStr(m.Creator) || null,
    author:      safeStr(m.Author) || null,
    description: safeStr(m.ImageDescription || m.Description || m.Comment) || null,
    keywords:    safeStr(m.Keywords || m.Subject) || null,
    rating:      safeStr(m.Rating) || null,
  };
}

function buildCleanRaw(metadata) {
  const clean = {};
  for (const [key, val] of Object.entries(metadata)) {
    if (key === 'errors' || key === 'warnings' || key === 'SourceFile') continue;
    const s = safeStr(val);
    if (s !== null) clean[key] = s;
  }
  return clean;
}

app.post('/upload', upload.single('media'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File upload missing.' });

  const tempName = `metadata-upload-${Date.now()}${path.extname(req.file.originalname)}`;
  const tempPath = path.join(os.tmpdir(), tempName);

  try {
    await fs.writeFile(tempPath, req.file.buffer);
    const metadata = await exiftool.read(tempPath);

    const { make, model, device, software } = guessDevice(metadata);
    const editInfo = editAnalysis(metadata);

    const response = {
      fileName:   req.file.originalname,
      fileType:   req.file.mimetype,
      size:       req.file.size,
      device:     device || software || 'Unknown device',
      make, model, software,
      timestamp:  guessTimestamp(metadata),
      allDates: {
        dateTimeOriginal: safeStr(metadata.DateTimeOriginal) || null,
        createDate:       safeStr(metadata.CreateDate) || null,
        modifyDate:       safeStr(metadata.ModifyDate) || null,
        digitizedDate:    safeStr(metadata.DateTimeDigitized) || null,
        fileModifyDate:   safeStr(metadata.FileModifyDate) || null,
        mediaCreateDate:  safeStr(metadata.MediaCreateDate) || null,
        gpsDate:          safeStr(metadata.GPSDateStamp) || null,
      },
      location:   normaliseLocation(metadata),
      edited:     editInfo.edited,
      editReasons: editInfo.reasons,
      camera:     cameraSettings(metadata),
      image:      imageProperties(metadata),
      author:     authorInfo(metadata),
      raw:        buildCleanRaw(metadata),
    };

    res.json(response);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Unable to analyze file metadata.' });
  } finally {
    try { await fs.unlink(tempPath); } catch (_) {}
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Hidden Metadata Extractor running at http://localhost:${port}`);
});
