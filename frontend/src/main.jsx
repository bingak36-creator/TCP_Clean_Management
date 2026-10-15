import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const mapKey = import.meta.env.VITE_KAKAO_MAP_KEY;
if (mapKey) {
  const script = document.createElement('script');
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(mapKey)}&libraries=services`;
  script.async = true;
  document.head.appendChild(script);
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
