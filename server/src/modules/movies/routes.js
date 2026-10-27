import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import * as movies from './service.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth, requireAuth, requireRole } from '../../middleware/auth.js';
import {
  supabase,
  supabaseStorageBucket,
  isSupabaseStorageEnabled,
} from '../../integrations/supabase.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');
// Serverless platforms (Vercel, Lambda) have a read-only filesystem, so uploads are
// staged in the temp dir and pushed to Supabase Storage/Cloudinary instead of disk.
const isEphemeralFs = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
if (!isEphemeralFs && !fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.avif', '.svg', '.tif', '.tiff']);

const EXTENSION_MIME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
};

/** Best-effort content type for the stored object. */
function resolveContentType(file) {
  const mime = String(file.mimetype || '').toLowerCase();
  if (mime && mime !== 'application/octet-stream') return mime;
  const ext = path.extname(file.originalname || '').toLowerCase();
  return EXTENSION_MIME_TYPES[ext] || 'application/octet-stream';
}

const upload = multer({
  dest: isEphemeralFs ? os.tmpdir() : uploadDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    // Flutter's MultipartFile.fromPath sends no content type, so the mime type
    // can be application/octet-stream. Accept any image mime type, and fall
    // back to the file extension when the client did not label the part.
    const mime = String(file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const isImageMime = mime.startsWith('image/');
    const isUnknownMime = mime === '' || mime === 'application/octet-stream';
    if (isImageMime || (isUnknownMime && IMAGE_EXTENSIONS.has(ext))) {
      cb(null, true);
      return;
    }
    const error = new Error('Only image files are allowed');
    error.status = 400;
    cb(error);
  },
});

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

async function uploadToSupabase(file, movieId, type) {
  const ext = path
    .extname(file.originalname || '')
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '');
  const safeType =
    String(type || 'poster')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '') || 'poster';
  const objectPath = `movies/${movieId}/${safeType}-${Date.now()}-${file.filename}${ext}`;

  try {
    const body = await fs.promises.readFile(file.path);
    const { error } = await supabase.storage
      .from(supabaseStorageBucket)
      .upload(objectPath, body, {
        contentType: resolveContentType(file),
        cacheControl: '31536000',
        upsert: false,
      });
    if (error) {
      const uploadError = new Error(
        `Supabase storage upload failed: ${error.message}`,
      );
      uploadError.status = 502;
      throw uploadError;
    }

    const { data } = supabase.storage
      .from(supabaseStorageBucket)
      .getPublicUrl(objectPath);
    if (!data?.publicUrl) {
      const urlError = new Error(
        'Supabase storage did not return a public URL',
      );
      urlError.status = 502;
      throw urlError;
    }
    return data.publicUrl;
  } finally {
    await fs.promises.rm(file.path, { force: true }).catch(() => {});
  }
}

const router = Router();

const movieSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  synopsis: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  language: z.string().optional(),
  genre: z.string().optional(),
  certification: z.string().optional(),
  releaseDate: z.string().optional(),
  status: z.enum(['draft', 'pending', 'published', 'archived']).optional(),
});

// Public
router.get('/', async (req, res, next) => {
  try { res.json(await movies.listPublished()); } catch (e) { next(e); }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id);
    const options = { publicOnly: !req.user?.roles?.includes('ADMIN') };
    if (!isUuid) {
      return res.json(await movies.getBySlug(req.params.id, options));
    }
    res.json(await movies.getById(req.params.id, options));
  } catch (e) { next(e); }
});

router.post('/:id/media', requireAuth, requireRole('ADMIN'), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      // Multer errors (bad mime type, file too large) are client errors.
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err.message || 'Upload rejected' });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id);
    if (!isUuid) return res.status(400).json({ error: 'invalid movie id' });
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const type = req.body.type || 'poster';
    let url;
    if (isSupabaseStorageEnabled()) {
      url = await uploadToSupabase(req.file, req.params.id, type);
    } else if (process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: 'konkani_samudai' });
      url = result.secure_url;
      fs.unlinkSync(req.file.path);
    } else {
      if (isEphemeralFs) {
        fs.unlinkSync(req.file.path);
        res.status(503).json({
          error:
            'media storage is not configured; set SUPABASE_STORAGE_BUCKET with Supabase credentials, or configure Cloudinary',
        });
        return;
      }
      const ext = path.extname(req.file.originalname) || '';
      const newName = req.file.filename + ext;
      const newPath = path.join(uploadDir, newName);
      fs.renameSync(req.file.path, newPath);
      url = `/uploads/${newName}`;
    }
    await movies.addMedia(req.params.id, type, url);
    res.status(201).json({ url });
  } catch (e) { next(e); }
});

// Admin
router.post('/', requireAuth, requireRole('ADMIN'), validate(movieSchema), async (req, res, next) => {
  try { res.status(201).json(await movies.createMovie(req.body)); } catch (e) { next(e); }
});

router.patch('/:id', requireAuth, requireRole('ADMIN'), validate(movieSchema.partial()), async (req, res, next) => {
  try { res.json(await movies.updateMovie(req.params.id, req.body)); } catch (e) { next(e); }
});

export default router;
