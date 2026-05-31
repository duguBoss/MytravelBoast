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
  // ESRI Satellite with AWS 3D Terrain (FREE
  satellite: {
    version: 8,
    sources: {
      esri: {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri'
      },
      'aws-terrain': {
        type: 'raster-dem',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        encoding: 'terrarium',
        tileSize: 256
      }
    },
    layers: [
      {
        id: 'satellite-layer',
        type: 'raster',
        source: 'esri'
      }
    ],
    terrain: {
      source: 'aws-terrain',
      exaggeration: 1.5
    },
    sky: {}
  },
  // OpenStreetMap standard style with AWS terrain
  voyager: {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      },
      'aws-terrain': {
        type: 'raster-dem',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        encoding: 'terrarium',
        tileSize: 256
      }
    },
    layers: [
      {
        id: 'osm-layer',
        type: 'raster',
        source: 'osm'
      }
    ],
    terrain: {
      source: 'aws-terrain',
      exaggeration: 1.5
    },
    sky: {}
  },
  // CartoDB Dark Matter with terrain (free)
  dark: {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'],
        tileSize: 256,
        attribution: '&copy; OSM &copy; CARTO'
      },
      'aws-terrain': {
        type: 'raster-dem',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        encoding: 'terrarium',
        tileSize: 256
      }
    },
    layers: [
      {
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto'
      }
    ],
    terrain: {
      source: 'aws-terrain',
      exaggeration: 1.5
    },
    sky: {}
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
      },
      'aws-terrain': {
        type: 'raster-dem',
        tiles: [
          'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
        ],
        encoding: 'terrarium',
        tileSize: 256
      }
    },
    layers: [
      {
        id: 'osm-minimal',
        type: 'raster',
        source: 'osm'
      }
    ],
    terrain: {
      source: 'aws-terrain',
      exaggeration: 1.5
    },
    sky: {}
  }
};

export const tileUrls = {
  voyager: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  minimal: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}'
};

export const tileSubdomains = {
  voyager: ['1','2','3','4'],
  dark: ['a','b','c','d'],
  minimal: ['1','2','3','4']
};

export const mapAttributions = {
  voyager: '&copy; 高德地图 / OSM / CARTO',
  dark: '&copy; OSM &copy; CARTO',
  satellite: '&copy; Esri',
  minimal: '&copy; 高德地图 / OSM / CARTO'
};
