// public/js/main.js
$(function () {
  const $feed = $('#reelContainer');
  const $loadingOverlay = $('#loadingOverlay');
  const $tabs = $('.bottom-nav .tab-btn');

  // Modal detail
  const $modal = $('#detailModal');
  const $modalTitle = $('#modalTitle');
  const $modalCurrentEpisode = $('#modalCurrentEpisode');
  const $playerVideo = $('#playerVideo');
  const $playerLoading = $('#playerLoading');
  const $episodeGrid = $('#episodeGrid');

  // Player controls
  const $playPauseBtn = $('#playPauseBtn');
  const $seekBar = $('#seekBar');
  const $currentTimeLabel = $('#currentTimeLabel');
  const $durationLabel = $('#durationLabel');
  const $muteBtn = $('#muteBtn');
  const $fullscreenBtn = $('#fullscreenBtn');
  const $videoShell = $('.video-shell');

  // Search modal
  const $searchModal = $('#searchModal');
  const $searchModalInput = $('#searchModalInput');
  const $searchModalBtn = $('#searchModalBtn');

  let currentTab = 'foryou';   // 'foryou' | 'new' | 'rank' | 'search'
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
      // bisa gagal kalau OS/browse tidak support
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
      if (v && !v.paused) {
        requestWakeLock();
      }
    } else {
      releaseWakeLock();
    }
  });

  /* ===================== LOADING ===================== */

  function showLoading(show) {
    if (show) {
      $loadingOverlay.addClass('visible');
    } else {
      $loadingOverlay.removeClass('visible');
    }
  }

  /* ===================== CONTINUE WATCHING (localStorage) ===================== */

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
    } catch (e) {
      console.warn('saveProgress error', e);
    }
  }

  function loadProgress(bookId) {
    if (!bookId) return null;
    try {
      const raw = localStorage.getItem(progressKey(bookId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      console.warn('loadProgress error', e);
      return null;
    }
  }

  function clearProgress(bookId) {
    if (!bookId) return;
    try {
      localStorage.removeItem(progressKey(bookId));
    } catch (e) {
      console.warn('clearProgress error', e);
    }
  }

  /* ===================== ADSTERRA COUNTER ===================== */

  function adShownKey(bookId, chapterIndex) {
    return `dramabox_ad_shown_${bookId}_${chapterIndex}`;
  }

  function globalEpisodeCounterKey() {
    return 'dramabox_global_episode_counter';
  }

  function getEpisodeCounter() {
    try {
      return parseInt(localStorage.getItem(globalEpisodeCounterKey()) || '0');
    } catch (e) {
      return 0;
    }
  }

  function setEpisodeCounter(val) {
    try {
      localStorage.setItem(globalEpisodeCounterKey(), String(val));
    } catch (e) {}
  }

  let adArmed = false;

  function episodeAdAlreadyShown(bookId, chapterIndex) {
    try {
      return (
        localStorage.getItem(adShownKey(bookId, chapterIndex)) === '1'
      );
    } catch (e) {
      return false;
    }
  }

  function markEpisodeAdShown(bookId, chapterIndex) {
    try {
      localStorage.setItem(adShownKey(bookId, chapterIndex), '1');
    } catch (e) {}
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

  /* ===================== CARD BUILDER ===================== */

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

  /* ===================== FETCH PAGE (INFINITE SCROLL) ===================== */

  function getApiUrl() {
    if (currentTab === 'new') return '/api/videos/new';
    if (currentTab === 'rank') return '/api/videos/rank';
    if (currentTab === 'search') {
      return `/api/search?q=${encodeURIComponent(currentSearch)}`;
    }
    return '/api/videos/foryou';
  }

  function fetchPage(append = false) {
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
        } else {
          if (items.length) {
            $feed.append(html);
          }
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

  /* ===================== TAB + INFINITE SCROLL EVENTS ===================== */

  $feed.on('scroll', function () {
    if (!hasMore || isLoading) return;
    const el = this;
    const threshold = 200;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - threshold) {
      fetchPage(true);
    }
  });

  $tabs.on('click', function () {
    const tab = $(this).data('tab');

    if (tab === 'search') {
      $tabs.removeClass('active');
      $(this).addClass('active');
      $searchModal.addClass('visible');
      setTimeout(() => {
        $searchModalInput.val('').focus();
      }, 120);
      return;
    }

    $searchModal.removeClass('visible');

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

  /* ===================== SEARCH MODAL ===================== */

  $searchModal.on('click', function (e) {
    if ($(e.target).is('#searchModal')) {
      $searchModal.removeClass('visible');
      if (!currentSearch) {
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

  /* ===================== EPISODE UI HELPERS ===================== */

  function updateCurrentEpisodeLabel() {
    if (activeBookId == null || lastLoadedChapterIndex == null) {
      $modalCurrentEpisode.text('');
      return;
    }
    const total = totalEpisodes || (chaptersData ? chaptersData.length : 0);
    if (!total) {
      $modalCurrentEpisode.text('');
      return;
    }
    const epNum = (lastLoadedChapterIndex || 0) + 1;
    $modalCurrentEpisode.text(`Episode ${epNum} / ${total}`);
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

  /* ===================== MODAL DETAIL ===================== */

  function resetModalState() {
    activeBookId = null;
    lastLoadedChapterIndex = null;
    resumeFromTime = null;
    chaptersData = [];
    totalEpisodes = 0;
    currentBookTitle = '';
    $playerVideo.attr('src', '');
    const v = $playerVideo.get(0);
    if (v) v.pause();
    $modalCurrentEpisode.text('');
    $episodeGrid.empty();
    releaseWakeLock();
  }

  function openDetailModal(bookId, meta) {
    resetModalState();
    activeBookId = bookId;

    if (meta) {
      currentBookTitle = meta.title || '';
      if (meta.title) $modalTitle.text(meta.title);
    }

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

        if (!chaptersData.length) {
          renderEpisodeGrid();
          return;
        }

        const progress = loadProgress(bookId);
        let activeIndex = chaptersData[0].index;

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

  // Klik card -> buka modal
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
        title: $card.data('title') || '',
        intro: $card.data('intro') || ''
      };

      openDetailModal(bookId, meta);
    }
  );

  // Like animasi
  $feed.on('click', '.card-btn[data-action="like"]', function (e) {
    e.stopPropagation();
    const $icon = $(this).find('.icon');
    $icon.animate({ fontSize: '26px' }, 120, 'swing', () => {
      $icon.animate({ fontSize: '20px' }, 120);
    });
  });

  /* ===================== EPISODE GRID CLICK ===================== */

  $episodeGrid.on('click', '.episode-card', function () {
    const idx = $(this).data('index');
    if (idx === undefined) return;
    resumeFromTime = null;
    lastLoadedChapterIndex = idx;
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    if (activeBookId) {
      loadEpisode(activeBookId, idx, { resume: false });
    }
  });

  /* ===================== FORMAT WAKTU ===================== */

  function formatTime(sec) {
    if (!isFinite(sec)) return '00:00';
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return (
      String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0')
    );
  }

  /* ===================== LOAD EPISODE + AUTO NEXT ===================== */

  function loadEpisode(bookId, chapterIndex, opts = {}) {
    if (!bookId) return;
    lastLoadedChapterIndex = Number(chapterIndex) || 0;
    const shouldResume = !!opts.resume;

    armAdForEpisode(bookId, lastLoadedChapterIndex);
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();

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
            if (resumeFromTime < v.duration) {
              v.currentTime = resumeFromTime;
            }
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

  /* ===================== PLAYER CONTROLS (CUSTOM) ===================== */

  const videoEl = $playerVideo.get(0);

  function syncPlayPauseIcon() {
    if (!videoEl) return;
    if (videoEl.paused) {
      $playPauseBtn.find('i').attr('class', 'ri-play-fill');
    } else {
      $playPauseBtn.find('i').attr('class', 'ri-pause-fill');
    }
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
    if (videoEl.paused) {
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
    }
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

  /* ===================== AD DIRECTLINK HANDLER ===================== */

  $modal.on('click', function (e) {
    const $target = $(e.target);
    if ($target.closest('.modal-close').length) return;
    if (adArmed && window.AD_DIRECTLINK) {
      adArmed = false;
      if (activeBookId != null && lastLoadedChapterIndex != null) {
        markEpisodeAdShown(activeBookId, lastLoadedChapterIndex);
      }
      window.open(window.AD_DIRECTLINK, '_blank');
    }
  });

  /* ===================== INIT ===================== */

  fetchPage(false);
});
