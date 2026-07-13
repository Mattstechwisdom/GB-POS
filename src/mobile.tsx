import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './mobile/mobile.css';
import { installMobileApi } from './mobile/mobile-api';
import MobileUpdateCheck from './mobile/MobileUpdateCheck';

document.documentElement.classList.add('gbpos-mobile-root');
document.body.classList.add('gbpos-mobile');

installMobileApi();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
    <MobileUpdateCheck />
  </React.StrictMode>,
);
