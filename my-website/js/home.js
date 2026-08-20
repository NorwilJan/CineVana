const API_KEY = 'c5f2e226dd2ee0c8ed2c272a0ebaf049';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/original';

const PLACEHOLDER_IMG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="130" height="195" fill="%23222"><rect width="100%" height="100%"/></svg>';

const VIVAMAX_COMPANY_ID = 149142;

let currentItem = null;
let bannerItem = null;

let currentSeason = 1;
let currentEpisode = 1;

let searchTimeout = null;

let showDetailsCache = {};

let fullDataCache = {
  movies: [],
  tv: [],
  anime: [],
  tagalog: [],
  kdrama: [],
  vivamax: []
};

/* SEE ALL STATE */
let gridCategory = null;
let gridPage = 1;
let gridLoading = false;
let gridHasMore = true;
let gridScrollPosition = 0;

/* Used to restore See All after closing details */
let openedFromGrid = false;


/* =========================
   FETCH MULTIPLE PAGES
========================= */

async function fetchMultiplePages(endpoint, maxPages = 3) {

  let allResults = [];

  try {

    for (let page = 1; page <= maxPages; page++) {

      const separator =
        endpoint.includes('?') ? '&' : '?';

      const url =
        `${BASE_URL}${endpoint}${separator}page=${page}&api_key=${API_KEY}`;

      const res = await fetch(url);

      if (!res.ok) continue;

      const data = await res.json();

      if (data.results) {
        allResults =
          allResults.concat(data.results);
      }
    }

  } catch (error) {

    console.error(
      'Error fetching multiple pages:',
      error
    );
  }

  return allResults;
}


/* =========================
   TRENDING
========================= */

async function fetchTrending(type) {

  return await fetchMultiplePages(
    `/trending/${type}/week?`,
    3
  );
}


/* =========================
   ANIME
========================= */

async function fetchTrendingAnime() {

  let allResults = [];

  try {

    for (let page = 1; page <= 5; page++) {

      const res = await fetch(
        `${BASE_URL}/trending/tv/week?api_key=${API_KEY}&page=${page}`
      );

      if (!res.ok) continue;

      const data = await res.json();

      if (data.results) {

        const filtered =
          data.results.filter(item =>
            item.original_language === 'ja' &&
            item.genre_ids &&
            item.genre_ids.includes(16)
          );

        allResults =
          allResults.concat(filtered);
      }
    }

  } catch (error) {

    console.error(
      'Error fetching anime:',
      error
    );
  }

  return allResults;
}


/* =========================
   TAGALOG
========================= */

async function fetchTagalogContent() {

  return await fetchMultiplePages(
    `/discover/movie?with_original_language=tl&sort_by=popularity.desc`,
    3
  );
}


/* =========================
   K-DRAMA
========================= */

async function fetchKDramas() {

  return await fetchMultiplePages(
    `/discover/tv?with_original_language=ko&sort_by=popularity.desc`,
    3
  );
}


/* =========================
   GENRE
========================= */

async function fetchByGenreId(genreId) {

  return await fetchMultiplePages(
    `/discover/movie?with_genres=${genreId}&sort_by=popularity.desc`,
    3
  );
}


/* =========================
   VIVAMAX
========================= */

async function fetchVivamax(page = 1) {

  try {

    const url =
      `${BASE_URL}/discover/movie` +
      `?with_companies=${VIVAMAX_COMPANY_ID}` +
      `&sort_by=vote_average.desc` +
      `&vote_count.gte=5` +
      `&include_adult=true` +
      `&page=${page}` +
      `&api_key=${API_KEY}`;

    const res =
      await fetch(url);

    if (!res.ok) {
      console.error(
        'Vivamax request failed:',
        res.status
      );
      return {
        results: [],
        total_pages: 0
      };
    }

    return await res.json();

  } catch (error) {

    console.error(
      'Error fetching Vivamax:',
      error
    );

    return {
      results: [],
      total_pages: 0
    };
  }
}


