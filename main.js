import L from 'leaflet';

// Default map view settings: Arkhangelsk City
const DEFAULT_LAT = 64.5399;
const DEFAULT_LNG = 40.5154;
const DEFAULT_ZOOM = 12;

// Standard OpenStreetMap (OSM) Tile Layer
const osmTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
});

// Initialize Leaflet Map (OSM tile layer disabled by default, zoom control disabled)
const map = L.map('map', {
  center: [DEFAULT_LAT, DEFAULT_LNG],
  zoom: DEFAULT_ZOOM,
  layers: [],
  zoomControl: false,
  attributionControl: false
});

// DOM Elements
const cursorCoordsEl = document.getElementById('cursor-coords');
const centerCoordsEl = document.getElementById('center-coords');
const tagOsm = document.getElementById('tag-osm');
const tagBoundary = document.getElementById('tag-boundary');
const headerPhotoTags = document.getElementById('header-photo-tags');
const exportCoordsBtn = document.getElementById('btn-export-coords');
const toastContainer = document.getElementById('toast-container');

// Toggle OSM Basemap Tag Chip
if (tagOsm) {
  tagOsm.addEventListener('click', () => {
    tagOsm.classList.toggle('active');
    if (tagOsm.classList.contains('active')) {
      if (!map.hasLayer(osmTileLayer)) map.addLayer(osmTileLayer);
    } else {
      if (map.hasLayer(osmTileLayer)) map.removeLayer(osmTileLayer);
    }
  });
}

// Toast Notification Helper
function showToast(message) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// GeoJSON Boundary Layer (Light Gray Style)
let boundaryGeoJSONLayer = null;

const boundaryStyle = {
  color: '#475569',       // Darker gray border (slate-600)
  weight: 1.5,            // Thin line
  opacity: 0.95,          // Line opacity
  fill: false,            // No fill
  dashArray: '6, 4'       // Dashed line pattern
};

// Function to convert EPSG:3857 (Web Mercator) coordinates to EPSG:4326 (WGS84)
function unprojectMercator(coords) {
  if (typeof coords[0] === 'number') {
    const pt = L.point(coords[0], coords[1]);
    const latLng = L.Projection.SphericalMercator.unproject(pt);
    return [latLng.lng, latLng.lat];
  }
  return coords.map(unprojectMercator);
}

// Load and display boundary.geojson
fetch('./data/boundary.geojson')
  .then((res) => res.json())
  .then((data) => {
    if (data.crs && data.crs.properties && data.crs.properties.name.includes('3857')) {
      data.features.forEach((feature) => {
        feature.geometry.coordinates = unprojectMercator(feature.geometry.coordinates);
      });
    }

    boundaryGeoJSONLayer = L.geoJSON(data, {
      style: boundaryStyle
    });

    // Add layer to map by default
    map.addLayer(boundaryGeoJSONLayer);

    // Setup toggle boundary tag chip listener
    if (tagBoundary) {
      tagBoundary.addEventListener('click', () => {
        tagBoundary.classList.toggle('active');
        if (tagBoundary.classList.contains('active')) {
          if (!map.hasLayer(boundaryGeoJSONLayer)) map.addLayer(boundaryGeoJSONLayer);
        } else {
          if (map.hasLayer(boundaryGeoJSONLayer)) map.removeLayer(boundaryGeoJSONLayer);
        }
      });
    }
  })
  .catch((err) => {
    console.error('Ошибка загрузки boundary.geojson:', err);
  });

// --- Photo Subfolder Layers Management ---
const photoCategoryLayers = {};
let loadedPhotoData = null;

// Helper to create circular popup HTML (Pure circular photo)
function createPopupContent(photo, category, lat, lng) {
  return `
    <div class="photo-popup circular-popup" style="border: 2px solid ${category.color};">
      <a href="${photo.url}" target="_blank" title="Открыть оригинал: ${photo.name}" class="circular-popup-link">
        <img src="${photo.url}" alt="${photo.name}" class="popup-img circular-img" loading="lazy" />
      </a>
    </div>
  `;
}

