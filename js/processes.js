'use strict';
// Historical processes as physical parameter sets. Numbers are plausible approximations
// drawn from the literature cited in README.md, tuned so defaults produce a readable plate.
(function (Lab) {
  const P = {};

  P.obscura = {
    name: 'Camera obscura (projection)',
    era: 'Antiquity → 1500s',
    blurb: 'No chemistry. A dark room and a hole. The image lives only while the light does; this records what an observer would see on the ground glass averaged over the viewing time.',
    polarity: 'pos', spectral: [0.2126, 0.7152, 0.0722],
    t0: 2, clock: 1, recipP: 1, tref: 1,
    gamma: 1, Dmin: 0, Dmax: 1, solarize: 0,
    grain: { size: 1, amount: 0.02 },
    dev: { mode: 'none', label: 'No development', tau: 1, tempRef: 20, temp: 20, time: 0, fog: 0 },
    fixRef: 0, washRef: 0, support: 'groundglass', palette: 'obscura',
    artifacts: { coat: 0.0, fibers: 0.25, comets: 0, oyster: 0, buff: 0, thumb: 0, pool: 0, silvering: 0, foxing: 0, fade: 0, tarnish: 0, frilling: 0 },
    aperture: { shape: 'pinhole', fstop: 180, invert: true },
  };

  P.heliography = {
    name: 'Heliography (bitumen on pewter)',
    era: 'Niépce, c. 1822–1827',
    blurb: 'Bitumen of Judea hardens in light over hours or days. Unhardened bitumen is dissolved in oil of lavender and white petroleum, leaving pale bitumen on dark pewter. The sun crosses the sky during exposure.',
    polarity: 'pos', spectral: [0.02, 0.18, 0.8],
    t0: 8 * 3600, clock: 3600, recipP: 0.92, tref: 60,
    gamma: 0.55, Dmin: 0, Dmax: 1, solarize: 0,
    grain: { size: 3, amount: 0.25 },
    dev: { mode: 'solvent', label: 'Lavender-oil solvent wash', tau: 90, tempRef: 20, temp: 20, time: 60, fog: 0 },
    fixRef: 0, washRef: 60, support: 'pewter', palette: 'pewter',
    artifacts: { coat: 0.35, fibers: 0, comets: 0, oyster: 0, buff: 0.3, thumb: 0, pool: 0.3, silvering: 0, foxing: 0, fade: 0, tarnish: 0.3, frilling: 0 },
    aperture: { shape: 'round', fstop: 16, invert: false },
    lampTravel: true,
  };

  P.daguerreotype = {
    name: 'Daguerreotype (silvered copper)',
    era: 'Daguerre, 1839',
    blurb: 'Iodised silver plate, developed in mercury fumes over a heated cup. A direct positive mirror: it reads positive against a dark surround and negative against a bright one. Overexposure solarises.',
    polarity: 'pos', spectral: [0.03, 0.12, 0.85],
    t0: 120, clock: 20, recipP: 0.9, tref: 10,
    gamma: 1.4, Dmin: 0, Dmax: 1, solarize: 0.55, solarizeAt: 1.0,
    grain: { size: 1, amount: 0.05 },
    dev: { mode: 'fume', label: 'Mercury fuming', tau: 50, tempRef: 75, temp: 75, time: 150, fog: 0.0004 },
    fixRef: 60, washRef: 60, support: 'copper', palette: 'daguerreotype',
    artifacts: { coat: 0.2, fibers: 0, comets: 0, oyster: 0, buff: 0.5, thumb: 0, pool: 0, silvering: 0, foxing: 0, fade: 0, tarnish: 0.8, frilling: 0 },
    aperture: { shape: 'round', fstop: 14, invert: false },
  };

  P.calotype = {
    name: 'Calotype (paper negative)',
    era: 'Talbot, 1841',
    blurb: 'Iodised writing paper, sensitised with gallo-nitrate of silver and developed to bring out a latent image. The paper fibres print through, giving the soft, mottled calotype look.',
    polarity: 'neg', spectral: [0.04, 0.16, 0.8],
    t0: 60, clock: 10, recipP: 0.88, tref: 10,
    gamma: 1.1, Dmin: 0.12, Dmax: 1.5, solarize: 0,
    grain: { size: 3, amount: 0.2 },
    dev: { mode: 'liquid', label: 'Gallo-nitrate of silver', tau: 140, tempRef: 18, temp: 18, time: 300, fog: 0.0005 },
    fixRef: 300, washRef: 900, support: 'paper', palette: 'calotype',
    artifacts: { coat: 0.4, fibers: 0.7, comets: 0, oyster: 0, buff: 0, thumb: 0, pool: 0.1, silvering: 0, foxing: 0.6, fade: 0.5, tarnish: 0, frilling: 0 },
    aperture: { shape: 'round', fstop: 11, invert: false },
  };

  P.saltprint = {
    name: 'Salted paper (printing-out)',
    era: 'Talbot, 1840s',
    blurb: 'Printing-out paper: the image darkens visibly while the light falls on it. No developer; you watch, then fix. Notoriously prone to fading and yellowing.',
    polarity: 'neg', spectral: [0.03, 0.12, 0.85],
    t0: 900, clock: 120, recipP: 0.95, tref: 60,
    gamma: 0.9, Dmin: 0.08, Dmax: 1.35, solarize: 0,
    grain: { size: 2, amount: 0.08 },
    dev: { mode: 'printout', label: 'Printing-out (no developer)', tau: 1, tempRef: 20, temp: 20, time: 0, fog: 0 },
    fixRef: 600, washRef: 1800, support: 'paper', palette: 'salt',
    artifacts: { coat: 0.3, fibers: 0.5, comets: 0, oyster: 0, buff: 0, thumb: 0, pool: 0.05, silvering: 0, foxing: 0.5, fade: 1, tarnish: 0, frilling: 0 },
    aperture: { shape: 'round', fstop: 8, invert: false },
  };

  P.collodion = {
    name: 'Wet collodion (glass plate)',
    era: 'Scott Archer, 1851',
    blurb: 'Collodion poured by hand onto glass, sensitised and exposed while wet. Pour marks, comets, oyster-shell drying lines and the uncoated corner where the plate was held.',
    polarity: 'neg', spectral: [0.02, 0.18, 0.8],
    t0: 8, clock: 2, recipP: 0.9, tref: 5,
    gamma: 1.6, Dmin: 0.05, Dmax: 2.0, solarize: 0.15, solarizeAt: 1.3,
    grain: { size: 1, amount: 0.08 },
    dev: { mode: 'liquid', label: 'Iron sulphate developer (poured)', tau: 8, tempRef: 20, temp: 20, time: 20, fog: 0.004 },
    fixRef: 120, washRef: 300, support: 'glass', palette: 'collodion',
    artifacts: { coat: 0.45, fibers: 0, comets: 0.5, oyster: 0.5, buff: 0, thumb: 1, pool: 0.7, silvering: 0.4, foxing: 0, fade: 0.1, tarnish: 0, frilling: 0.3 },
    aperture: { shape: 'round', fstop: 5.6, invert: false },
  };

  P.drygelatin = {
    name: 'Silver gelatin dry plate',
    era: 'Maddox 1871 → commercial 1878+',
    blurb: 'Factory-coated gelatin emulsion on glass. Faster and more even than collodion, but still blue-sensitive in its early years. Ages by silvering-out at the edges and frilling of the gelatin.',
    polarity: 'neg', spectral: [0.05, 0.25, 0.7],
    t0: 4, clock: 1, recipP: 0.85, tref: 10,
    gamma: 1.8, Dmin: 0.06, Dmax: 2.2, solarize: 0.1, solarizeAt: 1.6,
    grain: { size: 2, amount: 0.15 },
    dev: { mode: 'liquid', label: 'Pyro developer (tray)', tau: 70, tempRef: 20, temp: 20, time: 180, fog: 0.0006 },
    fixRef: 300, washRef: 1200, support: 'glass', palette: 'gelatin',
    artifacts: { coat: 0.12, fibers: 0, comets: 0, oyster: 0, buff: 0, thumb: 0, pool: 0.15, silvering: 0.7, foxing: 0, fade: 0.1, tarnish: 0, frilling: 0.5 },
    aperture: { shape: 'round', fstop: 8, invert: false },
  };

  P.reversal16 = {
    name: '16mm B&W cine stock (film reel)',
    era: '20th century B&W cine',
    blurb: 'Panchromatic, contrasty cine stock. Designed for the reel: gate weave, flicker, scratches and generational re-photography.',
    polarity: 'neg', spectral: [0.3, 0.59, 0.11],
    t0: 1 / 24, clock: 0.05, recipP: 0.95, tref: 1,
    gamma: 2.2, Dmin: 0.05, Dmax: 2.4, solarize: 0, solarizeAt: 2,
    grain: { size: 2, amount: 0.3 },
    dev: { mode: 'liquid', label: 'Cine developer', tau: 60, tempRef: 20, temp: 20, time: 240, fog: 0.0005 },
    fixRef: 120, washRef: 300, support: 'glass', palette: 'gelatin',
    artifacts: { coat: 0.15, fibers: 0, comets: 0, oyster: 0, buff: 0, thumb: 0, pool: 0, silvering: 0.1, foxing: 0, fade: 0, tarnish: 0, frilling: 0 },
    aperture: { shape: 'round', fstop: 4, invert: false },
  };

  // Mid-grey reference transmittance reaching the plate for each polarity (see optics.layerBase).
  for (const id in P) {
    const p = P[id];
    p.id = id;
    const Tmid = p.polarity === 'neg' ? 0.08 : 0.18;
    const recip = p.t0 > p.tref ? Math.pow(p.t0 / p.tref, p.recipP - 1) : 1;
    p.H0 = Tmid * p.t0 * recip;
    p.logH0 = Math.log10(p.H0);
  }

  Lab.processes = P;
})(window.Lab);