/* =========================
   BANNER
========================= */

function displayBanner(item) {

  if (!item || !item.backdrop_path) return;

  bannerItem = item;

  const bannerEl =
    document.getElementById('banner');

  const titleEl =
    document.getElementById('banner-title');

  if (bannerEl) {

    bannerEl.style.backgroundImage =
      `linear-gradient(to top, #111 10%, rgba(17,17,17,0.4) 60%, rgba(17,17,17,0.8)), url(${IMG_URL}${item.backdrop_path})`;
  }

  if (titleEl) {

    titleEl.textContent =
      item.title || item.name;
  }
}


function playBanner() {

  if (bannerItem) {
    showDetails(bannerItem);
  }
}


/* =========================
   HORIZONTAL LIST
========================= */

function displayList(
  items,
  containerId,
  mediaType
) {

  const container =
    document.getElementById(containerId);

  if (!container) return;

  container.innerHTML = '';

  items.slice(0, 20).forEach(item => {

    if (!item.poster_path) return;

    if (!item.media_type) {
      item.media_type = mediaType;
    }

    const img =
      document.createElement('img');

    img.src =
      `${IMG_URL}${item.poster_path}`;

    img.alt =
      item.title || item.name;

    img.loading = 'lazy';

    img.onerror = () => {
      img.src = PLACEHOLDER_IMG;
    };

    img.onclick = () => {
      openedFromGrid = false;
      showDetails(item);
    };

    container.appendChild(img);
  });
}


/* =========================
   SHOW DETAILS
========================= */

async function showDetails(item) {

  currentItem = item;

  let continueList =
    getContinueWatching();

  let savedProgress =
    continueList.find(
      i => i.id === item.id
    );

  currentSeason =
    savedProgress
      ? (savedProgress.savedSeason || 1)
      : 1;

  currentEpisode =
    savedProgress
      ? (savedProgress.savedEpisode || 1)
      : 1;

  const title =
    document.getElementById('modal-title');

  const description =
    document.getElementById('modal-description');

  const image =
    document.getElementById('modal-image');

  const rating =
    document.getElementById('modal-rating');

  if (title) {

    title.textContent =
      item.title || item.name;
  }

  if (description) {

    description.textContent =
      item.overview ||
      'No description available.';
  }

  if (image) {

    image.src =
      `${IMG_URL}${item.poster_path}`;

    image.onerror = () => {
      image.src = PLACEHOLDER_IMG;
    };
  }

  if (rating) {

    rating.innerHTML =
      item.vote_average
        ? '★'.repeat(
            Math.round(
              item.vote_average / 2
            )
          )
        : '';
  }

  updateWatchlistButton();

  saveCurrentProgress();

  const isTv =
    currentItem.media_type === 'tv' ||
    !currentItem.title;

  const seriesOptions =
    document.getElementById(
      'series-options'
    );

  if (isTv) {

    seriesOptions.style.display =
      'flex';

    await loadTVSeasons(
      currentItem.id,
      currentSeason,
      currentEpisode
    );

  } else {

    seriesOptions.style.display =
      'none';

    loadVideo();
  }

  document.getElementById(
    'modal'
  ).classList.add('active');

  document.body.classList.add(
    'modal-open'
  );
}


/* =========================
   VIDEO
========================= */

function loadVideo() {

  if (!currentItem) return;

  const isTv =
    currentItem.media_type === 'tv' ||
    !currentItem.title;

  let embedURL;

  if (isTv) {

    embedURL =
      `https://player.videasy.net/tv/${currentItem.id}/${currentSeason}/${currentEpisode}`;

  } else {

    embedURL =
      `https://player.videasy.net/movie/${currentItem.id}`;
  }

  const iframe =
    document.getElementById('modal-video');

  if (iframe) {
    iframe.src = embedURL;
  }
}


/* =========================
   TV SEASONS
========================= */

