// public/js/main.js
$(function () {
  const $feed = $('#reelContainer');
  const $loadingOverlay = $('#loadingOverlay');
  const $tabs = $('.bottom-nav .tab-btn');

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

  let currentTab = 'foryou';
  let currentPage = 0;
  let hasMore = true;
  let isLoading = false;
  let currentSearch = '';

  let activeBookId = null;
  let lastLoadedChapterIndex = null;
  let resumeFromTime = null;

  let chaptersData = [];
  let totalEpisodes = 0;
  let currentBookTitle = '';
  let activeBookCover = '';

  // Wake Lock (keep screen on)
  let wakeLock = null;

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      }
    } catch (err) {
      console.log('WakeLock error', err);
    }
  }

  async function releaseWakeLock() {
    try {
      if (wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (err) {
      console.log('WakeLock release error', err);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const v = $playerVideo.get(0);
      if (v && !v.paused) requestWakeLock();
    } else {
      releaseWakeLock();
    }
  });

  /* ========== LOADING ========== */
  function showLoading(show) {
    $loadingOverlay.toggleClass('visible', !!show);
  }

  /* ========== PROGRESS (localStorage) ========== */
  function progressKey(bookId) {
    return `dramabox_progress_${bookId}`;
  }

  function saveProgress(bookId, chapterIndex, currentTime) {
    if (!bookId) return;
    try {
      const data = {
        chapterIndex: Number(chapterIndex) || 0,
        currentTime: Number(currentTime) || 0,
        updatedAt: Date.now()
      };
      localStorage.setItem(progressKey(bookId), JSON.stringify(data));
    } catch (e) {}
  }

  function loadProgress(bookId) {
    if (!bookId) return null;
    try {
      const raw = localStorage.getItem(progressKey(bookId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearProgress(bookId) {
    if (!bookId) return;
    try {
      localStorage.removeItem(progressKey(bookId));
    } catch (e) {}
  }

  /* ========== HISTORY (Riwayat) ========== */
  const HISTORY_KEY = 'dramabox_history_v1';

  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(arr) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(arr || []));
    } catch (e) {}
  }

  function updateHistoryEntry() {
    if (!activeBookId) return;

    const history = loadHistory();
    const epIndex = Number(lastLoadedChapterIndex) || 0;
    const epNum = epIndex + 1;

    const filtered = history.filter((h) => h.bookId !== activeBookId);

    const entry = {
      bookId: activeBookId,
      title: currentBookTitle || '',
      cover: activeBookCover || '',
      lastEpisodeIndex: epIndex,
      totalEpisodes: totalEpisodes || (chaptersData ? chaptersData.length : 0),
      lastEpisodeLabel: `Episode ${epNum}`,
      updatedAt: Date.now()
    };

    filtered.unshift(entry);
    saveHistory(filtered.slice(0, 30)); // simpan max 30 item
  }

  function buildHistoryCardHTML(entry) {
    const escTitle = $('<div>').text(entry.title || '').html();
    const desc = entry.totalEpisodes
      ? `${entry.lastEpisodeLabel} dari ${entry.totalEpisodes} episode`
      : entry.lastEpisodeLabel;

    return `
      <section
        class="video-card history-card"
        data-book-id="${entry.bookId}"
        data-title="${escTitle}"
        data-cover="${entry.cover || ''}"
      >
        <div class="card-inner">
          <div class="card-cover" style="background-image:url('${
            entry.cover || ''
          }')"></div>
          <div class="card-gradient"></div>

          <div class="card-info">
            <div class="card-title">${escTitle}</div>
            <div class="card-desc">${desc}</div>
            <div class="card-meta">
              <span class="meta-pill">Lanjut nonton</span>
            </div>
          </div>

          <div class="card-actions">
            <div class="card-btn" data-action="detail">
              <span class="icon">▶️</span>
              <span>Putar</span>
            </div>
          </div>
        </div>
      </section>
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

    const html = history.map(buildHistoryCardHTML).join('');
    $feed.html(html);

    const $cards = $feed.children('.video-card');
    $cards.each(function (i) {
      const $card = $(this);
      setTimeout(() => {
        $card.addClass('card-enter');
      }, i * 60);
    });
  }

  /* ========== AD COUNTER ========== */
  function adShownKey(bookId, chapterIndex) {
    return `dramabox_ad_shown_${bookId}_${chapterIndex}`;
  }
  function globalEpisodeCounterKey() {
    return 'dramabox_global_episode_counter';
  }
  function getEpisodeCounter() {
    try {
      return parseInt(localStorage.getItem(globalEpisodeCounterKey()) || '0');
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
    const triggered =
      localStorage.getItem('dramabox_episode_trigger') === '1';
    if (triggered) {
      adArmed = true;
      markEpisodeAdShown(bookId, chapterIndex);
      localStorage.removeItem('dramabox_episode_trigger');
    } else {
      adArmed = false;
    }
  }

  /* ========== CARD BUILDER ========== */
  function buildCardHTML(item) {
    const corner = item.corner?.name || '';
    const cornerColor = item.corner?.color || '#f97316';
    const escTitle = $('<div>').text(item.title).html();
    const escIntro = $('<div>').text(item.description || '').html();

    return `
      <section
        class="video-card"
        data-book-id="${item.bookId}"
        data-title="${escTitle}"
        data-intro="${escIntro}"
        data-cover="${item.thumbnail || ''}"
      >
        <div class="card-inner">
          <div class="card-cover" style="background-image:url('${
            item.thumbnail || ''
          }')"></div>
          <div class="card-gradient"></div>

          ${
            corner
              ? `<div class="card-corner" style="background:${cornerColor};">${corner}</div>`
              : ''
          }

          <div class="card-info">
            <div class="card-title">${item.title}</div>
            <div class="card-desc">${item.description || ''}</div>
            <div class="card-meta">
              <span class="meta-pill">${item.chapterCount} eps</span>
              <span class="meta-pill">${item.playCount || ''} tontonan</span>
            </div>
          </div>

          <div class="card-actions">
            <div class="card-btn" data-action="like">
              <span class="icon">❤️</span>
              <span>Suka</span>
            </div>
            <div class="card-btn" data-action="detail">
              <span class="icon">▶️</span>
              <span>Putar</span>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  /* ========== FETCH PAGE (INFINITE SCROLL) ========== */
  function getApiUrl() {
    if (currentTab === 'new') return '/api/videos/new';
    if (currentTab === 'rank') return '/api/videos/rank';
    if (currentTab === 'search')
      return `/api/search?q=${encodeURIComponent(currentSearch)}`;
    // foryou default
    return '/api/videos/foryou';
  }

  function fetchPage(append = false) {
    if (currentTab === 'history') return; // history tidak pakai API
    if (isLoading) return;
    if (!append) {
      currentPage = 0;
      hasMore = true;
    }
    if (!hasMore && append) return;

    const nextPage = append ? currentPage + 1 : 1;
    const url = getApiUrl();
    isLoading = true;

    if (!append) {
      $feed.addClass('fade-out');
      showLoading(true);
    }

    $.ajax({
      url,
      data: { page: nextPage },
      method: 'GET'
    })
      .done((res) => {
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

        if (items.length) {
          const $cards = append
            ? $feed
                .children('.video-card')
                .slice($feed.children('.video-card').length - items.length)
            : $feed.children('.video-card');

          $cards.each(function (i) {
            const $card = $(this);
            setTimeout(() => {
              $card.addClass('card-enter');
            }, i * 60);
          });
        }

        currentPage = nextPage;
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
        if (!append) {
          showLoading(false);
          $feed.removeClass('fade-out');
        }
      });
  }

  /* ========== TAB + INFINITE SCROLL ========== */
  $feed.on('scroll', function () {
    if (currentTab === 'history') return;
    if (!hasMore || isLoading) return;
    const el = this;
    const threshold = 200;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      fetchPage(true);
    }
  });

  $tabs.on('click', function () {
    const tab = $(this).data('tab');

    // tab search → buka modal
    if (tab === 'search') {
      $tabs.removeClass('active');
      $(this).addClass('active');
      $searchModal.addClass('visible');
      setTimeout(() => $searchModalInput.val('').focus(), 120);
      return;
    }

    // tutup search jika pindah tab
    $searchModal.removeClass('visible');

    // history tab
    if (tab === 'history') {
      currentTab = 'history';
      hasMore = false;
      isLoading = false;
      currentPage = 0;
      $tabs.removeClass('active');
      $(this).addClass('active');
      $feed.scrollTop(0);
      renderHistoryTab();
      return;
    }

    // tab biasa (foryou/new/rank)
    if (tab === currentTab && currentPage > 0) return;
    currentTab = tab;
    currentSearch = '';
    hasMore = true;
    isLoading = false;
    currentPage = 0;

    $tabs.removeClass('active');
    $(this).addClass('active');
    $feed.scrollTop(0);
    fetchPage(false);
  });

  /* ========== SEARCH MODAL (klik di luar = close) ========== */
  $searchModal.on('click', function (e) {
    // kalau klik di luar box
    if (!$(e.target).closest('.search-modal-box').length) {
      $searchModal.removeClass('visible');

      // jika tab search aktif & tidak ada pencarian, kembalikan ke For You
      if (currentTab === 'search' && !currentSearch) {
        currentTab = 'foryou';
        $tabs.removeClass('active');
        $tabs.filter('[data-tab="foryou"]').addClass('active');
        hasMore = true;
        isLoading = false;
        currentPage = 0;
        $feed.scrollTop(0);
        fetchPage(false);
      }
    }
  });

  function runSearch() {
    const q = $searchModalInput.val().trim();
    if (!q) return;
    currentTab = 'search';
    currentSearch = q;
    hasMore = true;
    isLoading = false;
    currentPage = 0;

    $tabs.removeClass('active');
    $tabs.filter('[data-tab="search"]').addClass('active');
    $feed.scrollTop(0);
    $searchModal.removeClass('visible');
    fetchPage(false);
  }

  $searchModalBtn.on('click', runSearch);
  $searchModalInput.on('keypress', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      runSearch();
    }
  });

  /* ========== EPISODE UI HELPERS ========== */
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
          <button class="episode-card${
            isActive ? ' active' : ''
          }" data-index="${c.index}">
            <div class="ep-number">Ep ${epNum}</div>
            <div class="ep-title">${epTitle}</div>
            ${freeBadge}
          </button>
        `;
      })
      .join('');

    $episodeGrid.html(cards);
  }

  /* ========== DETAIL MODAL OPEN/CLOSE ========== */
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
      data: { bookId },
      method: 'GET'
    })
      .done((res) => {
        currentBookTitle = res.title || currentBookTitle || '';
        $modalTitle.text(currentBookTitle || '');
        totalEpisodes = res.chapterCount || (res.chapters?.length || 0);
        chaptersData = res.chapters || [];

        const progress = loadProgress(bookId);
        let activeIndex =
          chaptersData && chaptersData.length ? chaptersData[0].index : 0;

        if (
          progress &&
          chaptersData.some((c) => c.index === progress.chapterIndex)
        ) {
          activeIndex = progress.chapterIndex;
          resumeFromTime = progress.currentTime || 0;
        } else {
          resumeFromTime = null;
        }

        lastLoadedChapterIndex = activeIndex;
        updateCurrentEpisodeLabel();
        renderEpisodeGrid();

        // riwayat langsung di-update begitu user buka detail
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
    if ($(e.target).is('#detailModal')) {
      closeDetailModal();
    }
  });

  // Card click -> open detail
  $feed.on(
    'click',
    '.card-inner, .card-btn[data-action="detail"]',
    function (e) {
      e.preventDefault();
      const $card = $(this).closest('.video-card');
      const bookId = $card.data('book-id');
      if (!bookId) return;
      const meta = {
        cover: $card.data('cover') || '',
        title: $card.data('title') || ''
      };
      openDetailModal(bookId, meta);
    }
  );

  // Like animation
  $feed.on('click', '.card-btn[data-action="like"]', function (e) {
    e.stopPropagation();
    const $icon = $(this).find('.icon');
    $icon.animate({ fontSize: '26px' }, 120, 'swing', () => {
      $icon.animate({ fontSize: '20px' }, 120);
    });
  });

  /* ========== EPISODE MODAL (BOTTOM SHEET) ========== */

  // Klik badge episode di header
  $openEpisodeListBtn.on('click', function () {
    if (!chaptersData || !chaptersData.length) return;
    $episodeModalTitle.text(
      currentBookTitle
        ? `Daftar Episode — ${currentBookTitle}`
        : 'Daftar Episode'
    );
    renderEpisodeGrid();
    $episodeListModal.addClass('visible');
  });

  // Tutup bottom sheet
  $('.episode-modal-close').on('click', function () {
    $episodeListModal.removeClass('visible');
  });

  $episodeListModal.on('click', function (e) {
    if ($(e.target).is('#episodeListModal')) {
      $episodeListModal.removeClass('visible');
    }
  });

  // Pilih episode dari list
  $episodeGrid.on('click', '.episode-card', function () {
    const idx = $(this).data('index');
    if (idx === undefined) return;
    resumeFromTime = null;
    lastLoadedChapterIndex = idx;
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    $episodeListModal.removeClass('visible');
    if (activeBookId) {
      updateHistoryEntry();
      loadEpisode(activeBookId, idx, { resume: false });
    }
  });

  /* ========== UTIL WAKTU ========== */
  function formatTime(sec) {
    if (!isFinite(sec)) return '00:00';
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }

  /* ========== LOAD EPISODE + AUTO NEXT ========== */
  function loadEpisode(bookId, chapterIndex, opts = {}) {
    if (!bookId) return;
    lastLoadedChapterIndex = Number(chapterIndex) || 0;
    const shouldResume = !!opts.resume;

    armAdForEpisode(bookId, lastLoadedChapterIndex);
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    updateHistoryEntry(); // update riwayat setiap kali episode diganti

    $playerLoading.removeClass('hidden');
    $playerVideo.attr('src', '');
    const v = $playerVideo.get(0);
    if (!v) return;
    v.pause();

    $.ajax({
      url: '/api/watch',
      data: { bookId, chapterIndex },
      method: 'GET'
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
          $seekBar.val(
            v.duration ? ((v.currentTime || 0) / v.duration) * 100 : 0
          );
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

          const sorted = chaptersData
            .slice()
            .sort((a, b) => a.index - b.index);
          const currentEpIndex = sorted.findIndex(
            (c) => c.index === lastLoadedChapterIndex
          );

          if (currentEpIndex >= 0 && currentEpIndex < sorted.length - 1) {
            const nextIndex = sorted[currentEpIndex + 1].index;
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

  /* ========== PLAYER CONTROLS CUSTOM ========== */
  const videoEl = $playerVideo.get(0);

  function syncPlayPauseIcon() {
    if (!videoEl) return;
    $playPauseBtn
      .find('i')
      .attr('class', videoEl.paused ? 'ri-play-fill' : 'ri-pause-fill');
  }

  $playPauseBtn.on('click', function () {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }
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
      .attr(
        'class',
        videoEl.muted ? 'ri-volume-mute-fill' : 'ri-volume-up-fill'
      );
  });

  $fullscreenBtn.on('click', function () {
    const elem = $videoShell.get(0);
    if (!elem) return;

    if (
      document.fullscreenElement === elem ||
      document.webkitFullscreenElement === elem
    ) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen)
        document.webkitExitFullscreen();
    } else {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen)
        elem.webkitRequestFullscreen();
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

  /* ========== AD DIRECTLINK (klik apa saja di modal) ========== */
  $modal.on('click', function (e) {
    const $target = $(e.target);
    if ($target.closest('.modal-close').length) return;
    if ($target.closest('#openEpisodeListBtn').length) return;

    if (adArmed && window.AD_DIRECTLINK) {
      adArmed = false;
      if (activeBookId != null && lastLoadedChapterIndex != null) {
        markEpisodeAdShown(activeBookId, lastLoadedChapterIndex);
      }
      window.open(window.AD_DIRECTLINK, '_blank');
    }
  });

  /* ========== INIT ========== */
  fetchPage(false);
});
