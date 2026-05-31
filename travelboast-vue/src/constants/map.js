export const countryFlags = {
  '北京': '🇨🇳', '上海': '🇨🇳', '广州': '🇨🇳', '深圳': '🇨🇳',
  '成都': '🇨🇳', '杭州': '🇨🇳', '西安': '🇨🇳', '重庆': '🇨🇳',
  '武汉': '🇨🇳', '南京': '🇨🇳', '东京': '🇯🇵', '大阪': '🇯🇵',
  '纽约': '🇺🇸', '洛杉矶': '🇺🇸', '伦敦': '🇬🇧', '巴黎': '🇫🇷',
  '柏林': '🇩🇪', '罗马': '🇮🇹', '悉尼': '🇦🇺', '莫斯科': '🇷🇺',
  '首尔': '🇰🇷', '曼谷': '🇹🇭', '新加坡': '🇸🇬', '迪拜': '🇦🇪',
};

// MapLibre GL JS - 100% free and open source, no token needed
// Using free tile sources instead of Mapbox proprietary tiles

export const mapStyles = {
  // OpenStreetMap standard style
  voyager: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
  },
  // CartoDB Dark Matter (free)
  dark: {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
        tileSize: 256,
        attribution: '&copy; OSM &copy; CARTO'
      }
    },
    layers: [{ id: 'carto-dark', type: 'raster', source: 'carto' }]
  },
  // ESRI Satellite (free for non-commercial, attribution required)
  satellite: {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '&copy; Esri'
      }
    },
    layers: [{ id: 'esri-sat', type: 'raster', source: 'esri' }]
  },
  // Minimal / Light
  minimal: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tiles.wmflabs.org/bw-mapnik/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; OSM'
      }
    },
    layers: [{ id: 'osm-minimal', type: 'raster', source: 'osm' }]
  }
};

// Legacy Leaflet tile URLs (kept for fallback reference)
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
