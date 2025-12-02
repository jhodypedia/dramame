// public/js/main.js
$(function () {
  const $feed = $('#reelContainer');
  const $loadingOverlay = $('#loadingOverlay');
  const $pageInfo = $('#pageInfo');
  const $prevPageBtn = $('#prevPageBtn');
  const $nextPageBtn = $('#nextPageBtn');
  const $tabs = $('.tab-btn');
  const $searchForm = $('#searchForm');
  const $searchInput = $('#searchInput');
  const $searchTabBtn = $('.tab-search');

  // Modal elements
  const $modal = $('#detailModal');
  const $modalCover = $('#modalCover');
  const $modalTitle = $('#modalTitle');
  const $modalIntro = $('#modalIntro');
  const $modalEpisodeCount = $('#modalEpisodeCount');
  const $episodeList = $('#episodeList');
  const $playerVideo = $('#playerVideo');
  const $playerLoading = $('#playerLoading');
  const $continueBanner = $('#continueBanner');
  const $continueText = $('#continueText');
  const $continueBtn = $('#continueBtn');

  let currentTab = 'foryou'; // 'foryou' | 'new' | 'rank' | 'search'
  let currentPage = 1;
  let hasMore = true;
  let currentSearch = '';

  let activeBookId = null;
  let lastLoadedChapterIndex = null;
  let resumeFromTime = null;

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

  /* ===================== ADSTERRA DIRECTLINK SETIAP 5 EPISODE ===================== */

  function adShownKey(bookId, chapterIndex) {
    return `dramabox_ad_shown_${bookId}_${chapterIndex}`;
  }

  // global: berapa episode yang sudah ditonton user
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

  /**
   * Dipanggil setiap kali episode selesai (video.onended)
   * - Tambah counter global
   * - Jika counter == 5 → set trigger agar episode berikutnya bisa memicu directlink
   */
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

  /**
   * Dipanggil ketika episode di-load.
   * Jika global trigger aktif dan episode ini belum pernah kena iklan, adArmed = true
   */
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

  /* ===================== BUILD CARD ===================== */

  function buildCardHTML(item) {
    const corner = item.corner?.name || '';
    const cornerColor = item.corner?.color || '#f97316';

    return `
      <section
        class="video-card"
        data-book-id="${item.bookId}"
        data-title="${$('<div>').text(item.title).html()}"
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

  /* ===================== LOAD TAB (AJAX) ===================== */

  function loadTab(tab, page = 1, opts = {}) {
    currentTab = tab;
    currentPage = page;
    if (opts.search !== undefined) {
      currentSearch = opts.search;
    }

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

    $.ajax({
      url,
      data: { page },
      method: 'GET'
    })
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

  /* ===================== EVENTS: TAB, PAGER, SEARCH ===================== */

  $tabs.on('click', function () {
    const tab = $(this).data('tab');
    if (tab === 'search' && !currentSearch) return;
    if (tab === currentTab) return;

    if (tab !== 'search') {
      $searchTabBtn.addClass('hidden');
      currentSearch = '';
    }
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

  $searchForm.on('submit', function (e) {
    e.preventDefault();
    const q = $searchInput.val().trim();
    if (!q) return;
    $searchTabBtn.removeClass('hidden');
    currentSearch = q;
    loadTab('search', 1, { search: q });
  });

  /* ===================== MODAL DETAIL & EPISODE LIST ===================== */

  function resetModalState() {
    activeBookId = null;
    lastLoadedChapterIndex = null;
    resumeFromTime = null;
    $playerVideo.attr('src', '');
    $playerVideo.get(0)?.pause();
    $episodeList.empty();
    $continueBanner.addClass('hidden');
  }

  function openDetailModal(bookId) {
    resetModalState();
    activeBookId = bookId;

    $modal.addClass('visible');
    showLoading(true);

    $.ajax({
      url: '/api/chapters',
      data: { bookId },
      method: 'GET'
    })
      .done((res) => {
        $modalCover.attr('src', res.cover || '');
        $modalTitle.text(res.title || '');
        $modalIntro.text(res.introduction || '');
        $modalEpisodeCount.text(`${res.chapterCount || 0} episode`);

        if (!res.chapters || !res.chapters.length) {
          $episodeList.html('<li>Tidak ada episode.</li>');
          return;
        }

        const progress = loadProgress(bookId);
        let activeIndex = res.chapters[0].index;

        if (
          progress &&
          res.chapters.some((c) => c.index === progress.chapterIndex)
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

        const items = res.chapters
          .map((c) => {
            const isActive = c.index === activeIndex;
            const freeBadge = c.isFree
              ? '<span class="badge-free">Gratis</span>'
              : '';
            return `
              <li data-index="${c.index}" ${
              isActive ? 'class="active"' : ''
            }>
                <span>Ep ${c.index + 1}. ${c.name}</span>
                ${freeBadge}
              </li>
            `;
          })
          .join('');

        $episodeList.html(items);

        // AUTO PLAY episode (dengan kemungkinan resume)
        loadEpisode(activeBookId, activeIndex, { resume: true });
      })
      .fail(() => {
        $episodeList.html('<li>Gagal memuat daftar episode.</li>');
      })
      .always(() => {
        showLoading(false);
      });
  }

  function closeDetailModal() {
    $modal.removeClass('visible');
    resetModalState();
  }

  $('.modal-close').on('click', function () {
    closeDetailModal();
  });

  // Klik backdrop untuk tutup
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
      openDetailModal(bookId);
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

  // Klik episode di list
  $episodeList.on('click', 'li', function () {
    const $li = $(this);
    const idx = $li.data('index');
    if (idx === undefined) return;
    $episodeList.find('li').removeClass('active');
    $li.addClass('active');
    resumeFromTime = null; // user pilih manual, jangan resume
    if (activeBookId) {
      loadEpisode(activeBookId, idx, { resume: false });
    }
  });

  // Tombol "Lanjut" di banner
  $continueBtn.on('click', function () {
    const progress = loadProgress(activeBookId);
    if (!progress) return;

    const idx = progress.chapterIndex;
    resumeFromTime = progress.currentTime || 0;

    $episodeList.find('li').removeClass('active');
    $episodeList.find(`li[data-index="${idx}"]`).addClass('active');

    loadEpisode(activeBookId, idx, { resume: true });
  });

  /* ===================== LOAD EPISODE + AUTO NEXT ===================== */

  function loadEpisode(bookId, chapterIndex, opts = {}) {
    if (!bookId) return;
    lastLoadedChapterIndex = Number(chapterIndex) || 0;
    const shouldResume = !!opts.resume;

    // ARM IKLAN UNTUK EPISODE INI (kalau kena giliran)
    armAdForEpisode(bookId, lastLoadedChapterIndex);

    $playerLoading.removeClass('hidden');
    $playerVideo.attr('src', '');
    const videoEl = $playerVideo.get(0);
    if (videoEl) {
      videoEl.pause();
    }

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
              .catch(() => {
                // gesture error, abaikan
              });
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

            // Daftarkan episode selesai → untuk frekuensi iklan
            registerEpisodeWatched();

            const $current = $episodeList.find('li.active').first();
            const $next = $current.next('li');

            if ($next.length) {
              const nextIndex = $next.data('index');
              $episodeList.find('li').removeClass('active');
              $next.addClass('active');

              saveProgress(activeBookId, nextIndex, 0);
              resumeFromTime = 0;
              loadEpisode(activeBookId, nextIndex, { resume: false });
            } else {
              // kalau tidak ada episode berikutnya, bisa clear progress
              clearProgress(activeBookId);
            }
          });
        }
      })
      .always(() => {
        $playerLoading.addClass('hidden');
      });
  }

  /* ===================== DIRECTLINK CLICK HANDLER ===================== */

  // Klik apapun di dalam modal -> kalau adArmed, tembak directlink sekali
  $modal.on('click', function (e) {
    const $target = $(e.target);

    // skip kalau klik tombol close
    if ($target.closest('.modal-close').length) {
      return;
    }

    if (adArmed && window.AD_DIRECTLINK) {
      adArmed = false;
      if (activeBookId != null && lastLoadedChapterIndex != null) {
        markEpisodeAdShown(activeBookId, lastLoadedChapterIndex);
      }
      // buka directlink di tab baru
      window.open(window.AD_DIRECTLINK, '_blank');
    }
  });

  /* ===================== INIT ===================== */

  loadTab('foryou', 1);
});
