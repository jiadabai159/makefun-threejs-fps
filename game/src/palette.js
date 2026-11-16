// The look plan, in one place. SABLE YARD is a dusk industrial yard: warm dark ground,
// rusted containers, pale concrete, one safety-orange accent for the spike, the sites
// and the enemy heads. Six values; the lighting makes every shade the game needs.
export const PALETTE = {
  canvas: '#171310',
  surface: '#26201a',
  hairline: '#453829',
  ink: '#efe6d2',
  muted: '#a4937a',
  accent: '#ff5a26',
};

export function shade(name) {
  return PALETTE[name];
}
