// Real-Time Weather Dashboard - App Script
// Requires a global OPENWEATHER_API_KEY defined in config.js

(function () {
  const API_BASE = 'https://api.openweathermap.org/data/2.5';
  const PREDEFINED_CITIES = [
    'New York, US',
    'London, GB',
    'Tokyo, JP',
    'Sydney, AU',
    'Paris, FR',
    'Toronto, CA',
    'Dubai, AE',
    'Singapore',
  ];

  const state = {
    units: localStorage.getItem('units') || 'metric',
    lastSearchedCity: null,
  };

  const el = {
    unitC: document.getElementById('unitC'),
    unitF: document.getElementById('unitF'),
    searchForm: document.getElementById('searchForm'),
    searchInput: document.getElementById('searchInput'),
    searchError: document.getElementById('searchError'),
    searchResult: document.getElementById('searchResult'),
    searchEmpty: document.getElementById('searchEmpty'),
    citiesContainer: document.getElementById('citiesContainer'),
    citiesLoading: document.getElementById('citiesLoading'),
    locationContainer: document.getElementById('locationContainer'),
    locationLoading: document.getElementById('locationLoading'),
  };

  function getApiKey() {
    const key = (window && window.OPENWEATHER_API_KEY) || '';
    if (!key) {
      showGlobalError('Missing OpenWeather API key. Create config.js from config.example.js.');
    }
    return key;
  }

  function showGlobalError(message) {
    // Reuse searchError as a global visible error if search section is on top
    if (el.searchError) {
      el.searchError.textContent = message;
      el.searchError.classList.remove('hidden');
    } else {
      alert(message);
    }
  }

  function setUnits(units) {
    if (units !== 'metric' && units !== 'imperial') return;
    state.units = units;
    localStorage.setItem('units', units);
    // Update toggle UI
    const isMetric = units === 'metric';
    el.unitC.setAttribute('aria-pressed', String(isMetric));
    el.unitF.setAttribute('aria-pressed', String(!isMetric));
    // Re-render
    renderPredefinedCities();
    if (state.lastSearchedCity) {
      renderSearchResult(state.lastSearchedCity);
    }
    if (el.locationContainer.dataset.lat && el.locationContainer.dataset.lon) {
      renderLocation(+el.locationContainer.dataset.lat, +el.locationContainer.dataset.lon);
    }
  }

  function unitSymbol() {
    return state.units === 'metric' ? '°C' : '°F';
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
    return res.json();
  }

  function buildCityQuery(city) {
    return `q=${encodeURIComponent(city)}`;
  }
  function buildCoordQuery(lat, lon) {
    return `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
  }

  function weatherUrl(query) {
    const key = getApiKey();
    return `${API_BASE}/weather?${query}&appid=${key}&units=${state.units}`;
  }
  function forecastUrl(query) {
    const key = getApiKey();
    return `${API_BASE}/forecast?${query}&appid=${key}&units=${state.units}`;
  }

  async function fetchCurrentWeatherByCity(city) {
    return fetchJson(weatherUrl(buildCityQuery(city)));
  }
  async function fetchForecastByCity(city) {
    return fetchJson(forecastUrl(buildCityQuery(city)));
  }
  async function fetchCurrentWeatherByCoords(lat, lon) {
    return fetchJson(weatherUrl(buildCoordQuery(lat, lon)));
  }
  async function fetchForecastByCoords(lat, lon) {
    return fetchJson(forecastUrl(buildCoordQuery(lat, lon)));
  }

  function aggregate3DayForecast(list) {
    // Group 3-hourly items by date string (YYYY-MM-DD)
    const byDate = new Map();
    for (const item of list) {
      const date = item.dt_txt.split(' ')[0];
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(item);
    }
    const today = new Date().toISOString().slice(0, 10);
    const dates = Array.from(byDate.keys()).filter(d => d > today).slice(0, 3);
    return dates.map(d => {
      const items = byDate.get(d);
      let min = Infinity, max = -Infinity, chosen = items[0];
      let midday = items.find(x => x.dt_txt.includes('12:00:00')) || items[Math.floor(items.length / 2)];
      for (const it of items) {
        if (it.main.temp_min < min) min = it.main.temp_min;
        if (it.main.temp_max > max) max = it.main.temp_max;
      }
      return {
        date: d,
        temp_min: Math.round(min),
        temp_max: Math.round(max),
        weather: midday.weather[0],
      };
    });
  }

  function formatDayName(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }

  function createCard({ cityName, country, temp, description, icon, hi, lo, forecast3 }) {
    const card = document.createElement('article');
    card.className = 'card';

    const header = document.createElement('div');
    header.className = 'card-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'city-name';
    title.textContent = country ? `${cityName}, ${country}` : cityName;
    const condition = document.createElement('div');
    condition.className = 'condition';
    condition.textContent = description;
    titleWrap.appendChild(title);
    titleWrap.appendChild(condition);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';
    const image = document.createElement('img');
    image.className = 'icon';
    image.alt = description;
    image.src = `https://openweathermap.org/img/wn/${icon}@2x.png`;
    const tempEl = document.createElement('div');
    tempEl.className = 'temp';
    tempEl.textContent = `${Math.round(temp)}${unitSymbol()}`;
    right.appendChild(tempEl);
    right.appendChild(image);

    header.appendChild(titleWrap);
    header.appendChild(right);

    const body = document.createElement('div');
    body.className = 'card-body';
    const hilo = document.createElement('div');
    hilo.className = 'hi-lo';
    if (typeof hi === 'number' && typeof lo === 'number') {
      hilo.textContent = `H: ${Math.round(hi)}${unitSymbol()} • L: ${Math.round(lo)}${unitSymbol()}`;
    }

    const forecastWrap = document.createElement('div');
    forecastWrap.className = 'forecast';
    for (const day of forecast3) {
      const d = document.createElement('div');
      d.className = 'forecast-day';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = formatDayName(day.date);
      const ic = document.createElement('img');
      ic.className = 'f-icon';
      ic.alt = day.weather.description;
      ic.src = `https://openweathermap.org/img/wn/${day.weather.icon}.png`;
      const range = document.createElement('div');
      range.className = 'range';
      range.innerHTML = `<span style="color: var(--accent)">${day.temp_max}${unitSymbol()}</span> / <span style="color: var(--accent-2)">${day.temp_min}${unitSymbol()}</span>`;
      d.appendChild(name);
      d.appendChild(ic);
      d.appendChild(range);
      forecastWrap.appendChild(d);
    }

    body.appendChild(hilo);
    body.appendChild(forecastWrap);

    card.appendChild(header);
    card.appendChild(body);
    return card;
  }

  async function loadCityCardByCityName(city) {
    const [current, forecast] = await Promise.all([
      fetchCurrentWeatherByCity(city),
      fetchForecastByCity(city),
    ]);
    const forecast3 = aggregate3DayForecast(forecast.list);
    return createCard({
      cityName: current.name,
      country: current.sys && current.sys.country,
      temp: current.main.temp,
      description: current.weather[0].description,
      icon: current.weather[0].icon,
      hi: forecast3[0] ? forecast3[0].temp_max : undefined,
      lo: forecast3[0] ? forecast3[0].temp_min : undefined,
      forecast3,
    });
  }

  async function loadCityCardByCoords(lat, lon) {
    const [current, forecast] = await Promise.all([
      fetchCurrentWeatherByCoords(lat, lon),
      fetchForecastByCoords(lat, lon),
    ]);
    const forecast3 = aggregate3DayForecast(forecast.list);
    return createCard({
      cityName: current.name || 'Current Location',
      country: current.sys && current.sys.country,
      temp: current.main.temp,
      description: current.weather[0].description,
      icon: current.weather[0].icon,
      hi: forecast3[0] ? forecast3[0].temp_max : undefined,
      lo: forecast3[0] ? forecast3[0].temp_min : undefined,
      forecast3,
    });
  }

  async function renderPredefinedCities() {
    el.citiesContainer.innerHTML = '';
    el.citiesLoading.classList.remove('hidden');
    try {
      const cards = await Promise.all(
        PREDEFINED_CITIES.map(city => loadCityCardByCityName(city).catch(() => null))
      );
      for (const card of cards) {
        if (card) el.citiesContainer.appendChild(card);
      }
    } catch (err) {
      showGlobalError('Failed to load predefined cities. Please try again later.');
      // eslint-disable-next-line no-console
      console.error(err);
    } finally {
      el.citiesLoading.classList.add('hidden');
    }
  }

  async function renderLocation(lat, lon) {
    el.locationContainer.innerHTML = '';
    el.locationLoading.classList.remove('hidden');
    try {
      const card = await loadCityCardByCoords(lat, lon);
      el.locationContainer.appendChild(card);
      el.locationContainer.dataset.lat = String(lat);
      el.locationContainer.dataset.lon = String(lon);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Geolocation weather unavailable:', err.message);
    } finally {
      el.locationLoading.classList.add('hidden');
    }
  }

  async function renderSearchResult(city) {
    el.searchError.classList.add('hidden');
    el.searchResult.innerHTML = '';
    el.searchEmpty.classList.add('hidden');
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.setAttribute('aria-hidden', 'true');
    el.searchResult.appendChild(loader);
    try {
      const card = await loadCityCardByCityName(city);
      el.searchResult.innerHTML = '';
      el.searchResult.appendChild(card);
      state.lastSearchedCity = city;
    } catch (err) {
      el.searchResult.innerHTML = '';
      el.searchError.textContent = 'City not found. Please check the name and try again.';
      el.searchError.classList.remove('hidden');
      state.lastSearchedCity = null;
      // eslint-disable-next-line no-console
      console.error(err);
    }
  }

  function initEvents() {
    el.unitC.addEventListener('click', () => setUnits('metric'));
    el.unitF.addEventListener('click', () => setUnits('imperial'));

    el.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const city = (el.searchInput.value || '').trim();
      if (!city) {
        el.searchError.textContent = 'Please enter a city name.';
        el.searchError.classList.remove('hidden');
        return;
      }
      renderSearchResult(city);
    });
  }

  function initUnitsUi() {
    const isMetric = state.units === 'metric';
    el.unitC.setAttribute('aria-pressed', String(isMetric));
    el.unitF.setAttribute('aria-pressed', String(!isMetric));
  }

  function initGeolocation() {
    if (!('geolocation' in navigator)) return;
    el.locationLoading.classList.remove('hidden');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        renderLocation(latitude, longitude);
      },
      () => {
        el.locationLoading.classList.add('hidden');
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 }
    );
  }

  function boot() {
    initUnitsUi();
    initEvents();
    initGeolocation();
    renderPredefinedCities();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();



