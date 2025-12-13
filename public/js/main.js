// public/js/main.js
$(function () {
  /* ===================== DOM ===================== */
  const $feed = $('#reelContainer');
  const $loadingOverlay = $('#loadingOverlay');
  const $tabs = $('.bottom-nav .tab-btn');

  // streaming extras
  const $lazySentinel = $('#lazySentinel');
  const $openSearchBtn = $('#openSearchBtn');
  const $heroPlayBtn = $('#heroPlayBtn');
  const $heroRefreshBtn = $('#heroRefreshBtn');
  const $sortChips = $('.filter-row .chip[data-sort]');
  const $openGenreBtn = $('#openGenreBtn');

  // Detail modal
  const $modal = $('#detailModal');
  const $modalTitle = $('#modalTitle');
  const $modalCurrentEpisode = $('#modalCurrentEpisode');
  const $playerVideo = $('#playerVideo');
  const $playerLoading = $('#playerLoading');

  // Player controls
  const $playPauseBtn = $('#playPauseBtn');
  const $seekBar = $('#seekBar');
  const $currentTimeLabel = $('#currentTimeLabel');
  const $durationLabel = $('#durationLabel');
  const $muteBtn = $('#muteBtn');
  const $fullscreenBtn = $('#fullscreenBtn');
  const $videoShell = $('.video-shell');

  // Episode bottom sheet
  const $openEpisodeListBtn = $('#openEpisodeListBtn');
  const $episodeListModal = $('#episodeListModal');
  const $episodeGrid = $('#episodeGrid');
  const $episodeModalTitle = $('#episodeModalTitle');

  // Search modal
  const $searchModal = $('#searchModal');
  const $searchModalInput = $('#searchModalInput');
  const $searchModalBtn = $('#searchModalBtn');
  const $suggestList = $('#suggestList');

  // Genre modal
  const $genreModal = $('#genreModal');
  const $genreGrid = $('#genreGrid');
  const $closeGenreBtn = $('#closeGenreBtn');

  /* ===================== STATE ===================== */
  let currentTab = 'foryou';
  let currentPage = 0;        // for foryou/new/rank/search
  let currentPageNo = 0;      // for classify
  let hasMore = true;
  let isLoading = false;

  let currentSearch = '';
  let currentGenreId = null;
  let currentGenreName = '';
  let currentSort = 1; // 1 populer, 2 terbaru

  let activeBookId = null;
  let lastLoadedChapterIndex = null;
  let resumeFromTime = null;

  let chaptersData = [];
  let totalEpisodes = 0;
  let currentBookTitle = '';
  let activeBookCover = '';

  /* ===================== AD META (from backend or window) ===================== */
  let AD_DIRECTLINK = window.AD_DIRECTLINK || '';
  let AD_FREQUENCY = Number(window.AD_FREQUENCY || 5) || 5;

  function applyAdMeta(res) {
    if (!res || !res.ad) return;
    AD_DIRECTLINK = res.ad.redirect || AD_DIRECTLINK || '';
    AD_FREQUENCY = Number(res.ad.freq || AD_FREQUENCY || 5) || 5;
    window.AD_DIRECTLINK = AD_DIRECTLINK;
    window.AD_FREQUENCY = AD_FREQUENCY;
  }

  /* ===================== WAKE LOCK ===================== */
  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => (wakeLock = null));
      }
    } catch {}
  }
  async function releaseWakeLock() {
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch {}
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const v = $playerVideo.get(0);
      if (v && !v.paused) requestWakeLock();
    } else {
      releaseWakeLock();
    }
  });

  /* ===================== LOADING ===================== */
  function showLoading(show) {
    $loadingOverlay.toggleClass('visible', !!show);
  }

  /* ===================== PROGRESS (localStorage) ===================== */
  function progressKey(bookId) {
    return `dramabox_progress_${bookId}`;
  }
  function saveProgress(bookId, chapterIndex, currentTime) {
    if (!bookId) return;
    try {
      localStorage.setItem(
        progressKey(bookId),
        JSON.stringify({
          chapterIndex: Number(chapterIndex) || 0,
          currentTime: Number(currentTime) || 0,
          updatedAt: Date.now()
        })
      );
    } catch {}
  }
  function loadProgress(bookId) {
    if (!bookId) return null;
    try {
      const raw = localStorage.getItem(progressKey(bookId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  function clearProgress(bookId) {
    if (!bookId) return;
    try {
      localStorage.removeItem(progressKey(bookId));
    } catch {}
  }

  /* ===================== HISTORY ===================== */
  const HISTORY_KEY = 'dramabox_history_v1';
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  function saveHistory(arr) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(arr || []));
    } catch {}
  }
  function updateHistoryEntry() {
    if (!activeBookId) return;
    const history = loadHistory();
    const epIndex = Number(lastLoadedChapterIndex) || 0;
    const epNum = epIndex + 1;

    const filtered = history.filter((h) => h.bookId !== activeBookId);
    filtered.unshift({
      bookId: activeBookId,
      title: currentBookTitle || '',
      cover: activeBookCover || '',
      lastEpisodeIndex: epIndex,
      totalEpisodes: totalEpisodes || (chaptersData ? chaptersData.length : 0),
      lastEpisodeLabel: `Episode ${epNum}`,
      updatedAt: Date.now()
    });
    saveHistory(filtered.slice(0, 30));
  }
  function buildHistoryCardHTML(entry) {
    const escTitle = $('<div>').text(entry.title || '').html();
    const desc = entry.totalEpisodes
      ? `${entry.lastEpisodeLabel} dari ${entry.totalEpisodes} episode`
      : entry.lastEpisodeLabel;

    return `
      <article class="stream-card history-card"
        data-book-id="${entry.bookId}"
        data-title="${escTitle}"
        data-cover="${entry.cover || ''}"
        data-history-episode="${entry.lastEpisodeIndex || 0}">
        <div class="card-poster">
          <img src="${entry.cover || ''}" loading="lazy" alt="${escTitle}">
          <div class="card-overlay"></div>
          <div class="history-pill">Lanjut</div>
        </div>
        <div class="card-info">
          <h3 class="card-title">${escTitle}</h3>
          <div class="card-meta">${desc}</div>
        </div>
      </article>
    `;
  }
  function renderHistoryTab() {
    const history = loadHistory();
    if (!history.length) {
      $feed.html(
        '<div style="padding:16px;text-align:center;opacity:0.8;">Belum ada riwayat tontonan.</div>'
      );
      return;
    }
    $feed.html(history.map(buildHistoryCardHTML).join(''));
  }

  /* ===================== AD COUNTER (lebih aman) ===================== */
  function adShownKey(bookId, chapterIndex) {
    return `dramabox_ad_shown_${bookId}_${chapterIndex}`;
  }
  function globalEpisodeCounterKey() {
    return 'dramabox_global_episode_counter';
  }
  function getEpisodeCounter() {
    try {
      return parseInt(localStorage.getItem(globalEpisodeCounterKey()) || '0', 10);
    } catch {
      return 0;
    }
  }
  function setEpisodeCounter(v) {
    try {
      localStorage.setItem(globalEpisodeCounterKey(), String(v));
    } catch {}
  }

  let adArmed = false;

  function episodeAdAlreadyShown(bookId, chapterIndex) {
    try {
      return localStorage.getItem(adShownKey(bookId, chapterIndex)) === '1';
    } catch {
      return false;
    }
  }
  function markEpisodeAdShown(bookId, chapterIndex) {
    try {
      localStorage.setItem(adShownKey(bookId, chapterIndex), '1');
    } catch {}
  }

  function registerEpisodeWatched() {
    let count = getEpisodeCounter();
    count += 1;
    const freq = Number(AD_FREQUENCY || 5) || 5;
    if (count >= freq) {
      localStorage.setItem('dramabox_episode_trigger', '1');
      count = 0;
    }
    setEpisodeCounter(count);
  }

  function armAdForEpisode(bookId, chapterIndex) {
    if (!AD_DIRECTLINK) {
      adArmed = false;
      return;
    }
    if (episodeAdAlreadyShown(bookId, chapterIndex)) {
      adArmed = false;
      return;
    }
    const triggered = localStorage.getItem('dramabox_episode_trigger') === '1';
    if (triggered) {
      adArmed = true;
      markEpisodeAdShown(bookId, chapterIndex);
      localStorage.removeItem('dramabox_episode_trigger');
    } else {
      adArmed = false;
    }
  }

  /* ===================== STREAM CARD BUILDER ===================== */
  function buildCardHTML(item) {
    const escTitle = $('<div>').text(item.title || '').html();
    const thumb = item.thumbnail || '';
    const eps = Number(item.chapterCount || 0) || 0;

    return `
      <article class="stream-card"
        data-book-id="${item.bookId}"
        data-title="${escTitle}"
        data-cover="${thumb}">
        <div class="card-poster">
          <img src="${thumb}" loading="lazy" alt="${escTitle}">
          <div class="card-overlay"></div>
        </div>
        <div class="card-info">
          <h3 class="card-title">${escTitle}</h3>
          <div class="card-meta">${eps} eps</div>
        </div>
      </article>
    `;
  }

  function renderSkeleton(count) {
    const n = count || 10;
    let html = '';
    for (let i = 0; i < n; i++) {
      html += `
        <article class="stream-card skeleton">
          <div class="card-poster">
            <div class="sk-box"></div>
          </div>
          <div class="card-info">
            <div class="sk-line"></div>
            <div class="sk-line short"></div>
          </div>
        </article>
      `;
    }
    return html;
  }

  /* ===================== API URL + PAGING ===================== */
  function getApiUrl() {
    if (currentTab === 'new') return '/api/videos/new';
    if (currentTab === 'rank') return '/api/videos/rank';
    if (currentTab === 'search')
      return `/api/search?q=${encodeURIComponent(currentSearch)}`;
    if (currentTab === 'genre') return '/api/classify';
    return '/api/videos/foryou';
  }

  function getNextPageParam(append) {
    if (currentTab === 'genre') {
      const nextPageNo = append ? currentPageNo + 1 : 1;
      return { pageNo: nextPageNo };
    }
    const nextPage = append ? currentPage + 1 : 1;
    return { page: nextPage };
  }

  function setCurrentPageFromRes(append, res) {
    if (currentTab === 'genre') {
      const p = Number(res.pageNo || res.page || 1) || 1;
      currentPageNo = p;
      return;
    }
    const p = Number(res.page || 1) || 1;
    currentPage = p;
  }

  /* ===================== FETCH (LAZY LOAD) ===================== */
  function fetchPage(append = false) {
    if (currentTab === 'history') return;
    if (isLoading) return;

    if (!append) {
      currentPage = 0;
      currentPageNo = 0;
      hasMore = true;
      // skeleton initial
      $feed.html(renderSkeleton(10));
    }
    if (!hasMore && append) return;

    const url = getApiUrl();
    const params = getNextPageParam(append);

    // extra params
    if (currentTab === 'search') {
      // page already set in params
    }
    if (currentTab === 'genre') {
      params.genre = currentGenreId;
      params.sort = currentSort;
    }

    isLoading = true;

    if (!append) showLoading(true);

    $.ajax({
      url,
      method: 'GET',
      data: params
    })
      .done((res) => {
        applyAdMeta(res);

        hasMore = !!res.hasMore;
        const items = res.items || [];

        const html = items.map(buildCardHTML).join('');

        if (!append) {
          if (!items.length) {
            $feed.html(
              '<div style="padding:16px;text-align:center;opacity:0.8;">Tidak ada data.</div>'
            );
          } else {
            $feed.html(html);
          }
        } else if (items.length) {
          $feed.append(html);
        }

        setCurrentPageFromRes(append, res);
      })
      .fail(() => {
        if (!append) {
          $feed.html(
            '<div style="padding:16px;text-align:center;opacity:0.8;">Gagal memuat data.</div>'
          );
        }
        hasMore = false;
      })
      .always(() => {
        isLoading = false;
        if (!append) showLoading(false);
      });
  }

  /* ===================== LAZY LOAD OBSERVER ===================== */
  function setupLazyObserver() {
    const el = $lazySentinel.get(0);
    if (!el) return;

    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries || !entries[0] || !entries[0].isIntersecting) return;
          if (currentTab === 'history') return;
          if (!hasMore || isLoading) return;
          fetchPage(true);
        },
        { root: null, rootMargin: '250px', threshold: 0.01 }
      );
      io.observe(el);
    } else {
      // fallback: scroll
      $(window).on('scroll', function () {
        if (currentTab === 'history') return;
        if (!hasMore || isLoading) return;
        const nearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 600;
        if (nearBottom) fetchPage(true);
      });
    }
  }

  /* ===================== SEARCH (MODAL + SUGGEST) ===================== */
  let suggestTimer = null;

  function openSearchModal() {
    $searchModal.addClass('visible');
    setTimeout(() => $searchModalInput.val('').focus(), 100);
    $suggestList.hide().empty();
  }

  function closeSearchModal() {
    $searchModal.removeClass('visible');
    $suggestList.hide().empty();
  }

  function renderSuggest(items) {
    if (!items || !items.length) {
      $suggestList.hide().empty();
      return;
    }
    const html = items.slice(0, 10).map((it) => {
      const text = typeof it === 'string' ? it : (it.keyword || it.word || it.title || '');
      const esc = $('<div>').text(text).html();
      return `<div class="suggest-item" data-text="${esc}">${esc}</div>`;
    }).join('');
    $suggestList.html(html).show();
  }

  function fetchSuggest(q) {
    $.ajax({
      url: '/api/suggest',
      method: 'GET',
      data: { q }
    })
      .done((res) => {
        applyAdMeta(res);
        renderSuggest(res.items || []);
      })
      .fail(() => renderSuggest([]));
  }

  function runSearch() {
    const q = ($searchModalInput.val() || '').trim();
    if (!q) return;

    currentTab = 'search';
    currentSearch = q;
    currentGenreId = null;
    currentGenreName = '';

    $tabs.removeClass('active');
    $tabs.filter('[data-tab="search"]').addClass('active');

    closeSearchModal();
    fetchPage(false);
    window.scrollTo(0, 0);
  }

  $searchModalInput.on('input', function () {
    const q = $(this).val().trim();
    clearTimeout(suggestTimer);
    if (!q) {
      renderSuggest([]);
      return;
    }
    suggestTimer = setTimeout(() => fetchSuggest(q), 250);
  });

  $suggestList.on('click', '.suggest-item', function () {
    const t = $(this).data('text') || $(this).text() || '';
    if (!t) return;
    $searchModalInput.val(t);
    renderSuggest([]);
    runSearch();
  });

  $searchModalBtn.on('click', runSearch);
  $searchModalInput.on('keypress', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  $searchModal.on('click', function (e) {
    if (!$(e.target).closest('.search-modal-box').length) {
      closeSearchModal();
      // kalau tab search aktif tapi belum ada currentSearch, balik foryou
      if (currentTab === 'search' && !currentSearch) {
        currentTab = 'foryou';
        $tabs.removeClass('active');
        $tabs.filter('[data-tab="foryou"]').addClass('active');
        fetchPage(false);
      }
    }
  });

  $openSearchBtn.on('click', openSearchModal);

  /* ===================== GENRE (MODAL + CLASSIFY) ===================== */
  function openGenreModal() {
    $genreModal.addClass('visible');
  }
  function closeGenreModal() {
    $genreModal.removeClass('visible');
  }

  function renderGenres() {
    const list = window.__GENRE_LIST__ || [];
    if (!list.length) {
      $genreGrid.html('<div style="opacity:.7;padding:10px;">Genre belum tersedia.</div>');
      return;
    }
    const html = list.map((g) => {
      return `<button class="genre-chip" type="button" data-id="${g.id}" data-name="${g.name}">${g.name}</button>`;
    }).join('');
    $genreGrid.html(html);
  }

  $genreGrid.on('click', '.genre-chip', function () {
    const id = $(this).data('id');
    const name = $(this).data('name') || '';
    if (!id) return;

    currentTab = 'genre';
    currentGenreId = id;
    currentGenreName = name;

    $tabs.removeClass('active');
    $tabs.filter('[data-tab="genre"]').addClass('active');

    closeGenreModal();
    fetchPage(false);
    window.scrollTo(0, 0);
  });

  $openGenreBtn.on('click', openGenreModal);
  $closeGenreBtn.on('click', closeGenreModal);
  $genreModal.on('click', function (e) {
    if ($(e.target).is('#genreModal')) closeGenreModal();
  });

  // sort chips affect classify tab
  $sortChips.on('click', function () {
    const s = Number($(this).data('sort') || 1) || 1;
    currentSort = s;
    $sortChips.removeClass('active');
    $(this).addClass('active');

    if (currentTab === 'genre' && currentGenreId) {
      fetchPage(false);
      window.scrollTo(0, 0);
    }
  });

  /* ===================== EPISODE UI ===================== */
  function updateCurrentEpisodeLabel() {
    if (activeBookId == null || lastLoadedChapterIndex == null) {
      $modalCurrentEpisode.text('Episode - / -');
      return;
    }
    const total = totalEpisodes || (chaptersData ? chaptersData.length : 0);
    const epNum = (lastLoadedChapterIndex || 0) + 1;
    $modalCurrentEpisode.text(`Episode ${epNum} / ${total || '-'}`);
  }

  function renderEpisodeGrid() {
    if (!chaptersData || !chaptersData.length) {
      $episodeGrid.html(
        '<div style="padding:12px;font-size:13px;opacity:0.8;">Tidak ada episode.</div>'
      );
      return;
    }

    const cards = chaptersData
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((c) => {
        const epNum = c.index + 1;
        const epTitle = c.name || `Episode ${epNum}`;
        const isActive = c.index === lastLoadedChapterIndex;
        const freeBadge = c.isFree
          ? '<span class="ep-badge">Gratis</span>'
          : '';

        return `
          <button class="episode-card${isActive ? ' active' : ''}" data-index="${c.index}">
            <div class="ep-number">Ep ${epNum}</div>
            <div class="ep-title">${$('<div>').text(epTitle).html()}</div>
            ${freeBadge}
          </button>
        `;
      })
      .join('');

    $episodeGrid.html(cards);
  }

  /* ===================== DETAIL MODAL STATE ===================== */
  function resetModalState() {
    activeBookId = null;
    lastLoadedChapterIndex = null;
    resumeFromTime = null;
    chaptersData = [];
    totalEpisodes = 0;
    currentBookTitle = '';
    activeBookCover = '';

    $playerVideo.attr('src', '');
    const v = $playerVideo.get(0);
    if (v) v.pause();

    releaseWakeLock();
    $episodeGrid.empty();
    $modalCurrentEpisode.text('');
  }

  function openDetailModal(bookId, meta, options = {}) {
    resetModalState();
    activeBookId = bookId;

    currentBookTitle = meta?.title || '';
    activeBookCover = meta?.cover || '';
    $modalTitle.text(currentBookTitle || '');

    $modal.addClass('visible');
    showLoading(true);

    $.ajax({
      url: '/api/chapters',
      data: { bookId },
      method: 'GET'
    })
      .done((res) => {
        applyAdMeta(res);

        currentBookTitle = res.title || currentBookTitle || '';
        $modalTitle.text(currentBookTitle || '');
        totalEpisodes = res.chapterCount || (res.chapters?.length || 0);
        chaptersData = res.chapters || [];

        // resume logic:
        // 1) if opened from history card -> take that episode
        // 2) else take saved progress if valid
        // 3) else first episode
        const historyEpisode = options.historyEpisode;
        const progress = loadProgress(bookId);

        let activeIndex =
          chaptersData && chaptersData.length ? chaptersData[0].index : 0;

        if (Number.isFinite(historyEpisode)) {
          activeIndex = Number(historyEpisode) || 0;
          resumeFromTime = (progress && progress.chapterIndex === activeIndex) ? (progress.currentTime || 0) : null;
        } else if (progress && chaptersData.some((c) => c.index === progress.chapterIndex)) {
          activeIndex = progress.chapterIndex;
          resumeFromTime = progress.currentTime || 0;
        } else {
          resumeFromTime = null;
        }

        lastLoadedChapterIndex = activeIndex;
        updateCurrentEpisodeLabel();
        renderEpisodeGrid();

        updateHistoryEntry();
        loadEpisode(activeBookId, activeIndex, { resume: true });
      })
      .fail(() => {
        $episodeGrid.html(
          '<div style="padding:12px;font-size:13px;opacity:0.8;">Gagal memuat episode.</div>'
        );
      })
      .always(() => {
        showLoading(false);
      });
  }

  function closeDetailModal() {
    $modal.removeClass('visible');
    resetModalState();
  }

  $('.modal-close').on('click', closeDetailModal);
  $modal.on('click', function (e) {
    if ($(e.target).is('#detailModal')) closeDetailModal();
  });

  /* ===================== VIDEO PLAY (shared) ===================== */
  function formatTime(sec) {
    if (!isFinite(sec)) return '00:00';
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  function startPlayWithUrl(url, shouldResume) {
    const v = $playerVideo.get(0);
    if (!v) return;

    $playerVideo.attr('src', url);
    $(v).off('.episode');

    $(v).on('loadedmetadata.episode', function () {
      if (shouldResume && typeof resumeFromTime === 'number' && isFinite(resumeFromTime)) {
        if (resumeFromTime < v.duration) v.currentTime = resumeFromTime;
      }
      $durationLabel.text(formatTime(v.duration));
      $currentTimeLabel.text(formatTime(v.currentTime || 0));
      $seekBar.val(v.duration ? ((v.currentTime || 0) / v.duration) * 100 : 0);
      v.play().catch(() => {});
    });

    $(v).on('timeupdate.episode', function () {
      if (!v.duration) return;
      const ct = v.currentTime || 0;
      $currentTimeLabel.text(formatTime(ct));
      $seekBar.val((ct / v.duration) * 100);

      if (!activeBookId) return;
      if (Math.floor(ct) % 3 === 0) {
        saveProgress(activeBookId, lastLoadedChapterIndex, ct);
      }
    });

    $(v).on('ended.episode', function () {
      if (!activeBookId) return;

      registerEpisodeWatched();

      // auto next
      if (chaptersData && chaptersData.length) {
        const sorted = chaptersData.slice().sort((a, b) => a.index - b.index);
        const i = sorted.findIndex((c) => c.index === lastLoadedChapterIndex);

        if (i >= 0 && i < sorted.length - 1) {
          const nextIndex = sorted[i + 1].index;
          saveProgress(activeBookId, nextIndex, 0);
          resumeFromTime = 0;
          lastLoadedChapterIndex = nextIndex;

          updateCurrentEpisodeLabel();
          renderEpisodeGrid();
          updateHistoryEntry();

          loadEpisode(activeBookId, nextIndex, { resume: false });
        } else {
          clearProgress(activeBookId);
        }
      }

      // optional ad open on end (only if armed)
      if (adArmed && AD_DIRECTLINK) {
        adArmed = false;
        window.open(AD_DIRECTLINK, '_blank');
      }
    });

    $playerLoading.addClass('hidden');
  }

  /* ===================== LOAD EPISODE (GET + fallback POST) ===================== */
  function loadEpisode(bookId, chapterIndex, opts = {}) {
    if (!bookId) return;

    lastLoadedChapterIndex = Number(chapterIndex) || 0;
    const shouldResume = !!opts.resume;

    armAdForEpisode(bookId, lastLoadedChapterIndex);
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    updateHistoryEntry();

    $playerLoading.removeClass('hidden');
    $playerVideo.attr('src', '');

    const v = $playerVideo.get(0);
    if (v) v.pause();

    // Try GET /api/watch first
    $.ajax({
      url: '/api/watch',
      data: { bookId, chapterIndex, source: 'web_reels' },
      method: 'GET'
    })
      .done((res) => {
        applyAdMeta(res);

        const vurl = res.videoUrl || '';
        if (vurl) {
          startPlayWithUrl(vurl, shouldResume);
          return;
        }

        // fallback: POST /api/watch/player
        $.ajax({
          url: '/api/watch/player',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({
            bookId: String(bookId),
            chapterIndex: Number(chapterIndex) || 0,
            lang: 'in'
          })
        })
          .done((pres) => {
            applyAdMeta(pres);
            const d = pres?.data?.data || pres?.data || pres || {};
            const videoUrl =
              d.videoUrl ||
              d.playUrl ||
              d.url ||
              d.videoPath ||
              d?.qualities?.[0]?.videoPath ||
              d?.qualities?.[0]?.playUrl ||
              '';

            if (videoUrl) startPlayWithUrl(videoUrl, shouldResume);
          })
          .always(() => {
            $playerLoading.addClass('hidden');
          });
      })
      .fail(() => {
        $playerLoading.addClass('hidden');
      });
  }

  /* ===================== PLAYER CONTROLS ===================== */
  const videoEl = $playerVideo.get(0);

  function syncPlayPauseIcon() {
    if (!videoEl) return;
    $playPauseBtn
      .find('i')
      .attr('class', videoEl.paused ? 'ri-play-fill' : 'ri-pause-fill');
  }

  $playPauseBtn.on('click', function () {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  });

  $playerVideo.on('click', function () {
    if (!videoEl) return;
    if (videoEl.paused) videoEl.play().catch(() => {});
    else videoEl.pause();
  });

  $seekBar.on('input', function () {
    if (!videoEl || !videoEl.duration) return;
    const pct = parseFloat($seekBar.val()) || 0;
    const newTime = (pct / 100) * videoEl.duration;
    videoEl.currentTime = newTime;
    $currentTimeLabel.text(formatTime(newTime));
  });

  $muteBtn.on('click', function () {
    if (!videoEl) return;
    videoEl.muted = !videoEl.muted;
    $muteBtn
      .find('i')
      .attr('class', videoEl.muted ? 'ri-volume-mute-fill' : 'ri-volume-up-fill');
  });

  $fullscreenBtn.on('click', function () {
    const elem = $videoShell.get(0);
    if (!elem) return;

    if (document.fullscreenElement === elem || document.webkitFullscreenElement === elem) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } else {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
    }
  });

  if (videoEl) {
    $(videoEl).on('play.player', function () {
      syncPlayPauseIcon();
      requestWakeLock();
    });
    $(videoEl).on('pause.player', function () {
      syncPlayPauseIcon();
      releaseWakeLock();
    });
  }

  /* ===================== EPISODE BOTTOM SHEET ===================== */
  $openEpisodeListBtn.on('click', function () {
    if (!chaptersData || !chaptersData.length) return;
    $episodeModalTitle.text(
      currentBookTitle ? `Daftar Episode — ${currentBookTitle}` : 'Daftar Episode'
    );
    renderEpisodeGrid();
    $episodeListModal.addClass('visible');
  });

  $('.episode-modal-close').on('click', function () {
    $episodeListModal.removeClass('visible');
  });

  $episodeListModal.on('click', function (e) {
    if ($(e.target).is('#episodeListModal')) {
      $episodeListModal.removeClass('visible');
    }
  });

  $episodeGrid.on('click', '.episode-card', function () {
    const idx = $(this).data('index');
    if (idx === undefined) return;

    resumeFromTime = null;
    lastLoadedChapterIndex = Number(idx) || 0;

    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    $episodeListModal.removeClass('visible');

    if (activeBookId) {
      updateHistoryEntry();
      loadEpisode(activeBookId, lastLoadedChapterIndex, { resume: false });
    }
  });

  /* ===================== AD DIRECTLINK (click inside modal) ===================== */
  $modal.on('click', function (e) {
    const $target = $(e.target);

    // exclude close button
    if ($target.closest('.modal-close').length) return;

    // exclude controls / buttons
    if (
      $target.closest('.video-controls').length ||
      $target.closest('#openEpisodeListBtn').length ||
      $target.closest('#seekBar').length ||
      $target.closest('#playPauseBtn').length ||
      $target.closest('#muteBtn').length ||
      $target.closest('#fullscreenBtn').length
    ) return;

    if (adArmed && AD_DIRECTLINK) {
      adArmed = false;
      if (activeBookId != null && lastLoadedChapterIndex != null) {
        markEpisodeAdShown(activeBookId, lastLoadedChapterIndex);
      }
      window.open(AD_DIRECTLINK, '_blank');
    }
  });

  /* ===================== CARD CLICK (open detail) ===================== */
  // grid item click + history click
  $feed.on('click', '.stream-card', function (e) {
    e.preventDefault();
    const $card = $(this);

    const bookId = $card.data('book-id');
    if (!bookId) return;

    const meta = {
      cover: $card.data('cover') || '',
      title: $card.data('title') || ''
    };

    const historyEpisodeRaw = $card.data('history-episode');
    const historyEpisode = Number.isFinite(Number(historyEpisodeRaw))
      ? Number(historyEpisodeRaw)
      : null;

    openDetailModal(bookId, meta, {
      historyEpisode: historyEpisode !== null ? historyEpisode : undefined
    });
  });

  /* ===================== TABS ===================== */
  $tabs.on('click', function () {
    const tab = $(this).data('tab');

    if (tab === 'search') {
      $tabs.removeClass('active');
      $(this).addClass('active');
      openSearchModal();
      return;
    }

    if (tab === 'genre') {
      $tabs.removeClass('active');
      $(this).addClass('active');
      openGenreModal();
      return;
    }

    // close modals if switching
    closeSearchModal();
    closeGenreModal();

    if (tab === 'history') {
      currentTab = 'history';
      currentSearch = '';
      currentGenreId = null;
      currentGenreName = '';
      hasMore = false;
      isLoading = false;
      currentPage = 0;
      currentPageNo = 0;

      $tabs.removeClass('active');
      $(this).addClass('active');

      renderHistoryTab();
      return;
    }

    // normal tabs
    currentTab = tab;
    currentSearch = '';
    currentGenreId = null;
    currentGenreName = '';

    hasMore = true;
    isLoading = false;
    currentPage = 0;
    currentPageNo = 0;

    $tabs.removeClass('active');
    $(this).addClass('active');

    fetchPage(false);
    window.scrollTo(0, 0);
  });

  /* ===================== HERO ACTIONS ===================== */
  function openRandomFromFeed() {
    const $cards = $feed.find('.stream-card:not(.skeleton)');
    if (!$cards.length) return;
    const idx = Math.floor(Math.random() * $cards.length);
    $cards.eq(idx).trigger('click');
  }

  $heroPlayBtn.on('click', function () {
    openRandomFromFeed();
  });

  $heroRefreshBtn.on('click', function () {
    // reload current tab
    if (currentTab === 'history') renderHistoryTab();
    else fetchPage(false);
    window.scrollTo(0, 0);
  });

  /* ===================== INIT ===================== */
  renderGenres();
  setupLazyObserver();
  fetchPage(false);
});
