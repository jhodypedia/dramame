// routes/pages.js
import express from 'express';
import {
  ADSTERRA_DIRECTLINK,
  ADSTERRA_FREQ
} from '../config/index.js';

const router = express.Router();

router.get('/', (req, res) => {
  res.render('index', {
    title: 'DramaMe | Pusat Drama China Gratis',
    adDirectLink: ADSTERRA_DIRECTLINK,
    adFrequency: ADSTERRA_FREQ
  });
});

export default router;
