import { render } from 'preact';
import { App } from './App.tsx';
import { captureInstallPrompt } from './install.ts';
import './styles.css';

captureInstallPrompt();
render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Service worker registration failed', e));
}
