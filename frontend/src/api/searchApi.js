export const searchKakaoPlaces = (keyword, lat = null, lon = null, page = 1) => {
  return new Promise((resolve, reject) => {
    if (!window.kakao || !window.kakao.maps || !window.kakao.maps.services) {
      return reject(new Error("Kakao map SDK not loaded"));
    }
    const ps = new window.kakao.maps.services.Places();
    
    const options = { page: page };
    if (lat !== null && lon !== null) {
      options.location = new window.kakao.maps.LatLng(lat, lon);
      options.radius = 5000; // 넓은 지역 관제를 위해 반경 5km
      options.sort = window.kakao.maps.services.SortBy.DISTANCE; 
    }

    ps.keywordSearch(keyword, (data, status) => {
      if (status === window.kakao.maps.services.Status.OK) {
        const results = data.map(item => ({
          id: item.id,
          name: item.place_name,
          lat: parseFloat(item.y),
          lon: parseFloat(item.x),
          address: item.road_address_name || item.address_name,
          distance: item.distance 
        }));
        resolve(results);
      } else if (status === window.kakao.maps.services.Status.ZERO_RESULT) {
        resolve([]);
      } else {
        reject(new Error("Kakao search failed"));
      }
    }, options);
  });
};

export const fetchRoute = async (startLat, startLon, endLat, endLon, mode = 'walk') => {
  try {
    const profile = mode === 'walk' ? 'foot' : 'driving';
    const url = `https://router.project-osrm.org/route/v1/${profile}/${startLon},${startLat};${endLon},${endLat}?overview=full&geometries=geojson`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Route fetch failed');
    
    const data = await response.json();
    if (data.code === 'Ok' && data.routes.length > 0) {
      const route = data.routes[0];
      const path = route.geometry.coordinates.map(coord => ({
        lat: coord[1],
        lng: coord[0]
      }));
      
      let durationMinutes = Math.ceil(route.duration / 60);
      
      if (mode === 'walk') {
        // OSRM 공개 서버가 한국 지역에서 도보 시간을 자동차와 동일하게 반환하는 버그가 있으므로,
        // 도보 속도(약 4.5km/h, 분당 75m) 기준으로 직접 계산합니다.
        durationMinutes = Math.ceil(route.distance / 75);
      } else if (mode === 'transit') {
        durationMinutes = Math.ceil(durationMinutes * 1.8) + 10;
      }
      
      return {
        path,
        distance: route.distance,
        duration: durationMinutes,
        mode: mode
      };
    }
    return null;
  } catch (error) {
    console.error(`Routing Error (${mode}):`, error);
    return null;
  }
};
