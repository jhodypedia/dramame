$(function () {
  const $feed = $('#reelContainer');
  const $loadingOverlay = $('#loadingOverlay');
  const $tabs = $('.bottom-nav .tab-btn');

  // Hero + filter UI
  const $heroPlayBtn = $('#heroPlayBtn');
  const $heroRefreshBtn = $('#heroRefreshBtn');
  const $chips = $('.filters .chip');

  // Lazy sentinel
  const $lazySentinel = $('#lazySentinel');

  // Search modal
  const $openSearchBtn = $('#openSearchBtn');
  const $searchModal = $('#searchModal');
  const $searchModalInput = $('#searchModalInput');
  const $searchModalBtn = $('#searchModalBtn');
  const $suggestList = $('#suggestList');

  // Genre modal
  const $openGenreBtn = $('#openGenreBtn');
  const $genreModal = $('#genreModal');
  const $genreGrid = $('#genreGrid');
  const $closeGenreBtn = $('#closeGenreBtn');

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

  /* =========================
     FORCE SCROLL FIX (iOS)
  ========================== */
  // Pastikan container feed benar-benar bisa scroll meskipun body overflow:hidden
  $feed.css({
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch'
  });

  /* =========================
     STATE
  ========================== */
  let currentTab = 'foryou'; // foryou | new | rank | search | history | classify
  let currentPage = 0;
  let hasMore = true;
  let isLoading = false;

  let currentSearch = '';
  let currentSort = 1; // 1 populer, 2 terbaru
  let currentGenreId = null; // classify genre id

  // Cache items untuk random play
  let lastItems = [];

  // Player state
  let activeBookId = null;
  let lastLoadedChapterIndex = null;
  let resumeFromTime = null;

  let chaptersData = [];
  let totalEpisodes = 0;
  let currentBookTitle = '';
  let activeBookCover = '';

  // Wake Lock
  let wakeLock = null;

  /* =========================
     LOADING
  ========================== */
  function showLoading(show) {
    $loadingOverlay.toggleClass('visible', !!show);
  }

  /* =========================
     SAFE ESCAPE
  ========================== */
  function esc(s) {
    return $('<div>').text(String(s ?? '')).html();
  }

  /* =========================
     PROGRESS (localStorage)
  ========================== */
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
      if (!raw) return null;
      return JSON.parse(raw);
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

  /* =========================
     HISTORY
  ========================== */
  const HISTORY_KEY = 'dramabox_history_v2';

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
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

  /* =========================
     AD COUNTER (DIRECTLINK)
  ========================== */
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
    const freq = Number(window.AD_FREQUENCY || 5) || 5;
    if (count >= freq) {
      localStorage.setItem('dramabox_episode_trigger', '1');
      count = 0;
    }
    setEpisodeCounter(count);
  }

  function armAdForEpisode(bookId, chapterIndex) {
    if (!window.AD_DIRECTLINK) {
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

  /* =========================
     WAKE LOCK
  ========================== */
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
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

  /* =========================
     API URL
  ========================== */
  function getApiUrl() {
    if (currentTab === 'new') return '/api/videos/new';
    if (currentTab === 'rank') return '/api/videos/rank';
    if (currentTab === 'search') return `/api/search?q=${encodeURIComponent(currentSearch)}`;
    if (currentTab === 'classify') return '/api/classify';
    return '/api/videos/foryou';
  }

  /* =========================
     NETFLIX CARD BUILDER
  ========================== */
  function buildCardHTML(item) {
    const title = esc(item.title || '');
    const cover = item.thumbnail || '';
    const eps = item.chapterCount ? `${item.chapterCount} eps` : '';
    const badge = item.corner?.name ? esc(item.corner.name) : '';
    const meta = eps || (item.playCount ? `${esc(item.playCount)} views` : '');

    return `
      <article class="stream-card"
        data-book-id="${item.bookId}"
        data-title="${title}"
        data-cover="${cover}"
      >
        <div class="card-poster">
          <img src="${cover}" alt="${title}" loading="lazy" />
          <div class="card-overlay"></div>

          ${badge ? `<div class="history-pill" style="background:rgba(229,9,20,0.92)">${badge}</div>` : ''}

          <div class="card-info">
            <div class="card-title">${title}</div>
            ${meta ? `<div class="card-meta">${meta}</div>` : ``}
          </div>
        </div>
      </article>
    `;
  }

  function buildSkeletonHTML(count = 8) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <article class="stream-card skeleton">
          <div class="card-poster">
            <div class="sk-box"></div>
            <div class="card-overlay"></div>
            <div class="card-info">
              <div class="sk-line"></div>
              <div class="sk-line short"></div>
            </div>
          </div>
        </article>
      `;
    }
    return html;
  }

  function buildHistoryCardHTML(entry) {
    const title = esc(entry.title || '');
    const cover = entry.cover || '';
    const desc = entry.totalEpisodes
      ? `${esc(entry.lastEpisodeLabel)} dari ${esc(entry.totalEpisodes)} episode`
      : esc(entry.lastEpisodeLabel);

    return `
      <article class="stream-card"
        data-book-id="${entry.bookId}"
        data-title="${title}"
        data-cover="${cover}"
      >
        <div class="card-poster">
          <img src="${cover}" alt="${title}" loading="lazy" />
          <div class="card-overlay"></div>

          <div class="history-pill">Lanjut</div>

          <div class="card-info">
            <div class="card-title">${title}</div>
            <div class="card-meta">${desc}</div>
          </div>
        </div>
      </article>
    `;
  }

  /* =========================
     RENDER HISTORY TAB
  ========================== */
  function renderHistoryTab() {
    const history = loadHistory();
    if (!history.length) {
      $feed.html(
        '<div style="padding:18px;text-align:center;opacity:0.85;">Belum ada riwayat tontonan.</div>'
      );
      return;
    }
    $feed.html(history.map(buildHistoryCardHTML).join('') + $lazySentinel.prop('outerHTML'));
  }

  /* =========================
     FETCH PAGE (LAZY / INFINITE)
  ========================== */
  function fetchPage(append = false) {
    if (currentTab === 'history') return;
    if (isLoading) return;
    if (!append) {
      currentPage = 0;
      hasMore = true;
      lastItems = [];
    }
    if (!hasMore && append) return;

    const nextPage = append ? currentPage + 1 : 1;
    const url = getApiUrl();

    isLoading = true;

    if (!append) {
      showLoading(true);
      // tampilkan skeleton dulu biar UI smooth
      $feed.html(buildSkeletonHTML(10) + $lazySentinel.prop('outerHTML'));
      $feed.scrollTop(0);
    } else {
      // ketika append, biarkan sentinel tetap tampil
    }

    const dataQuery = { page: nextPage };

    // classify param
    if (currentTab === 'classify') {
      dataQuery.pageNo = nextPage;
      dataQuery.genre = currentGenreId;
      dataQuery.sort = currentSort;
      // kompat: beberapa backend pakai "page" / "pageNo"
      delete dataQuery.page;
    }

    $.ajax({
      url,
      method: 'GET',
      data: dataQuery
    })
      .done((res) => {
        hasMore = !!res.hasMore;

        const items = res.items || [];
        if (!append) lastItems = items.slice();
        else lastItems = lastItems.concat(items);

        const html = items.map(buildCardHTML).join('');

        // Pastikan sentinel ada di akhir
        const sentinelHtml = $lazySentinel.prop('outerHTML') || '';

        if (!append) {
          if (!items.length) {
            $feed.html(
              '<div style="padding:18px;text-align:center;opacity:0.85;">Tidak ada data.</div>' +
                sentinelHtml
            );
          } else {
            $feed.html(html + sentinelHtml);
          }
        } else {
          if (items.length) {
            // remove old sentinel then append new block+sentinel
            $('#lazySentinel').remove();
            $feed.append(html + sentinelHtml);
          } else {
            hasMore = false;
          }
        }

        currentPage = nextPage;
      })
      .fail(() => {
        if (!append) {
          $feed.html(
            '<div style="padding:18px;text-align:center;opacity:0.85;">Gagal memuat data.</div>' +
              ($lazySentinel.prop('outerHTML') || '')
          );
        }
        hasMore = false;
      })
      .always(() => {
        isLoading = false;
        showLoading(false);
        setupLazyObserver(); // re-bind observer karena sentinel diganti
      });
  }

  /* =========================
     LAZY OBSERVER (SCROLL FIX)
  ========================== */
  let io = null;

  function setupLazyObserver() {
    // reset
    if (io) {
      try {
        io.disconnect();
      } catch {}
      io = null;
    }

    const sentinel = document.getElementById('lazySentinel');
    if (!sentinel) return;

    // Jika history tab, sentinel tidak perlu
    if (currentTab === 'history') return;

    // Pakai IntersectionObserver (recommended)
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              if (hasMore && !isLoading) fetchPage(true);
            }
          });
        },
        {
          root: $feed.get(0), // penting: root = feed container (bukan window)
          rootMargin: '300px 0px',
          threshold: 0.01
        }
      );
      io.observe(sentinel);
      return;
    }

    // Fallback: scroll event
    $feed.off('scroll.lazyFallback').on('scroll.lazyFallback', function () {
      if (!hasMore || isLoading) return;
      const el = this;
      const threshold = 220;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
        fetchPage(true);
      }
    });
  }

  /* =========================
     SEARCH (modal + suggest)
  ========================== */
  function openSearchModal() {
    $suggestList.hide().empty();
    $searchModal.addClass('visible');
    setTimeout(() => $searchModalInput.val('').focus(), 80);
  }

  function closeSearchModal() {
    $searchModal.removeClass('visible');
    $suggestList.hide().empty();
  }

  $openSearchBtn.on('click', openSearchModal);

  // klik area luar box => close
  $searchModal.on('click', function (e) {
    if (!$(e.target).closest('.search-modal-box').length) {
      closeSearchModal();
    }
  });

  function runSearch() {
    const q = ($searchModalInput.val() || '').trim();
    if (!q) return;

    currentTab = 'search';
    currentSearch = q;
    currentGenreId = null;

    $tabs.removeClass('active');
    $tabs.filter('[data-tab="search"]').addClass('active');

    closeSearchModal();
    fetchPage(false);
  }

  $searchModalBtn.on('click', runSearch);
  $searchModalInput.on('keypress', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  // Suggest (debounce)
  let suggestTimer = null;
  $searchModalInput.on('input', function () {
    const q = ($searchModalInput.val() || '').trim();
    clearTimeout(suggestTimer);
    if (!q) {
      $suggestList.hide().empty();
      return;
    }
    suggestTimer = setTimeout(() => {
      $.ajax({
        url: '/api/suggest',
        method: 'GET',
        data: { q }
      })
        .done((res) => {
          const items = res.items || res.data || [];
          if (!items.length) {
            $suggestList.hide().empty();
            return;
          }
          const html = items
            .slice(0, 10)
            .map((t) => `<div class="suggest-item" data-val="${esc(t)}">${esc(t)}</div>`)
            .join('');
          $suggestList.html(html).show();
        })
        .fail(() => {
          $suggestList.hide().empty();
        });
    }, 220);
  });

  $suggestList.on('click', '.suggest-item', function () {
    const v = $(this).data('val');
    if (!v) return;
    $searchModalInput.val(v);
    runSearch();
  });

  /* =========================
     GENRE MODAL
  ========================== */
  const GENRES = Array.isArray(window.__GENRE_LIST__) ? window.__GENRE_LIST__ : [];

  function renderGenreGrid() {
    if (!GENRES.length) {
      $genreGrid.html('<div style="opacity:.8;padding:8px;">Genre belum tersedia.</div>');
      return;
    }
    const html = GENRES
      .map((g) => {
        const active = Number(g.id) === Number(currentGenreId);
        return `<button class="genre-chip${active ? ' active' : ''}" type="button" data-id="${g.id}">
          ${esc(g.name || g.title || g.id)}
        </button>`;
      })
      .join('');
    $genreGrid.html(html);
  }

  function openGenreModal() {
    renderGenreGrid();
    $genreModal.addClass('visible');
  }
  function closeGenreModal() {
    $genreModal.removeClass('visible');
  }

  $openGenreBtn.on('click', openGenreModal);
  $closeGenreBtn.on('click', closeGenreModal);

  $genreModal.on('click', function (e) {
    if ($(e.target).is('#genreModal')) closeGenreModal();
  });

  $genreGrid.on('click', '.genre-chip', function () {
    const gid = $(this).data('id');
    if (!gid) return;

    currentGenreId = Number(gid);
    currentTab = 'classify';
    currentSearch = '';

    // tab active: genre
    $tabs.removeClass('active');
    $tabs.filter('[data-tab="genre"]').addClass('active');

    closeGenreModal();
    fetchPage(false);
  });

  /* =========================
     FILTER SORT (Populer/Terbaru)
  ========================== */
  $chips.on('click', function () {
    const sort = Number($(this).data('sort') || 1);
    currentSort = sort;

    $chips.removeClass('active');
    $(this).addClass('active');

    // kalau sedang di classify -> refetch
    if (currentTab === 'classify' && currentGenreId) {
      fetchPage(false);
    }
  });

  /* =========================
     TABS
  ========================== */
  $tabs.on('click', function () {
    const tab = $(this).data('tab');

    if (tab === 'search') {
      // buka modal search, jangan pindah tab dulu
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

    // history
    if (tab === 'history') {
      currentTab = 'history';
      currentPage = 0;
      hasMore = false;
      isLoading = false;

      $tabs.removeClass('active');
      $(this).addClass('active');

      renderHistoryTab();
      return;
    }

    // normal tabs
    currentTab = tab;
    currentSearch = '';
    currentGenreId = null;

    $tabs.removeClass('active');
    $(this).addClass('active');

    fetchPage(false);
  });

  /* =========================
     HERO RANDOM PLAY / REFRESH
  ========================== */
  function openRandomFromItems() {
    if (!lastItems || !lastItems.length) return;
    const pick = lastItems[Math.floor(Math.random() * lastItems.length)];
    if (!pick || !pick.bookId) return;

    openDetailModal(pick.bookId, {
      title: pick.title || '',
      cover: pick.thumbnail || ''
    });
  }

  $heroPlayBtn.on('click', function () {
    openRandomFromItems();
  });

  $heroRefreshBtn.on('click', function () {
    fetchPage(false);
  });

  /* =========================
     DETAIL MODAL / EPISODES
  ========================== */
  function formatTime(sec) {
    if (!isFinite(sec)) return '00:00';
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

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
      $episodeGrid.html('<div style="padding:12px;font-size:13px;opacity:0.8;">Tidak ada episode.</div>');
      return;
    }

    const cards = chaptersData
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((c) => {
        const epNum = c.index + 1;
        const epTitle = esc(c.name || `Episode ${epNum}`);
        const isActive = c.index === lastLoadedChapterIndex;
        const freeBadge = c.isFree ? '<span class="ep-badge">Gratis</span>' : '';

        return `
          <button class="episode-card${isActive ? ' active' : ''}" type="button" data-index="${c.index}">
            <div class="ep-number">Ep ${epNum}</div>
            <div class="ep-title">${epTitle}</div>
            ${freeBadge}
          </button>
        `;
      })
      .join('');

    $episodeGrid.html(cards);
  }

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

  function openDetailModal(bookId, meta) {
    resetModalState();
    activeBookId = bookId;

    currentBookTitle = meta?.title || '';
    activeBookCover = meta?.cover || '';

    $modalTitle.text(currentBookTitle || '');
    $modal.addClass('visible');

    showLoading(true);

    $.ajax({
      url: '/api/chapters',
      method: 'GET',
      data: { bookId }
    })
      .done((res) => {
        currentBookTitle = res.title || currentBookTitle || '';
        $modalTitle.text(currentBookTitle || '');

        totalEpisodes = res.chapterCount || (res.chapters?.length || 0);
        chaptersData = res.chapters || [];

        const progress = loadProgress(bookId);

        let activeIndex = chaptersData && chaptersData.length ? chaptersData[0].index : 0;
        if (progress && chaptersData.some((c) => c.index === progress.chapterIndex)) {
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
        $episodeGrid.html('<div style="padding:12px;font-size:13px;opacity:0.8;">Gagal memuat episode.</div>');
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

  // Open from card
  $feed.on('click', '.stream-card', function (e) {
    e.preventDefault();
    const $card = $(this);
    const bookId = $card.data('book-id');
    if (!bookId) return;

    openDetailModal(bookId, {
      title: $card.data('title') || '',
      cover: $card.data('cover') || ''
    });
  });

  // Episode sheet open
  $openEpisodeListBtn.on('click', function () {
    if (!chaptersData || !chaptersData.length) return;
    $episodeModalTitle.text(currentBookTitle ? `Daftar Episode — ${currentBookTitle}` : 'Daftar Episode');
    renderEpisodeGrid();
    $episodeListModal.addClass('visible');
  });

  // Close sheet
  $('.episode-modal-close').on('click', function () {
    $episodeListModal.removeClass('visible');
  });
  $episodeListModal.on('click', function (e) {
    if ($(e.target).is('#episodeListModal')) $episodeListModal.removeClass('visible');
  });

  // Pick episode
  $episodeGrid.on('click', '.episode-card', function () {
    const idx = $(this).data('index');
    if (idx === undefined) return;

    resumeFromTime = null;
    lastLoadedChapterIndex = Number(idx);
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    $episodeListModal.removeClass('visible');

    if (activeBookId) {
      updateHistoryEntry();
      loadEpisode(activeBookId, lastLoadedChapterIndex, { resume: false });
    }
  });

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
    if (!v) return;
    v.pause();

    $.ajax({
      url: '/api/watch',
      method: 'GET',
      data: { bookId, chapterIndex }
    })
      .done((res) => {
        if (!res.videoUrl) return;

        $playerVideo.attr('src', res.videoUrl);
        $(v).off('.episode');

        $(v).on('loadedmetadata.episode', function () {
          if (shouldResume && typeof resumeFromTime === 'number') {
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

          if (!chaptersData || !chaptersData.length) {
            clearProgress(activeBookId);
            return;
          }

          const sorted = chaptersData.slice().sort((a, b) => a.index - b.index);
          const currentIdx = sorted.findIndex((c) => c.index === lastLoadedChapterIndex);

          if (currentIdx >= 0 && currentIdx < sorted.length - 1) {
            const nextIndex = sorted[currentIdx + 1].index;
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
        });
      })
      .always(() => {
        $playerLoading.addClass('hidden');
      });
  }

  /* =========================
     PLAYER CONTROLS
  ========================== */
  const videoEl = $playerVideo.get(0);

  function syncPlayPauseIcon() {
    if (!videoEl) return;
    $playPauseBtn.find('i').attr('class', videoEl.paused ? 'ri-play-fill' : 'ri-pause-fill');
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
    $muteBtn.find('i').attr('class', videoEl.muted ? 'ri-volume-mute-fill' : 'ri-volume-up-fill');
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

  /* =========================
     AD DIRECTLINK (klik apa saja di modal)
  ========================== */
  $modal.on('click', function (e) {
    const $target = $(e.target);
    if ($target.closest('.modal-close').length) return;
    if ($target.closest('#openEpisodeListBtn').length) return;
    if ($target.closest('.video-controls').length) return; // jangan ganggu kontrol
    if ($target.closest('#episodeListModal').length) return;

    if (adArmed && window.AD_DIRECTLINK) {
      adArmed = false;
      if (activeBookId != null && lastLoadedChapterIndex != null) {
        markEpisodeAdShown(activeBookId, lastLoadedChapterIndex);
      }
      window.open(window.AD_DIRECTLINK, '_blank');
    }
  });

  /* =========================
     INIT
  ========================== */
  // default tab: foryou
  fetchPage(false);
  setupLazyObserver();
});
