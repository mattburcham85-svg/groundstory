import { GroundStoryApi } from './groundstory-api.js';

const config = window.GROUNDSTORY_CONFIG || {};
const api = new GroundStoryApi(config);
const map = L.map('map', { zoomControl: true }).setView([35.15, -93.92], 8);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const $ = (id) => document.getElementById(id);
const status = $('status');
const list = $('storyList');
const template = $('storyTemplate');
const sourceBadge = $('sourceBadge');
let current = { lat: 35.15, lon: -93.92, label: 'Arkansas' };
let markers = L.layerGroup().addTo(map);
let userMarker;
let favoritesOnly = false;
const favoriteIds = new Set(JSON.parse(localStorage.getItem('groundstory-favorites') || '[]'));
updateFavoriteCount();

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle('error', error);
}
function metersLabel(meters) {
  if (!Number.isFinite(meters)) return '';
  return meters < 1609 ? `${Math.round(meters * 3.28084)} ft away` : `${(meters / 1609.344).toFixed(1)} mi away`;
}
function saveFavorites() {
  localStorage.setItem('groundstory-favorites', JSON.stringify([...favoriteIds]));
  updateFavoriteCount();
}
function updateFavoriteCount() { $('favoriteCount').textContent = favoriteIds.size; }
function storySource(story) { return story.sources?.[0]?.url || ''; }
function directionsUrl(story) { return `https://www.google.com/maps/dir/?api=1&destination=${story.location.lat},${story.location.lon}`; }

async function loadStories() {
  setStatus(`Looking for stories near ${current.label}…`);
  $('resultsTitle').textContent = current.label;
  list.innerHTML = '';
  markers.clearLayers();
  try {
    const result = await api.nearby({
      lat: current.lat,
      lon: current.lon,
      radiusKm: Number($('radiusSelect').value),
      limit: Number($('limitSelect').value)
    });
    let stories = result.stories || [];
    if (favoritesOnly) stories = stories.filter((s) => favoriteIds.has(s.id));
    sourceBadge.hidden = false;
    sourceBadge.textContent = result.fallback ? 'Live Wikimedia preview' : 'GroundStory Engine';
    renderStories(stories);
    setStatus(`${stories.length} ${stories.length === 1 ? 'story' : 'stories'} found.`);
  } catch (error) {
    console.error(error);
    setStatus(error.message || 'GroundStory could not load nearby stories.', true);
    list.innerHTML = '<div class="empty">Something went sideways while loading this place. Try again.</div>';
  }
}

function renderStories(stories) {
  list.innerHTML = '';
  if (!stories.length) {
    list.innerHTML = `<div class="empty">${favoritesOnly ? 'No saved stories appear in this search area.' : 'No documented stories were found in this radius yet.'}</div>`;
    return;
  }
  const bounds = [[current.lat, current.lon]];
  stories.forEach((story) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector('.story-card');
    const img = node.querySelector('.story-image');
    if (story.image_url) { img.src = story.image_url; img.alt = story.title; img.hidden = false; }
    else card.style.gridTemplateColumns = '1fr';
    node.querySelector('h3').textContent = story.title;
    node.querySelector('.summary').textContent = story.summary || 'A documented place or event near this location.';
    node.querySelector('.category').textContent = (story.category || 'local history').replaceAll('-', ' ');
    node.querySelector('.distance').textContent = metersLabel(story.distance_m);
    const source = node.querySelector('.source-link');
    const url = storySource(story);
    if (url) source.href = url; else source.hidden = true;
    node.querySelector('.directions-link').href = directionsUrl(story);
    const favorite = node.querySelector('.favorite');
    const syncFavorite = () => { favorite.textContent = favoriteIds.has(story.id) ? '★' : '☆'; favorite.classList.toggle('saved', favoriteIds.has(story.id)); };
    syncFavorite();
    favorite.addEventListener('click', () => { favoriteIds.has(story.id) ? favoriteIds.delete(story.id) : favoriteIds.add(story.id); saveFavorites(); syncFavorite(); });
    list.appendChild(node);
    if (story.location?.lat && story.location?.lon) {
      const marker = L.marker([story.location.lat, story.location.lon]).bindPopup(`<strong>${escapeHtml(story.title)}</strong><br>${escapeHtml(metersLabel(story.distance_m))}`);
      marker.addTo(markers);
      bounds.push([story.location.lat, story.location.lon]);
    }
  });
  if (bounds.length > 1) map.fitBounds(bounds, { padding: [35, 35], maxZoom: 14 });
}
function escapeHtml(value='') { return value.replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

$('locateButton').addEventListener('click', () => {
  if (!navigator.geolocation) return setStatus('This browser does not provide location access.', true);
  setStatus('Finding your location…');
  navigator.geolocation.getCurrentPosition(({ coords }) => {
    current = { lat: coords.latitude, lon: coords.longitude, label: 'Your location' };
    if (userMarker) userMarker.remove();
    userMarker = L.circleMarker([current.lat, current.lon], { radius: 9, weight: 4, color: '#fff', fillColor: '#2b6f4b', fillOpacity: 1 }).addTo(map).bindPopup('You are here');
    map.setView([current.lat, current.lon], 12);
    loadStories();
  }, (error) => setStatus(error.code === 1 ? 'Location permission was denied. Search for a place instead.' : 'Your location could not be determined.', true), { enableHighAccuracy: true, timeout: 12000 });
});

$('searchForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = $('placeSearch').value.trim();
  if (!query) return;
  setStatus(`Finding ${query}…`);
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: '1' });
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Place search failed.');
    const places = await response.json();
    if (!places.length) throw new Error('That place was not found.');
    current = { lat: Number(places[0].lat), lon: Number(places[0].lon), label: places[0].display_name.split(',').slice(0, 2).join(',') };
    map.setView([current.lat, current.lon], 11);
    await loadStories();
  } catch (error) { setStatus(error.message, true); }
});

$('radiusSelect').addEventListener('change', loadStories);
$('limitSelect').addEventListener('change', loadStories);
$('favoritesButton').addEventListener('click', () => {
  favoritesOnly = !favoritesOnly;
  $('favoritesButton').style.background = favoritesOnly ? '#a86428' : '';
  loadStories();
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(console.warn);
