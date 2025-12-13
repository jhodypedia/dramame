// routes/api.js
import express from 'express';
import {
  getForYou,
  getNew,
  getRank,
  getClassify,
  searchDrama,
  suggestDrama,
  getChapters,
  getChaptersDetail,
  getWatch,
  postWatchPlayer
} from '../services/dramaboxService.js';

import { ADSTERRA_DIRECTLINK, ADSTERRA_FREQ } from '../config/index.js';

const router = express.Router();

/**
 * Helper mapping list item dari Dramabox
 */
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

/**
 * Inject ad info (frontend boleh pakai untuk redirect).
 * - freq: redirect setiap N aksi (misal setiap 5 klik)
 */
function withAdMeta(payload = {}) {
  const freq = Number.isFinite(ADSTERRA_FREQ) && ADSTERRA_FREQ > 0 ? ADSTERRA_FREQ : 0;

  return {
    ...payload,
    ad: {
      enabled: !!ADSTERRA_DIRECTLINK,
      redirect: ADSTERRA_DIRECTLINK || '',
      freq
    }
  };
}

/**
 * Safe parse helpers
 */
function toNum(v, def = 1) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/* ===========================
 * LISTING
 * =========================== */

// GET /api/videos/foryou?page=1
router.get('/videos/foryou', async (req, res) => {
  try {
    const page = toNum(req.query.page, 1);
    const data = await getForYou(page);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json(withAdMeta({ page, hasMore, total, items }));
  } catch (err) {
    console.error('foryou error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil data For You' });
  }
});

// GET /api/videos/new?page=1&pageSize=10
router.get('/videos/new', async (req, res) => {
  try {
    const page = toNum(req.query.page, 1);
    const pageSize = toNum(req.query.pageSize, 10);
    const data = await getNew(page, pageSize);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json(withAdMeta({ page, hasMore, total, items }));
  } catch (err) {
    console.error('new error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil data Terbaru' });
  }
});

// GET /api/videos/rank?page=1
router.get('/videos/rank', async (req, res) => {
  try {
    const page = toNum(req.query.page, 1);
    const data = await getRank(page);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json(withAdMeta({ page, hasMore, total, items }));
  } catch (err) {
    console.error('rank error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil data Rank' });
  }
});

/**
 * ✅ DOC: /api/classify?lang=in&pageNo=1&genre=1357&sort=1
 * GET /api/classify?pageNo=1&genre=1357&sort=1
 */
router.get('/classify', async (req, res) => {
  try {
    const pageNo = toNum(req.query.pageNo, 1);
    const genre = req.query.genre;
    const sort = toNum(req.query.sort, 1);

    if (!genre) {
      return res.status(400).json({ error: 'Missing genre' });
    }

    const data = await getClassify({ pageNo, genre, sort });

    const list = data?.data?.list || data?.data?.bookList || [];
    const items = Array.isArray(list) ? list.map(mapBookItem) : [];
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json(withAdMeta({ pageNo, genre, sort, hasMore, total, items }));
  } catch (err) {
    console.error('classify error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil data Classify' });
  }
});

/* ===========================
 * SEARCH + SUGGEST (DOC)
 * =========================== */

// GET /api/search?q=ceo&page=1  (proxy internal -> doc /api/search/{keyword}/{page}?lang=in)
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const page = toNum(req.query.page, 1);
    if (!q) return res.json(withAdMeta({ page: 1, hasMore: false, total: 0, items: [] }));

    const data = await searchDrama(q, page);

    const list = data?.data?.list || [];
    const items = list.map(mapBookItem);
    const hasMore = !!data?.data?.isMore;
    const total = data?.data?.total ?? items.length;

    res.json(withAdMeta({ page, hasMore, total, items }));
  } catch (err) {
    console.error('search error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal mencari data' });
  }
});

