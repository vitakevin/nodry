import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import Crack from './Crack';
import './style.css';

const overlay = new URLSearchParams(location.search).get('overlay') === '1';
if (overlay) document.documentElement.classList.add('overlay');
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{overlay ? <Crack /> : <App />}</React.StrictMode>);
