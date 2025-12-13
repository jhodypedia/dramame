// services/dramaboxService.js
import axios from 'axios';
import {
  DRAMABOX_BASE_URL,
  DRAMABOX_LANG,
  DRAMABOX_TOKEN
} from '../config/index.js';

/**
 * Axios instance (Bearer required)
 */
const api = axios.create({
  baseURL: DRAMABOX_BASE_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    Authorization: `Bearer ${DRAMABOX_TOKEN}`,
    'User-Agent': 'Dramabox-Web'
  }
});

/**
 * Helpers
 */
async function get(url, params = {}) {
  try {
    const { data } = await api.get(url, { params });
    return data;
  } catch (err) {
    console.error('[Dramabox GET Error]', {
      url,
      params,
      status: err.response?.status,
      message: err.response?.data || err.message
    });
    throw err;
  }
}

async function post(url, body = {}, params = {}) {
  try {
    const { data } = await api.post(url, body, {
      params,
      headers: { 'Content-Type': 'application/json' }
    });
    return data;
  } catch (err) {
    console.error('[Dramabox POST Error]', {
      url,
      params,
      body,
      status: err.response?.status,
      message: err.response?.data || err.message
    });
    throw err;
  }
}

/**
 * Existing endpoints (opsional, kalau kamu masih pakai)
 */
export function getForYou(page = 1, lang = DRAMABOX_LANG) {
  return get(`/api/foryou/${page}`, { lang });
}

export function getNew(page = 1, pageSize = 10, lang = DRAMABOX_LANG) {
  return get(`/api/new/${page}`, { lang, pageSize });
}

export function getRank(page = 1, lang = DRAMABOX_LANG) {
  return get(`/api/rank/${page}`, { lang });
}

export function getClassify({ pageNo = 1, genre, sort = 1, lang = DRAMABOX_LANG } = {}) {
  return get('/api/classify', { lang, pageNo, genre, sort });
}

/**
 * ✅ DOC: /api/search/{keyword}/{page}?lang=in
 * curl -X GET "https://sementara.site/api/search/ceo/1?lang=in"
 */
export function searchDrama(keyword, page = 1, lang = DRAMABOX_LANG) {
  return get(`/api/search/${encodeURIComponent(keyword)}/${page}`, { lang });
}

/**
 * ✅ DOC: /api/suggest/{keyword}?lang=in
 * curl -X GET "https://sementara.site/api/suggest/cinta?lang=in"
 */
export function suggestDrama(keyword, lang = DRAMABOX_LANG) {
  return get(`/api/suggest/${encodeURIComponent(keyword)}`, { lang });
}

/**
 * ✅ DOC: /api/chapters/{bookId}?lang=in
 * curl -X GET "https://sementara.site/api/chapters/42000000722?lang=in"
 */
export function getChapters(bookId, lang = DRAMABOX_LANG) {
  return get(`/api/chapters/${bookId}`, { lang });
}

/**
 * ✅ DOC: /api/chapters/detail/{bookId}?lang=in
 * curl -X GET "https://sementara.site/api/chapters/detail/42000000722?lang=in"
 */
export function getChaptersDetail(bookId, lang = DRAMABOX_LANG) {
  return get(`/api/chapters/detail/${bookId}`, { lang });
}

/**
 * ✅ DOC: /api/watch/{bookId}/{chapterIndex}?lang=in&source=search_result
 * curl -X GET "https://sementara.site/api/watch/42000000722/0?lang=in&source=search_result"
 */
export function getWatch(bookId, chapterIndex = 0, source = 'search_result', lang = DRAMABOX_LANG) {
  return get(`/api/watch/${bookId}/${chapterIndex}`, { lang, source });
}

/**
 * ✅ DOC: POST /api/watch/player?lang=in
 * curl -X POST "https://sementara.site/api/watch/player?lang=in"
 * -d '{"bookId":"42000000722","chapterIndex":10,"lang":"in"}'
 *
 * Catatan: doc body mengirim lang juga; aku support dua-duanya:
 * - params lang (query)
 * - body lang (payload)
 */
export function postWatchPlayer(
  { bookId, chapterIndex = 0, lang = DRAMABOX_LANG } = {},
  queryLang = DRAMABOX_LANG
) {
  return post('/api/watch/player', { bookId, chapterIndex, lang }, { lang: queryLang });
}