async function loadTVSeasons(
  tvId,
  targetSeason = 1,
  targetEpisode = 1
) {

  const seasonSelect =
    document.getElementById(
      'season-select'
    );

  if (!seasonSelect) return;

  seasonSelect.innerHTML = '';

  try {

    let data =
      showDetailsCache[tvId];

    if (!data) {

      const res =
        await fetch(
          `${BASE_URL}/tv/${tvId}?api_key=${API_KEY}`
        );

      if (res.ok) {

        data =
          await res.json();

        showDetailsCache[tvId] =
          data;
      }
    }

    if (data && data.seasons) {

      data.seasons.forEach(
        season => {

          if (
            season.season_number > 0
          ) {

            const option =
              document.createElement(
                'option'
              );

            option.value =
              season.season_number;

            option.textContent =
              season.name ||
              `Season ${season.season_number}`;

            if (
              season.season_number ===
              targetSeason
            ) {

              option.selected = true;
            }

            seasonSelect.appendChild(
              option
            );
          }
        }
      );
    }

    currentSeason =
      targetSeason;

    currentEpisode =
      targetEpisode;

    await loadEpisodes(
      tvId,
      targetSeason
    );

  } catch (error) {

    console.error(
      'Error loading TV seasons:',
      error
    );
  }
}


/* =========================
   EPISODES
========================= */

async function loadEpisodes(
  tvId,
  seasonNumber
) {

  const oldSeason =
    currentSeason;

  currentSeason =
    seasonNumber;

  const episodesContainer =
    document.getElementById(
      'episodes-container'
    );

  if (!episodesContainer) return;

  episodesContainer.innerHTML = '';

  try {

    const res =
      await fetch(
        `${BASE_URL}/tv/${tvId}/season/${seasonNumber}?api_key=${API_KEY}`
      );

    if (!res.ok) return;

    const data =
      await res.json();

    if (
      data.episodes &&
      data.episodes.length > 0
    ) {

      if (
        oldSeason !== seasonNumber ||
        !currentEpisode
      ) {

        currentEpisode =
          data.episodes[0]
            .episode_number;
      }

      data.episodes.forEach(
        ep => {

          const btn =
            document.createElement(
              'button'
            );

          btn.className =
            `episode-btn ${
              ep.episode_number ===
              currentEpisode
                ? 'active'
                : ''
            }`;

          btn.textContent =
            `Ep ${ep.episode_number}`;

          btn.onclick = () => {

            document
              .querySelectorAll(
                '.episode-btn'
              )
              .forEach(
                b =>
                  b.classList.remove(
                    'active'
                  )
              );

            btn.classList.add(
              'active'
            );

            currentEpisode =
              ep.episode_number;

            loadVideo();

            saveCurrentProgress();
          };

          episodesContainer.appendChild(
            btn
          );
        }
      );
    }

    loadVideo();

  } catch (error) {

    console.error(
      'Error loading episodes:',
      error
    );
  }
}


function onSeasonChange() {

  const selectedSeason =
    document.getElementById(
      'season-select'
    ).value;

  currentEpisode = 1;

  loadEpisodes(
    currentItem.id,
    parseInt(selectedSeason)
  );
}


/* =========================
   CLOSE MOVIE MODAL
========================= */

function closeModal() {

  const iframe =
    document.getElementById(
      'modal-video'
    );

  if (iframe) {
    iframe.src = 'about:blank';
  }

  document.getElementById(
    'modal'
  ).classList.remove('active');

  document.body.classList.remove(
    'modal-open'
  );

  /*
   * If movie was opened from See All,
   * restore the See All screen and
   * exactly where the user was.
   */
  if (openedFromGrid) {

    const gridModal =
      document.getElementById(
        'grid-modal'
      );

    if (gridModal) {

      gridModal.classList.add(
        'active'
      );

      document.body.classList.add(
        'modal-open'
      );

      const scrollArea =
        document.getElementById(
          'grid-scroll-area'
        );

      if (scrollArea) {

        requestAnimationFrame(() => {

          scrollArea.scrollTop =
            gridScrollPosition;
        });
      }
    }
  }
}


