// public/js/main.js
$(function () {
  const $feed = $('#reelContainer');
  const $loadingOverlay = $('#loadingOverlay');
  const $pageInfo = $('#pageInfo');
  const $prevPageBtn = $('#prevPageBtn');
  const $nextPageBtn = $('#nextPageBtn');
  const $tabs = $('.bottom-nav .tab-btn');

  // Modal detail
  const $modal = $('#detailModal');
  const $modalTitle = $('#modalTitle');
  const $modalIntro = $('#modalIntro');
  const $modalEpisodeCount = $('#modalEpisodeCount');
  const $modalCurrentEpisode = $('#modalCurrentEpisode');
  const $playerVideo = $('#playerVideo');
  const $playerLoading = $('#playerLoading');
  const $continueBanner = $('#continueBanner');
  const $continueText = $('#continueText');
  const $continueBtn = $('#continueBtn');
  const $openEpisodeListBtn = $('#openEpisodeListBtn');

  // Modal grid episode
  const $episodeListModal = $('#episodeListModal');
  const $episodeGrid = $('#episodeGrid');
  const $episodeModalTitle = $('#episodeModalTitle');

  // Search modal
  const $searchModal = $('#searchModal');
  const $searchModalInput = $('#searchModalInput');
  const $searchModalBtn = $('#searchModalBtn');

  let currentTab = 'foryou';
  let currentPage = 1;
  let hasMore = true;
  let currentSearch = '';

  let activeBookId = null;
  let lastLoadedChapterIndex = null;
  let resumeFromTime = null;

  let chaptersData = [];
  let totalEpisodes = 0;
  let currentBookTitle = '';

  /* ===================== LOADING & PAGER ===================== */

  function showLoading(show) {
    if (show) {
      $loadingOverlay.addClass('visible');
    } else {
      $loadingOverlay.removeClass('visible');
    }
  }

  function updatePager() {
    $pageInfo.text(
      `Halaman ${currentPage}${
        currentTab === 'search' && currentSearch
          ? ' • Pencarian: "' + currentSearch + '"'
          : ''
      }`
    );
    $prevPageBtn.prop('disabled', currentPage <= 1);
    $nextPageBtn.prop('disabled', !hasMore);
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

  /* ===================== TAB LOADER ===================== */

  function loadTab(tab, page = 1, opts = {}) {
    currentTab = tab;
    currentPage = page;
    if (opts.search !== undefined) currentSearch = opts.search;

    $tabs.removeClass('active');
    $tabs.filter(`[data-tab="${tab}"]`).addClass('active');

    $feed.addClass('fade-out');
    showLoading(true);

    let url = '/api/videos/foryou';
    if (tab === 'new') url = '/api/videos/new';
    if (tab === 'rank') url = '/api/videos/rank';
    if (tab === 'search') {
      url = `/api/search?q=${encodeURIComponent(currentSearch)}`;
    }

    $.ajax({ url, data: { page }, method: 'GET' })
      .done((res) => {
        hasMore = !!res.hasMore;
        $feed.empty();

        if (!res.items || !res.items.length) {
          $feed.html(
            '<div style="padding:16px;text-align:center;opacity:0.8;">Tidak ada data.</div>'
          );
        } else {
          const html = res.items.map(buildCardHTML).join('');
          $feed.html(html);

          $('.video-card').each(function (i) {
            const $card = $(this);
            setTimeout(() => {
              $card.addClass('card-enter');
            }, i * 60);
          });
        }
        updatePager();
      })
      .fail(() => {
        $feed.html(
          '<div style="padding:16px;text-align:center;opacity:0.8;">Gagal memuat data.</div>'
        );
        hasMore = false;
        updatePager();
      })
      .always(() => {
        showLoading(false);
        $feed.removeClass('fade-out');
      });
  }

  /* ===================== TAB + PAGER EVENTS ===================== */

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

    if (tab === currentTab) return;
    currentSearch = '';
    loadTab(tab, 1);
  });

  $prevPageBtn.on('click', function () {
    if (currentPage <= 1) return;
    loadTab(currentTab, currentPage - 1);
  });

  $nextPageBtn.on('click', function () {
    if (!hasMore) return;
    loadTab(currentTab, currentPage + 1);
  });

  /* ===================== SEARCH MODAL ===================== */

  $searchModal.on('click', function (e) {
    if ($(e.target).is('#searchModal')) {
      $searchModal.removeClass('visible');
      if (!currentSearch) {
        loadTab('foryou', 1);
      }
    }
  });

  function runSearch() {
    const q = $searchModalInput.val().trim();
    if (!q) return;
    currentSearch = q;
    $searchModal.removeClass('visible');
    loadTab('search', 1, { search: q });
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
    $playerVideo.get(0)?.pause();
    $continueBanner.addClass('hidden');
    $modalCurrentEpisode.text('');
  }

  function openDetailModal(bookId, meta) {
    resetModalState();
    activeBookId = bookId;

    if (meta) {
      currentBookTitle = meta.title || '';
      if (meta.title) $modalTitle.text(meta.title);
      if (meta.intro) $modalIntro.text(meta.intro);
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
        $modalIntro.text(res.introduction || meta?.intro || '');
        totalEpisodes = res.chapterCount || (res.chapters?.length || 0);
        $modalEpisodeCount.text(`${totalEpisodes} episode`);

        chaptersData = res.chapters || [];

        if (!chaptersData.length) {
          $continueBanner.addClass('hidden');
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

          const epNumber = progress.chapterIndex + 1;
          $continueText.text(
            `Lanjut tonton dari episode ${epNumber}${
              resumeFromTime
                ? ` (sekitar menit ${Math.floor(resumeFromTime / 60)})`
                : ''
            }`
          );
          $continueBanner.removeClass('hidden');
        } else {
          $continueBanner.addClass('hidden');
          resumeFromTime = null;
        }

        lastLoadedChapterIndex = activeIndex;
        updateCurrentEpisodeLabel();
        renderEpisodeGrid();

        loadEpisode(activeBookId, activeIndex, { resume: true });
      })
      .fail(() => {
        $modalIntro.text('Gagal memuat informasi drama.');
        chaptersData = [];
        totalEpisodes = 0;
        renderEpisodeGrid();
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

  // Continue button
  $continueBtn.on('click', function () {
    const progress = loadProgress(activeBookId);
    if (!progress) return;

    const idx = progress.chapterIndex;
    resumeFromTime = progress.currentTime || 0;

    lastLoadedChapterIndex = idx;
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    loadEpisode(activeBookId, idx, { resume: true });
  });

  /* ===================== EPISODE LIST MODAL (GRID) ===================== */

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
    lastLoadedChapterIndex = idx;
    updateCurrentEpisodeLabel();
    renderEpisodeGrid();
    $episodeListModal.removeClass('visible');
    if (activeBookId) {
      loadEpisode(activeBookId, idx, { resume: false });
    }
  });

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
    const videoEl = $playerVideo.get(0);
    if (videoEl) videoEl.pause();

    $.ajax({
      url: '/api/watch',
      data: { bookId, chapterIndex },
      method: 'GET'
    })
      .done((res) => {
        if (res.videoUrl) {
          $playerVideo.attr('src', res.videoUrl);
          const v = $playerVideo.get(0);
          if (!v) return;

          $(v).off('timeupdate loadedmetadata ended');

          $(v).on('loadedmetadata', function () {
            if (shouldResume && typeof resumeFromTime === 'number') {
              if (resumeFromTime < v.duration) {
                v.currentTime = resumeFromTime;
              }
            }
            v
              .play()
              .catch(() => {});
          });

          $(v).on('timeupdate', function () {
            if (!activeBookId) return;
            if (!v.duration) return;
            const ct = v.currentTime || 0;
            if (Math.floor(ct) % 3 === 0) {
              saveProgress(activeBookId, lastLoadedChapterIndex, ct);
            }
          });

          $(v).on('ended', function () {
            if (!activeBookId) return;

            registerEpisodeWatched();

            if (!chaptersData || !chaptersData.length) {
              clearProgress(activeBookId);
              return;
            }

            const sorted = chaptersData.slice().sort((a, b) => a.index - b.index);
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
        }
      })
      .always(() => {
        $playerLoading.addClass('hidden');
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

  loadTab('foryou', 1);
});
