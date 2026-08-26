// --- STATE & CACHE ---
let currentTabCategory = 'all'; // 'all', 'movie', 'tv', 'kdrama', 'anime', 'tagalog'
let fullDataCache = {
  movies: [],
  tv: []
};

// --- TAB SWITCHING & CATEGORY FILTERING ---
async function filterContent(category, eventElement) {
  currentTabCategory = category;

  // Update active states on tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  if (eventElement) eventElement.classList.add('active');

  // Show/Hide Genre bar based on category availability
  const genreTabsEl = document.getElementById('genre-tabs');
  if (genreTabsEl) {
    // Allow genres for movies, tv, anime, kdrama, and tagalog
    genreTabsEl.style.display = ['movie', 'tv', 'kdrama', 'anime', 'tagalog'].includes(category) ? 'flex' : 'none';
  }

  // Reset genre buttons selection back to 'all' when switching tabs
  document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('active'));
  const allGenreBtn = document.querySelector('.genre-btn[data-genre="all"]');
  if (allGenreBtn) allGenreBtn.classList.add('active');

  // Handle Visibility of Content Rows
  document.querySelectorAll('.content-row').forEach(row => row.style.display = 'none');

  if (category === 'all') {
    // Show main default rows
    document.getElementById('movies-row').style.display = 'block';
    document.getElementById('tvshows-row').style.display = 'block';
    displayList(fullDataCache.movies, 'movies-list', 'movie');
    displayList(fullDataCache.tv, 'tvshows-list', 'tv');
  } else if (category === 'movie') {
    document.getElementById('movies-row').style.display = 'block';
    displayList(fullDataCache.movies, 'movies-list', 'movie');
  } else if (category === 'tv' || category === 'kdrama') {
    document.getElementById('tvshows-row').style.display = 'block';
    // If KDrama, you can fetch or filter KDramas specifically here if desired
    displayList(fullDataCache.tv, 'tvshows-list', 'tv');
  } else if (category === 'anime') {
    let animeRow = document.getElementById('anime-row');
    if (animeRow) animeRow.style.display = 'block';
    // Fetch or display anime list cache
    fetchAndDisplayAnime();
  } else if (category === 'tagalog') {
    let tagalogRow = document.getElementById('tagalog-row');
    if (tagalogRow) tagalogRow.style.display = 'block';
    fetchAndDisplayTagalog();
  }
}

// --- GENRE FILTERING (Fixes Movies, TV, Anime, & Tagalog genres) ---
async function filterByGenre(genreId, eventElement) {
  document.querySelectorAll('.genre-btn').forEach(btn => btn.classList.remove('active'));
  if (eventElement) eventElement.classList.add('active');

  let targetMediaType = 'movie';
  let targetRowId = 'movies-list';
  let rowElementId = 'movies-row';
  let extraParams = {};

  // Map the active category tab to correct endpoints, targets, and parameters
  if (currentTabCategory === 'tv' || currentTabCategory === 'kdrama') {
    targetMediaType = 'tv';
    targetRowId = 'tvshows-list';
    rowElementId = 'tvshows-row';
  } else if (currentTabCategory === 'anime') {
    targetMediaType = 'tv';
    targetRowId = 'anime-list';
    rowElementId = 'anime-row';
    extraParams = { with_genres: '16' }; // Animation genre baseline for anime
  } else if (currentTabCategory === 'tagalog') {
    targetMediaType = 'movie';
    targetRowId = 'tagalog-list';
    rowElementId = 'tagalog-row';
    extraParams = {
      with_original_language: 'tl',
      region: 'PH'
    };
  }

  const endpoint = targetMediaType === 'movie' ? '/discover/movie' : '/discover/tv';

  // Isolate and show only the relevant content row
  document.querySelectorAll('.content-row').forEach(row => row.style.display = 'none');
  const rowEl = document.getElementById(rowElementId);
  if (rowEl) rowEl.style.display = 'block';

  // Handle 'all' selection inside the specific category tab
  if (genreId === 'all') {
    if (currentTabCategory === 'tagalog') {
      fetchAndDisplayTagalog();
    } else if (currentTabCategory === 'anime') {
      fetchAndDisplayAnime();
    } else if (targetMediaType === 'movie') {
      displayList(fullDataCache.movies, 'movies-list', 'movie');
    } else {
      displayList(fullDataCache.tv, 'tvshows-list', 'tv');
    }
    return;
  }

  // Fetch from TMDB combining genre + context parameters (e.g., Tagalog language tag)
  const data = await tmdbFetch(endpoint, {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page: 1,
    ...extraParams
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = targetMediaType; });
    displayList(data.results, targetRowId, targetMediaType);
  }
}

// --- DEDICATED FETCH HELPERS ---

async function fetchAndDisplayTagalog() {
  const data = await tmdbFetch('/discover/movie', {
    with_original_language: 'tl',
    region: 'PH',
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'movie'; });
    displayList(data.results, 'tagalog-list', 'movie');
  }
}

async function fetchAndDisplayAnime() {
  const data = await tmdbFetch('/discover/tv', {
    with_genres: '16', // Animation
    with_original_language: 'ja', // Japanese language for anime
    sort_by: 'popularity.desc',
    page: 1
  });

  if (data && Array.isArray(data.results)) {
    data.results.forEach(item => { item.media_type = 'tv'; });
    displayList(data.results, 'anime-list', 'tv');
  }
}