/* =========================
   WATCHLIST
========================= */

function getWatchlist() {

  return JSON.parse(
    localStorage.getItem(
      'myList'
    )
  ) || [];
}


function isItemInWatchlist(id) {

  return getWatchlist()
    .some(
      item => item.id === id
    );
}


function toggleWatchlist() {

  if (!currentItem) return;

  let list =
    getWatchlist();

  const index =
    list.findIndex(
      item =>
        item.id === currentItem.id
    );

  if (index > -1) {

    list.splice(index, 1);

  } else {

    list.push(currentItem);
  }

  localStorage.setItem(
    'myList',
    JSON.stringify(list)
  );

  updateWatchlistButton();

  renderWatchlistRow();
}


function updateWatchlistButton() {

  const btn =
    document.getElementById(
      'watchlist-btn'
    );

  if (!btn || !currentItem) return;

  if (
    isItemInWatchlist(
      currentItem.id
    )
  ) {

    btn.textContent =
      'Remove from List';

    btn.classList.add(
      'remove'
    );

  } else {

    btn.textContent =
      'Add to List';

    btn.classList.remove(
      'remove'
    );
  }
}


function renderWatchlistRow() {

  const list =
    getWatchlist();

  const row =
    document.getElementById(
      'watchlist-row'
    );

  if (!row) return;

  row.style.display =
    list.length === 0
      ? 'none'
      : 'block';

  if (list.length > 0) {

    displayList(
      list,
      'watchlist-list',
      'movie'
    );
  }
}


/* =========================
   CONTINUE WATCHING
========================= */

function getContinueWatching() {

  return JSON.parse(
    localStorage.getItem(
      'continueWatching'
    )
  ) || [];
}


function saveCurrentProgress() {

  if (!currentItem) return;

  let list =
    getContinueWatching();

  const existingIndex =
    list.findIndex(
      i =>
        i.id === currentItem.id
    );

  const itemData = {

    ...currentItem,

    savedSeason:
      currentSeason,

    savedEpisode:
      currentEpisode,

    lastWatched:
      Date.now()
  };

  if (existingIndex > -1) {

    list.splice(
      existingIndex,
      1
    );
  }

  list.unshift(
    itemData
  );

  if (list.length > 15) {
    list.pop();
  }

  localStorage.setItem(
    'continueWatching',
    JSON.stringify(list)
  );

  renderContinueWatchingRow();
}


function renderContinueWatchingRow() {

  const list =
    getContinueWatching();

  const row =
    document.getElementById(
      'continue-row'
    );

  if (!row) return;

  row.style.display =
    list.length === 0
      ? 'none'
      : 'block';

  if (list.length > 0) {

    displayList(
      list,
      'continue-list',
      'movie'
    );
  }
}


/* =========================
   CATEGORY FILTER
========================= */

