// routes/pages.js
import express from 'express';
import {
  ADSTERRA_DIRECTLINK,
  ADSTERRA_FREQ
} from '../config/index.js';

const router = express.Router();

/**
 * Genre list (statis).
 * Kamu bisa ganti sesuai kebutuhan (id mengikuti parameter "genre" di endpoint classify).
 * Contoh yang kamu kirim: genre=1357
 */
const GENRES = [
  { id: 1357, name: 'Romance' },
  { id: 1201, name: 'Action' },
  { id: 1202, name: 'Comedy' },
  { id: 1203, name: 'Drama' },
  { id: 1204, name: 'Fantasy' },
  { id: 1205, name: 'Thriller' },
  { id: 1206, name: 'Mystery' },
  { id: 1207, name: 'Family' },
  { id: 1208, name: 'School' },
  { id: 1209, name: 'Historical' }
];

// Home
router.get('/', (req, res) => {
  // optional: kamu bisa taruh script/banner dari DB nantinya
  const adTopHtml = ''; // contoh: '<div>banner</div>'
  const adFloatingHtml = ''; // kalau mau override default script di index.ejs

  res.render('index', {
    title: 'PansaDrama — Short Streaming',
    adDirectLink: ADSTERRA_DIRECTLINK,
    adFrequency: ADSTERRA_FREQ,

    // genre list untuk modal
    genres: GENRES,

    // optional
    adTopHtml,
    adFloatingHtml
  });
});

export default router;
