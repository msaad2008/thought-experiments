// Shared by the game play views that use the `.gv` layout (sky square above a panel).

/**
 * Phones (single column): size the sky so it and the panel under it fit the
 * viewport height without scrolling (never below 200 px). No-op on wide screens.
 */
export function fitSky(root: HTMLElement, sky: HTMLElement): void {
  if (window.matchMedia?.('(min-width: 900px)').matches) {
    sky.style.width = '';
    return;
  }
  const host = root.closest('.view-host');
  const padBottom = host ? parseFloat(getComputedStyle(host).paddingBottom) || 0 : 0;
  const s = sky.getBoundingClientRect();
  const rest = root.getBoundingClientRect().height - s.height; // gap + panel
  const border = s.height - sky.clientHeight; // style.width sets the content box
  const avail = window.innerHeight - (s.top + window.scrollY) - rest - padBottom;
  sky.style.width = `${Math.max(200, Math.min(root.clientWidth, Math.floor(avail)) - border)}px`;
}