function filterContent(
  category,
  eventElement
) {

  document
    .querySelectorAll(
      '.tab-btn'
    )
    .forEach(
      btn =>
        btn.classList.remove(
          'active'
        )
    );

  eventElement.classList.add(
    'active'
  );

  const rows = {

    continue:
      document.getElementById(
        'continue-row'
      ),

    watchlist:
      document.getElementById(
        'watchlist-row'
      ),

    movies:
      document.getElementById(
        'movies-row'
      ),

    tv:
      document.getElementById(
        'tvshows-row'
      ),

    anime:
      document.getElementById(
        'anime-row'
      ),

    tagalog:
      document.getElementById(
        'tagalog-row'
      ),

    kdrama:
      document.getElementById(
        'kdrama-row'
      ),

    vivamax:
      document.getElementById(
        'vivamax-row'
      )
  };

  const hasWatchlist =
    getWatchlist().length > 0;

  const hasContinue =
    getContinueWatching().length > 0;

  Object.values(rows).forEach(
    r => {

      if (r)
        r.style.display =
          'none';
    }
  );

  if (category === 'all') {

    if (
      hasContinue &&
      rows.continue
    )
      rows.continue.style.display =
        'block';

    if (
      hasWatchlist &&
      rows.watchlist
    )
      rows.watchlist.style.display =
        'block';

    if (rows.movies)
      rows.movies.style.display =
        'block';

    if (rows.tv)
      rows.tv.style.display =
        'block';

    if (rows.anime)
      rows.anime.style.display =
        'block';

    if (rows.tagalog)
      rows.tagalog.style.display =
        'block';

    if (rows.kdrama)
      rows.kdrama.style.display =
        'block';

    if (rows.vivamax)
      rows.vivamax.style.display =
        'block';

  } else if (category === 'movie') {

    if (rows.movies)
      rows.movies.style.display =
        'block';

    if (rows.tagalog)
      rows.tagalog.style.display =
        'block';

    if (rows.vivamax)
      rows.vivamax.style.display =
        'block';

  } else if (category === 'tv') {

    if (rows.tv)
      rows.tv.style.display =
        'block';

    if (rows.kdrama)
      rows.kdrama.style.display =
        'block';

  } else if (category === 'anime') {

    if (rows.anime)
      rows.anime.style.display =
        'block';
  }
}


/* =========================
   GENRE FILTER
========================= */

async function filterByGenre(
  genreId,
  eventElement
) {

  document
    .querySelectorAll(
      '.genre-btn'
    )
    .forEach(
      btn =>
        btn.classList.remove(
          'active'
        )
    );

  eventElement.classList.add(
    'active'
  );

  if (genreId === 'all') {

    init();

    return;
  }

  const genreResults =
    await fetchByGenreId(
      genreId
    );

  [
    'continue-row',
    'watchlist-row',
    'tvshows-row',
    'anime-row',
    'tagalog-row',
    'kdrama-row',
    'vivamax-row'
  ].forEach(id => {

    const el =
      document.getElementById(id);

    if (el)
      el.style.display =
        'none';
  });

  const moviesRow =
    document.getElementById(
      'movies-row'
    );

  if (moviesRow) {

    moviesRow.style.display =
      'block';

    moviesRow.querySelector(
      'h2'
    ).textContent =
      `${eventElement.textContent} Movies`;

    displayList(
      genreResults,
      'movies-list',
      'movie'
    );
  }
}


/* =========================
   SEE ALL
========================= */

function openGridModal(category) {

  const modal =
    document.getElementById(
      'grid-modal'
    );

  const titleEl =
    document.getElementById(
      'grid-modal-title'
    );

  const scrollArea =
    document.getElementById(
      'grid-scroll-area'
    );

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  gridCategory =
    category;

  gridPage = 1;

  gridLoading = false;

  gridHasMore = true;

  openedFromGrid = true;

  if (scrollArea) {
    scrollArea.scrollTop = 0;
  }

  const titles = {

    movies:
      'Trending Movies',

    tv:
      'Trending TV Shows',

    anime:
      'Trending Anime',

    tagalog:
      'Trending Tagalog Movies',

    kdrama:
      'Trending K-Dramas',

    vivamax:
      'Top Rated Vivamax'
  };

  if (titleEl) {

    titleEl.textContent =
      titles[category] ||
      'Category';
  }

  container.innerHTML = '';

  modal.classList.add(
    'active'
  );

  document.body.classList.add(
    'modal-open'
  );

  loadGridPage();
}


