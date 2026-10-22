import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';
import { z } from 'zod';
import * as movies from './service.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
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
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

// Public
router.get('/', async (req, res, next) => {
  try { res.json(await movies.listPublished()); } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id);
    if (!isUuid) {
      return res.json(await movies.getBySlug(req.params.id));
    }
    res.json(await movies.getById(req.params.id));
  } catch (e) { next(e); }
});

router.post('/:id/media', requireAuth, requireRole('ADMIN'), upload.single('file'), async (req, res, next) => {
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id);
    if (!isUuid) return res.status(400).json({ error: 'invalid movie id' });
    if (!req.file) return res.status(400).json({ error: 'no file' });
    const type = req.body.type || 'poster';
    let url;
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: 'konkani_samudai' });
      url = result.secure_url;
      fs.unlinkSync(req.file.path);
    } else {
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
