// services/dramaboxService.js
import axios from 'axios';
import { DRAMABOX_BASE_URL, DRAMABOX_LANG } from '../config/index.js';

export async function getForYou(page = 1) {
  const url = `${DRAMABOX_BASE_URL}/api/foryou/${page}?lang=${DRAMABOX_LANG}`;
  const { data } = await axios.get(url);
  return data;
}

export async function getNew(page = 1) {
  const url = `${DRAMABOX_BASE_URL}/api/new/${page}?lang=${DRAMABOX_LANG}&pageSize=10`;
  const { data } = await axios.get(url);
  return data;
}

export async function getRank(page = 1) {
  const url = `${DRAMABOX_BASE_URL}/api/rank/${page}?lang=${DRAMABOX_LANG}`;
  const { data } = await axios.get(url);
  return data;
}

export async function searchDrama(keyword, page = 1) {
  const url = `${DRAMABOX_BASE_URL}/api/search/${encodeURIComponent(
    keyword
  )}/${page}?lang=${DRAMABOX_LANG}`;
  const { data } = await axios.get(url);
  return data;
}

export async function getChapters(bookId) {
  const url = `${DRAMABOX_BASE_URL}/api/chapters/${bookId}?lang=${DRAMABOX_LANG}`;
  const { data } = await axios.get(url);
  return data;
}

export async function getWatch(bookId, chapterIndex = 0) {
  const url = `${DRAMABOX_BASE_URL}/api/watch/${bookId}/${chapterIndex}?lang=${DRAMABOX_LANG}&source=web_reels`;
  const { data } = await axios.get(url);
  return data;
}