async function loadGridPage() {

  if (
    gridLoading ||
    !gridHasMore ||
    !gridCategory
  ) {
    return;
  }

  gridLoading = true;

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  const loading =
    document.createElement(
      'div'
    );

  loading.className =
    'grid-loading';

  loading.textContent =
    'Loading...';

  container.appendChild(
    loading
  );

  try {

    let data;

    if (
      gridCategory ===
      'vivamax'
    ) {

      data =
        await fetchVivamax(
          gridPage
        );

    } else {

      let endpoint;

      switch (
        gridCategory
      ) {

        case 'movies':

          endpoint =
            `/trending/movie/week?`;
          break;

        case 'tv':

          endpoint =
            `/trending/tv/week?`;
          break;

        case 'anime':

          endpoint =
            `/trending/tv/week?`;
          break;

        case 'tagalog':

          endpoint =
            `/discover/movie?with_original_language=tl&sort_by=popularity.desc`;
          break;

        case 'kdrama':

          endpoint =
            `/discover/tv?with_original_language=ko&sort_by=popularity.desc`;
          break;

        default:

          endpoint = '';
      }

      const separator =
        endpoint.includes('?')
          ? '&'
          : '?';

      const res =
        await fetch(
          `${BASE_URL}${endpoint}${separator}page=${gridPage}&api_key=${API_KEY}`
        );

      if (!res.ok) {
        throw new Error(
          `HTTP ${res.status}`
        );
      }

      data =
        await res.json();
    }

    loading.remove();

    const results =
      data.results || [];

    if (
      results.length === 0
    ) {

      gridHasMore = false;

      showGridEnd();

      return;
    }

    results.forEach(
      item => {

        if (
          !item.poster_path
        )
          return;

        if (
          gridCategory ===
          'anime'
        ) {
          item.media_type =
            'tv';
        }

        if (
          gridCategory ===
            'movies' ||
          gridCategory ===
            'tagalog' ||
          gridCategory ===
            'vivamax'
        ) {
          item.media_type =
            'movie';
        }

        if (
          gridCategory ===
          'tv' ||
          gridCategory ===
          'kdrama'
        ) {
          item.media_type =
            'tv';
        }

        const img =
          document.createElement(
            'img'
          );

        img.src =
          `${IMG_URL}${item.poster_path}`;

        img.alt =
          item.title ||
          item.name;

        img.loading = 'lazy';

        img.onerror = () => {
          img.src =
            PLACEHOLDER_IMG;
        };

        img.onclick = () => {

          const scrollArea =
            document.getElementById(
              'grid-scroll-area'
            );

          if (scrollArea) {

            gridScrollPosition =
              scrollArea.scrollTop;
          }

          document
            .getElementById(
              'grid-modal'
            )
            .classList.remove(
              'active'
            );

          openedFromGrid = true;

          showDetails(item);
        };

        container.appendChild(
          img
        );
      }
    );

    const totalPages =
      data.total_pages || 1;

    if (
      gridPage >= totalPages
    ) {

      gridHasMore = false;

      showGridEnd();

    } else {

      gridPage++;
    }

  } catch (error) {

    console.error(
      'Grid loading error:',
      error
    );

    loading.remove();

  } finally {

    gridLoading = false;
  }
}


function showGridEnd() {

  const container =
    document.getElementById(
      'grid-modal-results'
    );

  if (!container) return;

  if (
    container.querySelector(
      '.grid-end'
    )
  ) {
    return;
  }

  const end =
    document.createElement(
      'div'
    );

  end.className =
    'grid-end';

  end.textContent =
    'You have reached the end.';

  container.appendChild(
    end
  );
}


function handleGridScroll() {

  const scrollArea =
    document.getElementById(
      'grid-scroll-area'
    );

  if (!scrollArea) return;

  const distanceFromBottom =
    scrollArea.scrollHeight -
    scrollArea.scrollTop -
    scrollArea.clientHeight;

  if (
    distanceFromBottom <
      600 &&
    !gridLoading &&
    gridHasMore
  ) {

    loadGridPage();
  }
}


function closeGridModal() {

  document.getElementById(
    'grid-modal'
  ).classList.remove(
    'active'
  );

  document.body.classList.remove(
    'modal-open'
  );

  openedFromGrid = false;
}


/* =========================
   SEARCH
========================= */