// Helper to create custom divIcon for photo markers
function createCustomIcon(iconPath, color) {
  const isImgIcon = iconPath.includes('/') || iconPath.endsWith('.png');
  const iconContent = isImgIcon
    ? `<img src="${iconPath}" class="marker-icon-img" alt="" />`
    : `<span class="marker-icon">${iconPath}</span>`;

  return L.divIcon({
    className: 'custom-photo-marker-wrapper',
    html: `
      <div class="custom-photo-marker" style="--marker-color: ${color};">
        ${iconContent}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36]
  });
}

// --- Position Confirmation Modal & Persistence Elements ---
const confirmModal = document.getElementById('confirm-modal');
const modalMarkerName = document.getElementById('modal-marker-name');
const modalOldCoords = document.getElementById('modal-old-coords');
const modalNewCoords = document.getElementById('modal-new-coords');
const modalBtnSave = document.getElementById('modal-btn-save');
const modalBtnCancel = document.getElementById('modal-btn-cancel');

let pendingDrag = null; // Holds info about pending drag action

function promptPositionChange(marker, photo, category, oldLat, oldLng, newLat, newLng) {
  pendingDrag = { marker, photo, category, oldLat, oldLng, newLat, newLng };

  if (modalMarkerName) modalMarkerName.textContent = photo.file;
  if (modalOldCoords) modalOldCoords.textContent = `${oldLat.toFixed(5)}, ${oldLng.toFixed(5)}`;
  if (modalNewCoords) modalNewCoords.textContent = `${newLat.toFixed(5)}, ${newLng.toFixed(5)}`;

  if (confirmModal) {
    confirmModal.classList.remove('hidden');
  }
}

// Function to save photo data to backend API and localStorage
function savePhotoLayersData() {
  if (!loadedPhotoData) return;
  const jsonStr = JSON.stringify(loadedPhotoData, null, 2);

  // 1. Store in localStorage as instant backup
  try {
    localStorage.setItem('photo_layers_saved', jsonStr);
  } catch (e) {}

  // 2. Persist directly to disk via Vite dev server API
  fetch('/api/save-photo-layers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: jsonStr
  })
  .then((res) => res.json())
  .then((resData) => {
    if (resData.success) {
      console.log('data/photo_layers.json успешно сохранён на диске!');
    }
  })
  .catch((err) => {
    console.warn('API save warning:', err.message);
  });
}

// Modal Save Button Handler
if (modalBtnSave) {
  modalBtnSave.addEventListener('click', () => {
    if (!pendingDrag) return;
    const { marker, photo, category, newLat, newLng } = pendingDrag;

    // Apply new position
    photo.lat = newLat;
    photo.lng = newLng;
    marker.setLatLng([newLat, newLng]);
    marker.setPopupContent(createPopupContent(photo, category, newLat, newLng));

    // Save changes to disk & localStorage
    savePhotoLayersData();

    showToast(`✅ Изменения сохранены для ${photo.file}`);

    pendingDrag = null;
    if (confirmModal) confirmModal.classList.add('hidden');
  });
}

// Modal Cancel Button Handler
if (modalBtnCancel) {
  modalBtnCancel.addEventListener('click', () => {
    if (!pendingDrag) return;
    const { marker, oldLat, oldLng } = pendingDrag;

    // Reset position back to original
    marker.setLatLng([oldLat, oldLng]);

    showToast(`↩️ Перемещение отменено. Маркер возвращён.`);

    pendingDrag = null;
    if (confirmModal) confirmModal.classList.add('hidden');
  });
}

// --- Ctrl + Alt Drag Modifier Enforcement ---
let isCtrlAltPressed = false;

function checkCtrlAltState(e) {
  const active = e.ctrlKey && e.altKey;
  if (active !== isCtrlAltPressed) {
    isCtrlAltPressed = active;
    if (active) {
      showToast('🔑 Режим перемещения маркеров активен (Ctrl + Alt)');
    }
  }
}

window.addEventListener('keydown', checkCtrlAltState);
window.addEventListener('keyup', checkCtrlAltState);

// Load photo layers from photo_layers.json
fetch('./data/photo_layers.json')
  .then((res) => res.json())
  .then((categoriesData) => {
    // Check if localStorage has saved overrides
    const savedOverride = localStorage.getItem('photo_layers_saved');
    if (savedOverride) {
      try {
        const overrideData = JSON.parse(savedOverride);
        for (const [catKey, catVal] of Object.entries(overrideData)) {
          if (categoriesData[catKey]) {
            catVal.photos.forEach(pSaved => {
              const origPhoto = categoriesData[catKey].photos.find(p => p.file === pSaved.file);
              if (origPhoto) {
                origPhoto.lat = pSaved.lat;
                origPhoto.lng = pSaved.lng;
              }
            });
          }
        }
      } catch (e) {}
    }

    loadedPhotoData = categoriesData;

    for (const [key, category] of Object.entries(categoriesData)) {
      const layerGroup = L.layerGroup();
      photoCategoryLayers[key] = {
        title: category.title,
        icon: category.icon,
        color: category.color,
        layer: layerGroup
      };

      for (const photo of category.photos) {
        const lat = photo.lat;
        const lng = photo.lng;

        if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
          const markerIcon = createCustomIcon(category.icon, category.color);
          const marker = L.marker([lat, lng], { icon: markerIcon, draggable: true });

          const popupHtml = createPopupContent(photo, category, lat, lng);
          marker.bindPopup(popupHtml, { maxWidth: 190, minWidth: 190, className: 'custom-glass-popup' });

          marker.on('dragend', (e) => {
            const orig = e.originalEvent;
            const isCtrlAlt = (orig && (orig.ctrlKey || orig.metaKey) && orig.altKey) || isCtrlAltPressed;

            const oldLat = photo.lat;
            const oldLng = photo.lng;
            const newPos = e.target.getLatLng();
            const newLat = parseFloat(newPos.lat.toFixed(5));
            const newLng = parseFloat(newPos.lng.toFixed(5));

            // Enforce Ctrl + Alt requirement: revert position if not held down
            if (!isCtrlAlt) {
              marker.setLatLng([oldLat, oldLng]);
              showToast('⚠️ Для перемещения зажмите Ctrl + Alt!');
              return;
            }

            if (oldLat === newLat && oldLng === newLng) return;

            promptPositionChange(marker, photo, category, oldLat, oldLng, newLat, newLng);
          });

          layerGroup.addLayer(marker);
        }
      }

      // Add layer to map by default
      map.addLayer(layerGroup);

      // Render category toggle tag chip in top header bar
      if (headerPhotoTags) {
        const isImgIcon = category.icon.includes('/') || category.icon.endsWith('.png');
        const tagIconHtml = isImgIcon
          ? `<span class="tag-icon-img" style="--icon-url: url('${category.icon}');"></span>`
          : `<span class="tag-icon">${category.icon}</span>`;

        const tagHtml = `
          <button class="layer-tag-chip active" id="tag-cat-${key}" data-category="${key}" title="Переключить слой: ${category.title}" style="--tag-color: ${category.color};">
            ${tagIconHtml}
            <span class="tag-title">${category.title}</span>
            <span class="tag-badge-count">${category.photos.length}</span>
          </button>
        `;
        headerPhotoTags.insertAdjacentHTML('beforeend', tagHtml);

        const tagBtn = document.getElementById(`tag-cat-${key}`);
        if (tagBtn) {
          tagBtn.addEventListener('click', () => {
            tagBtn.classList.toggle('active');
            const catKey = tagBtn.dataset.category;
            const targetLayerGroup = photoCategoryLayers[catKey]?.layer;
            if (targetLayerGroup) {
              if (tagBtn.classList.contains('active')) {
                if (!map.hasLayer(targetLayerGroup)) map.addLayer(targetLayerGroup);
              } else {
                if (map.hasLayer(targetLayerGroup)) map.removeLayer(targetLayerGroup);
              }
            }
          });
        }
      }
    }
  })
  .catch((err) => {
    console.error('Ошибка загрузки фото-слоёв:', err);
  });

// Update center coordinates text
function updateCenterCoords() {
  const center = map.getCenter();
  if (centerCoordsEl) {
    centerCoordsEl.textContent = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
  }
}

// Map Mouse Move Event - Update cursor coordinates
map.on('mousemove', (e) => {
  if (cursorCoordsEl) {
    cursorCoordsEl.textContent = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
  }
});

// Map Move Event
map.on('move', updateCenterCoords);

// Export / Copy updated photo_layers JSON button
if (exportCoordsBtn) {
  exportCoordsBtn.addEventListener('click', () => {
    if (!loadedPhotoData) return;
    const jsonStr = JSON.stringify(loadedPhotoData, null, 2);

    navigator.clipboard.writeText(jsonStr)
      .then(() => {
        showToast('📋 Координаты скопированы в буфер обмена!');
      })
      .catch(() => {
        showToast('📋 Данные готовы! См. скачанный файл.');
      });

    // Also download JSON file
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'photo_layers_updated.json';
    a.click();
    URL.revokeObjectURL(url);
  });
}

// Preset Navigation Buttons
presetButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const lat = parseFloat(btn.dataset.lat);
    const lng = parseFloat(btn.dataset.lng);
    const zoom = parseInt(btn.dataset.zoom, 10);
    map.flyTo([lat, lng], zoom, {
      duration: 1.5
    });
  });
});

// Initial coords update
updateCenterCoords();
