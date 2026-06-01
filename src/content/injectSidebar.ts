/**
 * Sidebar injection via Shadow DOM on the YouTube page.
 *
 * Why Shadow DOM (not iframe):
 * - Same window as the page → postMessage transcript transport works
 * - Same window → player events + seek work without bridges
 * - Clicks/focus work reliably (iframe sandbox caused broken UI)
 * - Tailwind styles isolated from YouTube CSS
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Sidebar } from '@/sidebar/Sidebar';
import sidebarStyles from '@/sidebar/sidebar.css?inline';
import contentStyles from './content.css?inline';
import { UI } from '@lib/constants';
import {
  installSidebarKeyboardIsolation,
  removeSidebarKeyboardIsolation,
} from './keyboardIsolation';

const HOST_ID = 'yt-studyflow-host';
const ROOT_ID = 'yt-studyflow-root';

let reactRoot: ReactDOM.Root | null = null;
let activeVideoId: string | null = null;

function buildShadowRoot(host: HTMLElement): HTMLElement {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

  if (shadow.querySelector(`#${ROOT_ID}`)) {
    return shadow.getElementById(ROOT_ID)!;
  }

  shadow.innerHTML = '';

  const style = document.createElement('style');
  style.textContent = `
    ${contentStyles}
    ${sidebarStyles}
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host {
      all: initial;
      display: block;
      width: 100%;
      height: 100%;
      font-family: Inter, 'Segoe UI', system-ui, sans-serif;
      color: #fff;
      pointer-events: auto;
    }
    #${ROOT_ID} {
      width: 100%;
      height: 100%;
      overflow: hidden;
      pointer-events: auto;
    }
    button, input, textarea, select, a {
      pointer-events: auto;
      cursor: pointer;
    }
    input, textarea, select {
      cursor: text;
    }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 999px; }
  `;
  shadow.appendChild(style);

  const container = document.createElement('div');
  container.id = ROOT_ID;
  shadow.appendChild(container);
  return container;
}

function adjustYouTubeLayout(show: boolean): void {
  const app = document.querySelector('ytd-app');
  if (!(app instanceof HTMLElement)) return;
  app.style.marginRight = show ? `${UI.SIDEBAR_WIDTH}px` : '0';
  app.style.transition = `margin-right ${UI.ANIMATION_MS}ms ease`;
}

class SidebarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        'div',
        { style: { padding: 16, color: '#fca5a5', fontSize: 13 } },
        React.createElement('strong', null, 'StudyFlow crashed'),
        React.createElement('p', { style: { marginTop: 8 } }, this.state.error.message)
      );
    }
    return this.props.children;
  }
}

export function injectSidebar(videoId: string): void {
  const existing = document.getElementById(HOST_ID);
  if (activeVideoId === videoId && existing && reactRoot) {
    return;
  }

  removeSidebar();
  activeVideoId = videoId;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    width: ${UI.SIDEBAR_WIDTH}px;
    height: 100vh;
    z-index: 2147483646;
    border: none;
    margin: 0;
    padding: 0;
    background: linear-gradient(180deg, #0a0f1a 0%, #0b1220 40%, #0d1528 100%);
    pointer-events: auto;
    isolation: isolate;
  `;

  document.body.appendChild(host);
  installSidebarKeyboardIsolation();

  const container = buildShadowRoot(host);
  reactRoot = ReactDOM.createRoot(container);
  reactRoot.render(
    React.createElement(
      SidebarErrorBoundary,
      null,
      React.createElement(Sidebar, { videoId })
    )
  );

  requestAnimationFrame(() => adjustYouTubeLayout(true));
}

export function removeSidebar(): void {
  reactRoot?.unmount();
  reactRoot = null;
  removeSidebarKeyboardIsolation();
  document.getElementById(HOST_ID)?.remove();
  activeVideoId = null;
  adjustYouTubeLayout(false);
}

export function toggleSidebar(): void {
  const host = document.getElementById(HOST_ID);
  if (!host) return;
  const hidden = host.style.display === 'none';
  host.style.display = hidden ? 'block' : 'none';
  adjustYouTubeLayout(hidden);
}