function openSearchModal() {

  document.getElementById(
    'search-modal'
  ).classList.add(
    'active'
  );

  document.body.classList.add(
    'modal-open'
  );

  document.getElementById(
    'search-input'
  ).focus();
}


function closeSearchModal() {

  document.getElementById(
    'search-modal'
  ).classList.remove(
    'active'
  );

  document.body.classList.remove(
    'modal-open'
  );

  document.getElementById(
    'search-results'
  ).innerHTML = '';

  document.getElementById(
    'search-input'
  ).value = '';
}


function debounceSearch() {

  clearTimeout(
    searchTimeout
  );

  searchTimeout =
    setTimeout(
      searchTMDB,
      300
    );
}


async function searchTMDB() {

  const query =
    document.getElementById(
      'search-input'
    ).value;

  const container =
    document.getElementById(
      'search-results'
    );

  if (!query.trim()) {

    container.innerHTML = '';

    return;
  }

  try {

    const res =
      await fetch(
        `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${encodeURIComponent(query)}`
      );

    if (!res.ok) return;

    const data =
      await res.json();

    container.innerHTML = '';

    data.results.forEach(
      item => {

        if (
          !item.poster_path ||
          item.media_type === 'person'
        ) {
          return;
        }

        if (!item.media_type) {

          item.media_type =
            item.title
              ? 'movie'
              : 'tv';
        }

        const img =
          document.createElement(
            'img'
          );

        img.src =
          `${IMG_URL}${item.poster_path}`;

        img.alt =
          item.title ||
          item.name;

        img.loading = 'lazy';

        img.onerror = () => {
          img.src =
            PLACEHOLDER_IMG;
        };

        img.onclick = () => {

          closeSearchModal();

          openedFromGrid = false;

          showDetails(item);
        };

        container.appendChild(
          img
        );
      }
    );

  } catch (error) {

    console.error(
      'Search error:',
      error
    );
  }
}


/* =========================
   INITIALIZATION
========================= */

async function init() {

  try {

    const [
      movies,
      tvShows,
      anime,
      tagalogMovies,
      kDramas,
      vivamaxData
    ] = await Promise.all([

      fetchTrending('movie'),

      fetchTrending('tv'),

      fetchTrendingAnime(),

      fetchTagalogContent(),

      fetchKDramas(),

      fetchVivamax(1)
    ]);

    const vivamax =
      vivamaxData.results || [];

    fullDataCache = {

      movies,

      tv: tvShows,

      anime,

      tagalog:
        tagalogMovies,

      kdrama:
        kDramas,

      vivamax
    };

    /* Banner */

    if (
      movies.length > 0
    ) {

      displayBanner(
        movies[
          Math.floor(
            Math.random() *
            movies.length
          )
        ]
      );
    }

    /* Titles */

    const movieRowH2 =
      document.querySelector(
        '#movies-row h2'
      );

    if (movieRowH2) {

      movieRowH2.textContent =
        'Trending Movies';
    }

    /* Lists */

    displayList(
      movies,
      'movies-list',
      'movie'
    );

    displayList(
      tvShows,
      'tvshows-list',
      'tv'
    );

    displayList(
      anime,
      'anime-list',
      'tv'
    );

    displayList(
      tagalogMovies,
      'tagalog-list',
      'movie'
    );

    displayList(
      kDramas,
      'kdrama-list',
      'tv'
    );

    displayList(
      vivamax,
      'vivamax-list',
      'movie'
    );

    renderWatchlistRow();

    renderContinueWatchingRow();

  } catch (error) {

    console.error(
      'Initialization error:',
      error
    );
  }
}


/* =========================
   GRID SCROLL LISTENER
========================= */

document.addEventListener(
  'DOMContentLoaded',
  () => {

    const scrollArea =
      document.getElementById(
        'grid-scroll-area'
      );

    if (scrollArea) {

      scrollArea.addEventListener(
        'scroll',
        handleGridScroll
      );
    }
  }
);


init();