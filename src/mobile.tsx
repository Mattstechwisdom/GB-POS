import React from 'react';
import ReactDOM from 'react-dom/client';
import MobileApp from './mobile/MobileApp';
import './styles/index.css';
import './mobile/mobile.css';
import { installMobileApi } from './mobile/mobile-api';

document.documentElement.classList.add('gbpos-mobile-root');
document.body.classList.add('gbpos-mobile');

installMobileApi();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MobileApp />
  </React.StrictMode>,
);
