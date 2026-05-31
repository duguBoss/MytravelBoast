export const countryFlags = {
  '北京': '🇨🇳', '上海': '🇨🇳', '广州': '🇨🇳', '深圳': '🇨🇳',
  '成都': '🇨🇳', '杭州': '🇨🇳', '西安': '🇨🇳', '重庆': '🇨🇳',
  '武汉': '🇨🇳', '南京': '🇨🇳', '东京': '🇯🇵', '大阪': '🇯🇵',
  '纽约': '🇺🇸', '洛杉矶': '🇺🇸', '伦敦': '🇬🇧', '巴黎': '🇫🇷',
  '柏林': '🇩🇪', '罗马': '🇮🇹', '悉尼': '🇦🇺', '莫斯科': '🇷🇺',
  '首尔': '🇰🇷', '曼谷': '🇹🇭', '新加坡': '🇸🇬', '迪拜': '🇦🇪',
};

// Mapbox GL JS configuration
export const mapboxConfig = {
  accessToken: 'pk.eyJ1IjoiZGVtb3VzZXIiLCJhIjoiY2x1ZzJ0a3JhMDAwMjJqbzJxcG5mZzV5cyJ9.demo_token',
  styles: {
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
    dark: 'mapbox://styles/mapbox/dark-v11',
    light: 'mapbox://styles/mapbox/light-v11',
    streets: 'mapbox://styles/mapbox/streets-v12',
    outdoors: 'mapbox://styles/mapbox/outdoors-v12'
  }
};

// Legacy Leaflet tile URLs (kept for fallback)
export const tileUrls = {
  voyager: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  minimal: 'https://{s}.tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png'
};

export const tileSubdomains = {
  voyager: ['a','b','c'],
  dark: ['a','b','c','d'],
  minimal: ['a','b','c']
};

export const mapAttributions = {
  voyager: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  dark: '&copy; OSM &copy; CARTO',
  satellite: '&copy; Esri',
  minimal: '&copy; OSM'
};
