// routes/api.js
import express from 'express';
import {
  getForYou,
  getNew,
  getRank,
  searchDrama,
  getChapters,
  getWatch
} from '../services/dramaboxService.js';

const router = express.Router();

// helper mapping list item dari Dramabox
function mapBookItem(item = {}) {
  return {
    id: item.bookId,
    bookId: item.bookId,
    title: item.bookName,
    description: item.introduction || '',
    thumbnail: item.cover || '',
    chapterCount: item.chapterCount || 0,
    playCount: item.playCount || '',
    corner: item.corner || null // { cornerType, name, color }
  };
}

// GET /api/videos/foryou?page=1
router.get('/videos/foryou', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const data = await getForYou(page);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json({ page, hasMore, total, items });
  } catch (err) {
    console.error('foryou error:', err?.response?.status, err?.message);
    res.status(500).json({ error: 'Gagal ambil data For You' });
  }
});

// GET /api/videos/new?page=1
router.get('/videos/new', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const data = await getNew(page);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json({ page, hasMore, total, items });
  } catch (err) {
    console.error('new error:', err?.response?.status, err?.message);
    res.status(500).json({ error: 'Gagal ambil data Terbaru' });
  }
});

// GET /api/videos/rank?page=1
router.get('/videos/rank', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const data = await getRank(page);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json({ page, hasMore, total, items });
  } catch (err) {
    console.error('rank error:', err?.response?.status, err?.message);
    res.status(500).json({ error: 'Gagal ambil data Rank' });
  }
});

// GET /api/search?q=ceo&page=1
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const page = Number(req.query.page || 1);
    if (!q) return res.json({ page: 1, hasMore: false, total: 0, items: [] });

    const data = await searchDrama(q, page);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json({ page, hasMore, total, items });
  } catch (err) {
    console.error('search error:', err?.response?.status, err?.message);
    res.status(500).json({ error: 'Gagal mencari data' });
  }
});

// GET /api/chapters?bookId=42000000722
router.get('/chapters', async (req, res) => {
  try {
    const bookId = req.query.bookId;
    if (!bookId) {
      return res.status(400).json({ error: 'Missing bookId' });
    }

    const data = await getChapters(bookId);
    const d = data?.data || {};
    const chapters = d.chapterList || [];

    res.json({
      bookId,
      title: d.bookName,
      cover: d.cover,
      introduction: d.introduction,
      chapterCount: d.chapterCount,
      chapters: chapters.map((c) => ({
        index: c.chapterIndex,
        // 🔥 fallback kalau nama kosong → biar nggak "undefined"
        name: c.chapterName || c.name || null,
        isFree: c.isFree,
        duration: c.duration || null
      }))
    });
  } catch (err) {
    console.error('chapters error:', err?.response?.status, err?.message);
    res.status(500).json({ error: 'Gagal ambil daftar episode' });
  }
});

// GET /api/watch?bookId=42000000722&chapterIndex=0
router.get('/watch', async (req, res) => {
  try {
    const bookId = req.query.bookId;
    const chapterIndex = Number(req.query.chapterIndex || 0);
    if (!bookId) {
      return res.status(400).json({ error: 'Missing bookId' });
    }

    const data = await getWatch(bookId, chapterIndex);
    const d = data?.data || {};

    let videoUrl = d.videoUrl || '';
    if (!videoUrl && Array.isArray(d.qualities) && d.qualities.length) {
      const defaultQ =
        d.qualities.find((q) => q.isDefault === 1) || d.qualities[0];
      videoUrl =
        defaultQ?.videoPath || defaultQ?.url || defaultQ?.playUrl || '';
    }

    res.json({
      bookId,
      chapterIndex,
      videoUrl,
      qualities: d.qualities || []
    });
  } catch (err) {
    console.error('watch error:', err?.response?.status, err?.message);
    res.status(500).json({ error: 'Gagal ambil video' });
  }
});

export default router;