// GET /api/suggest?q=cinta  (proxy internal -> doc /api/suggest/{keyword}?lang=in)
router.get('/suggest', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ items: [] });

    const data = await suggestDrama(q);

    // Karena bentuk response suggest bisa beda-beda,
    // kita normalize jadi array string/object.
    const raw =
      data?.data?.list ||
      data?.data?.items ||
      data?.data ||
      [];

    const items = Array.isArray(raw) ? raw : [];

    res.json(withAdMeta({ items }));
  } catch (err) {
    console.error('suggest error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil suggest' });
  }
});

/* ===========================
 * CHAPTERS
 * =========================== */

// GET /api/chapters?bookId=42000000722
router.get('/chapters', async (req, res) => {
  try {
    const bookId = req.query.bookId;
    if (!bookId) return res.status(400).json({ error: 'Missing bookId' });

    const data = await getChapters(bookId);
    const d = data?.data || {};
    const chapters = d.chapterList || [];

    res.json(withAdMeta({
      bookId,
      title: d.bookName,
      cover: d.cover,
      introduction: d.introduction,
      chapterCount: d.chapterCount,
      chapters: chapters.map((c) => ({
        index: c.chapterIndex,
        name: c.chapterName || c.name || null,
        isFree: c.isFree,
        duration: c.duration || null
      }))
    }));
  } catch (err) {
    console.error('chapters error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil daftar episode' });
  }
});

// ✅ DOC: /api/chapters/detail/{bookId}?lang=in
// GET /api/chapters/detail?bookId=42000000722
router.get('/chapters/detail', async (req, res) => {
  try {
    const bookId = req.query.bookId;
    if (!bookId) return res.status(400).json({ error: 'Missing bookId' });

    const data = await getChaptersDetail(bookId);
    const d = data?.data || {};

    // response detail biasanya lebih lengkap; kita kirim apa adanya + beberapa normalisasi
    res.json(withAdMeta({
      bookId,
      title: d.bookName || d.title || null,
      cover: d.cover || null,
      introduction: d.introduction || d.desc || '',
      chapterCount: d.chapterCount || 0,
      raw: d
    }));
  } catch (err) {
    console.error('chapters detail error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil detail chapters' });
  }
});

/* ===========================
 * WATCH
 * =========================== */

// GET /api/watch?bookId=42000000722&chapterIndex=0&source=search_result
router.get('/watch', async (req, res) => {
  try {
    const bookId = req.query.bookId;
    const chapterIndex = toNum(req.query.chapterIndex, 0);
    const source = (req.query.source || 'search_result').trim();

    if (!bookId) return res.status(400).json({ error: 'Missing bookId' });

    const data = await getWatch(bookId, chapterIndex, source);
    const d = data?.data || {};

    let videoUrl = d.videoUrl || '';
    if (!videoUrl && Array.isArray(d.qualities) && d.qualities.length) {
      const defaultQ = d.qualities.find((q) => q.isDefault === 1) || d.qualities[0];
      videoUrl = defaultQ?.videoPath || defaultQ?.url || defaultQ?.playUrl || '';
    }

    res.json(withAdMeta({
      bookId,
      chapterIndex,
      source,
      videoUrl,
      qualities: d.qualities || [],
      raw: d
    }));
  } catch (err) {
    console.error('watch error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil video' });
  }
});

// ✅ DOC: POST /api/watch/player?lang=in
// POST /api/watch/player
// body: { bookId, chapterIndex, lang }
router.post('/watch/player', async (req, res) => {
  try {
    const { bookId, chapterIndex, lang } = req.body || {};
    if (!bookId && bookId !== 0) return res.status(400).json({ error: 'Missing bookId' });

    const idx = toNum(chapterIndex, 0);

    const data = await postWatchPlayer({
      bookId: String(bookId),
      chapterIndex: idx,
      lang: (lang || '').trim() || undefined
    });

    // balikkan response apa adanya supaya frontend gampang ambil url player/token
    res.json(withAdMeta({ data }));
  } catch (err) {
    console.error('watch player error:', err?.response?.status, err?.message);
    res.status(err?.response?.status || 500).json({ error: 'Gagal ambil player' });
  }
});

export default router;
