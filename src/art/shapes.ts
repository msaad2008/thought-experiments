// Small helpers shared by the icon and hero drawings.
// Art rules: flat fills, no outlines, soft radial glows, and a darker
// crescent on the lower-right of every round body.

const r1 = (x: number): number => Math.round(x * 10) / 10;

/** A full circle as path data (so two can be combined with even-odd). */
export function circlePath(cx: number, cy: number, r: number): string {
  return `M${r1(cx - r)} ${r1(cy)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0Z`;
}

/** A soft radial glow fading to nothing. `id` must be unique on the page. */
export function glow(id: string, color: string, strength = 0.55): string {
  return (
    `<radialGradient id="${id}">` +
    `<stop offset="0" stop-color="${color}" stop-opacity="${strength}"/>` +
    `<stop offset=".45" stop-color="${color}" stop-opacity="${r1(strength * 0.35 * 100) / 100}"/>` +
    `<stop offset="1" stop-color="${color}" stop-opacity="0"/>` +
    `</radialGradient>`
  );
}

/**
 * A round body: base fill, optional details clipped to it, then a darker
 * crescent on the lower-right (the body minus a copy shifted up-left).
 * `id` names the clip path and must be unique on the page.
 */
export function orb(
  id: string,
  cx: number,
  cy: number,
  r: number,
  fill: string,
  shade: string,
  details = '',
  shift = 0.34,
): string {
  const d = r * shift;
  return (
    `<clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>` +
    `<g clip-path="url(#${id})">${details}` +
    `<path fill="${shade}" fill-rule="evenodd" d="${circlePath(cx, cy, r)}${circlePath(cx - d, cy - d * 0.85, r)}"/>` +
    `</g>`
  );
}
