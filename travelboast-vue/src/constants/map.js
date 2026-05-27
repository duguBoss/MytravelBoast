export const countryFlags = {
  '北京': '🇨🇳', '上海': '🇨🇳', '广州': '🇨🇳', '深圳': '🇨🇳',
  '成都': '🇨🇳', '杭州': '🇨🇳', '西安': '🇨🇳', '重庆': '🇨🇳',
  '武汉': '🇨🇳', '南京': '🇨🇳', '东京': '🇯🇵', '大阪': '🇯🇵',
  '纽约': '🇺🇸', '洛杉矶': '🇺🇸', '伦敦': '🇬🇧', '巴黎': '🇫🇷',
  '柏林': '🇩🇪', '罗马': '🇮🇹', '悉尼': '🇦🇺', '莫斯科': '🇷🇺',
  '首尔': '🇰🇷', '曼谷': '🇹🇭', '新加坡': '🇸🇬', '迪拜': '🇦🇪',
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
  voyager: '&copy; 高德地图',
  dark: '&copy; OSM &copy; CARTO',
  satellite: '&copy; Esri',
  minimal: '&copy; 高德地图'
};
