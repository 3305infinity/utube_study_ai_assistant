/**
 * Stop keyboard events from the StudyFlow sidebar reaching YouTube's player shortcuts
 * (Space, k, j, l, etc.) while typing in chat, search, or settings.
 */

const HOST_ID = 'yt-studyflow-host';

function isFromSidebar(e: Event): boolean {
  const host = document.getElementById(HOST_ID);
  if (!host) return false;
  return e.composedPath().includes(host);
}

function blockBubbleToPage(e: Event): void {
  if (isFromSidebar(e)) {
    e.stopPropagation();
  }
}

let installed = false;

export function installSidebarKeyboardIsolation(): void {
  if (installed) return;
  installed = true;
  document.addEventListener('keydown', blockBubbleToPage, true);
  document.addEventListener('keyup', blockBubbleToPage, true);
  document.addEventListener('keypress', blockBubbleToPage, true);
}

export function removeSidebarKeyboardIsolation(): void {
  if (!installed) return;
  installed = false;
  document.removeEventListener('keydown', blockBubbleToPage, true);
  document.removeEventListener('keyup', blockBubbleToPage, true);
  document.removeEventListener('keypress', blockBubbleToPage, true);
}
