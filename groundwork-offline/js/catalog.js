// Groundwork — catalogs. Everything here is data: regions, modes, materials, items, prices.
// Add a region, a siding type or a furniture piece by adding an entry; nothing else needs to change.
// All lengths are in feet unless the name says otherwise. 1 inch = 1/12 ft.

export const SCHEMA_VERSION = 3;
export const IN = 1 / 12;

// ---------------------------------------------------------------------------
// Modes — which features a project exposes. Feature ids are checked by the UI.
// ---------------------------------------------------------------------------
export const FEATURES = {
  walls: 'Walls', openings: 'Doors & windows', materials: 'Materials & colors', lights: 'Lighting',
  furnish: 'Furniture', landscape: 'Landscape', floors: 'Multiple floors', foundation: 'Foundation settings',
  roof: 'Roof settings', framing: 'Framing view', insulation: 'Insulation view', sun: 'Sun, seasons & weather', systems: 'Electrical, plumbing & HVAC',
  trim: 'Soffit, fascia, house wrap & flashing', hazards: 'Hazard zones', pricing: 'Manual pricing', structure: 'Stud spacing & structure',
};

export const MODES = {
  simple: {
    id: 'simple', name: 'Simple', tagline: 'Draw walls, pick materials, add lights, furnish and landscape.',
    features: ['walls', 'openings', 'materials', 'lights', 'furnish', 'landscape', 'sun', 'roof'],
  },
  moderate: {
    id: 'moderate', name: 'Moderate', tagline: 'Everything in Simple, plus floors, foundation, roof shapes, framing and insulation.',
    features: ['walls', 'openings', 'materials', 'lights', 'furnish', 'landscape', 'sun', 'floors', 'foundation', 'roof', 'framing', 'insulation'],
  },
  advanced: {
    id: 'advanced', name: 'Advanced', tagline: 'Full depth: systems, vents, trim details, stud spacing, hazard zones and your own lumber prices.',
    features: ['walls', 'openings', 'materials', 'lights', 'furnish', 'landscape', 'sun', 'floors', 'foundation', 'roof', 'framing', 'insulation', 'systems', 'trim', 'hazards', 'pricing', 'structure'],
  },
};

export const PRICING_TIERS = [
  { id: 'lowest', name: 'Lowest', mult: 0.72 },
  { id: 'low', name: 'Low', mult: 0.86 },
  { id: 'medium', name: 'Medium', mult: 1.0 },
  { id: 'high', name: 'High', mult: 1.18 },
  { id: 'highest', name: 'Highest', mult: 1.4 },
];

export const LOT_SIZES = [
  { id: 'quarter', name: '¼ acre', acres: 0.25, sideFt: 105 },
  { id: 'half', name: '½ acre', acres: 0.5, sideFt: 148 },
  { id: 'one', name: '1 acre', acres: 1, sideFt: 209 },
  { id: 'two', name: '2 acres', acres: 2, sideFt: 295 },
  { id: 'five', name: '5 acres', acres: 5, sideFt: 467 },
];

// ---------------------------------------------------------------------------
// Regions — latitude drives the sun path; climate drives loads, frost depth and prices.
// ---------------------------------------------------------------------------
export const REGIONS = [
  { id: 'ak-southcentral', name: 'Alaska · Southcentral (Anchorage, Mat-Su, Kenai)', lat: 61.2, terrain: 'spruce', snowPsf: 50, seismic: 'very-high', frostDepthIn: 42, priceMult: 1.35, winterSnow: true },
  { id: 'ak-interior', name: 'Alaska · Interior (Fairbanks)', lat: 64.8, terrain: 'spruce', snowPsf: 50, seismic: 'high', frostDepthIn: 60, priceMult: 1.45, winterSnow: true, permafrost: true },
  { id: 'ak-west', name: 'Alaska · Western / Y-K Delta (Bethel)', lat: 60.8, terrain: 'tundra', snowPsf: 40, seismic: 'moderate', frostDepthIn: 60, priceMult: 1.75, winterSnow: true, permafrost: true, barge: true },
  { id: 'ak-southeast', name: 'Alaska · Southeast (Juneau, Sitka)', lat: 58.3, terrain: 'rainforest', snowPsf: 60, seismic: 'high', frostDepthIn: 24, priceMult: 1.4, winterSnow: true, rainy: true },
  { id: 'pnw', name: 'Pacific Northwest (WA, OR)', lat: 47.6, terrain: 'rainforest', snowPsf: 25, seismic: 'very-high', frostDepthIn: 12, priceMult: 1.12, winterSnow: false, rainy: true },
  { id: 'mountain', name: 'Mountain West (CO, MT, ID, UT, WY)', lat: 40.0, terrain: 'alpine', snowPsf: 60, seismic: 'moderate', frostDepthIn: 36, priceMult: 1.02, winterSnow: true },
  { id: 'midwest', name: 'Midwest (MN, WI, MI, IL, OH)', lat: 43.0, terrain: 'prairie', snowPsf: 35, seismic: 'low', frostDepthIn: 42, priceMult: 0.95, winterSnow: true },
  { id: 'northeast', name: 'Northeast (NY, New England)', lat: 42.5, terrain: 'grass', snowPsf: 45, seismic: 'low', frostDepthIn: 48, priceMult: 1.12, winterSnow: true },
  { id: 'southeast', name: 'Southeast (GA, NC, FL, TN)', lat: 33.5, terrain: 'grass', snowPsf: 10, seismic: 'low', frostDepthIn: 12, priceMult: 0.9, winterSnow: false, wind: 'hurricane' },
  { id: 'southwest', name: 'Southwest (AZ, NM, NV)', lat: 33.5, terrain: 'desert', snowPsf: 5, seismic: 'moderate', frostDepthIn: 6, priceMult: 0.95, winterSnow: false },
  { id: 'texas', name: 'Texas & Gulf', lat: 30.3, terrain: 'prairie', snowPsf: 5, seismic: 'low', frostDepthIn: 6, priceMult: 0.9, winterSnow: false, wind: 'hurricane' },
  { id: 'california', name: 'California', lat: 36.0, terrain: 'grass', snowPsf: 10, seismic: 'very-high', frostDepthIn: 12, priceMult: 1.28, winterSnow: false },
  { id: 'hawaii', name: 'Hawaii', lat: 21.3, terrain: 'tropical', snowPsf: 0, seismic: 'high', frostDepthIn: 0, priceMult: 1.5, winterSnow: false, wind: 'hurricane' },
  { id: 'canada-west', name: 'Canada · BC & Alberta', lat: 51.0, terrain: 'spruce', snowPsf: 50, seismic: 'high', frostDepthIn: 48, priceMult: 1.15, winterSnow: true },
  { id: 'canada-east', name: 'Canada · Ontario & Québec', lat: 45.5, terrain: 'grass', snowPsf: 55, seismic: 'moderate', frostDepthIn: 48, priceMult: 1.1, winterSnow: true },
];

export const SEISMIC_LEVELS = [
  { id: 'low', name: 'Low' }, { id: 'moderate', name: 'Moderate' }, { id: 'high', name: 'High' }, { id: 'very-high', name: 'Very high' },
];
export const SNOW_LEVELS = [
  { id: 'light', name: 'Light (≤ 20 psf)', psf: 15 }, { id: 'moderate', name: 'Moderate (20–40 psf)', psf: 30 },
  { id: 'heavy', name: 'Heavy (40–70 psf)', psf: 55 }, { id: 'extreme', name: 'Extreme (> 70 psf)', psf: 90 },
];
export function snowLevelForPsf(psf) {
  if (psf <= 20) return 'light'; if (psf <= 40) return 'moderate'; if (psf <= 70) return 'heavy'; return 'extreme';
}

export const SEASONS = [
  { id: 'spring', name: 'Spring', dayOfYear: 110 },
  { id: 'summer', name: 'Summer', dayOfYear: 196 },
  { id: 'fall', name: 'Fall', dayOfYear: 283 },
  { id: 'winter', name: 'Winter', dayOfYear: 15 },
];

export const WEATHER = [
  { id: 'clear', name: 'Clear', sun: 1.0, sky: 1.0, haze: 0.1, fog: 0, wind: 0.6 },
  { id: 'partly', name: 'Partly cloudy', sun: 0.8, sky: 0.95, haze: 0.3, fog: 0.05, wind: 0.9 },
  { id: 'overcast', name: 'Overcast', sun: 0.18, sky: 0.7, haze: 0.8, fog: 0.15, wind: 1.0 },
  { id: 'rain', name: 'Rain', sun: 0.12, sky: 0.55, haze: 0.9, fog: 0.3, particles: 'rain', wind: 1.6 },
  { id: 'snow', name: 'Snow', sun: 0.2, sky: 0.8, haze: 0.85, fog: 0.35, particles: 'snow', snowCover: true, wind: 0.7 },
  { id: 'windy', name: 'Windy', sun: 0.9, sky: 0.95, haze: 0.25, fog: 0.02, wind: 2.4 },
];

// ---------------------------------------------------------------------------
// Structure options
// ---------------------------------------------------------------------------
export const STUD_SPACINGS = [
  { id: 12, name: '12 in OC', note: 'Stiffest; most lumber' },
  { id: 16, name: '16 in OC', note: 'Standard' },
  { id: 24, name: '24 in OC', note: 'Advanced framing; less lumber, more insulation' },
];

export const INSULATION = [
  { id: 'fiberglass', name: 'Fiberglass batts', rPerIn: 3.2, costSqft: 1.15, color: '#f0a9bf', tex: 'fiberglass', note: 'Cheapest; keep it dry and uncompressed.' },
  { id: 'rockwool', name: 'Rock wool (mineral wool)', rPerIn: 4.1, costSqft: 1.65, color: '#8f7d5e', tex: 'rockwool', note: 'Fire resistant, holds shape, good sound damping.' },
  { id: 'sheepwool', name: "Sheep's wool", rPerIn: 3.6, costSqft: 2.7, color: '#efe3c8', tex: 'wool', note: 'Natural, manages moisture; pricier.' },
  { id: 'cellulose', name: 'Dense-pack cellulose', rPerIn: 3.7, costSqft: 1.3, color: '#b8a687', tex: 'cellulose', note: 'Blown in behind netting; recycled paper.' },
  { id: 'sprayfoam', name: 'Closed-cell spray foam', rPerIn: 6.5, costSqft: 3.4, color: '#e6d47a', tex: 'foam', note: 'Highest R per inch, air seals, needs a pro.' },
];

export const ROOF_STYLES = [
  { id: 'gable', name: 'Gable', desc: 'Two slopes, sheds snow both ways.', icon: 'M2 18 12 6l10 12' },
  { id: 'hip', name: 'Hip', desc: 'Slopes on all four sides; strong in wind.', icon: 'M2 18l6-10h8l6 10M8 8l4 4 4-4' },
  { id: 'shed', name: 'Shed', desc: 'One slope. Simple, great for solar.', icon: 'M2 17 22 7v10' },
  { id: 'flat', name: 'Flat', desc: 'Low slope membrane roof.', icon: 'M2 13h20v3H2z' },
  { id: 'gambrel', name: 'Gambrel', desc: 'Barn roof: steep lower, shallow upper. Big loft.', icon: 'M2 18l4-8 6-5 6 5 4 8' },
  { id: 'saltbox', name: 'Saltbox', desc: 'Off-center ridge; long low side to the north.', icon: 'M2 18l6-12 4 4 10 8' },
];

export const FOUNDATIONS = [
  { id: 'slab', name: 'Monolithic slab', desc: 'Slab with thickened edge. Warm climates or engineered insulated slabs.' },
  { id: 'stem', name: 'Stem wall + slab', desc: 'Footing below frost, stem walls, slab inside. Common where it freezes.' },
  { id: 'crawl', name: 'Crawlspace', desc: 'Footing and stem walls, wood floor over a crawlspace.' },
  { id: 'piers', name: 'Piers / posts', desc: 'Concrete piers under beams. Typical for cabins and permafrost ground.' },
];

// ---------------------------------------------------------------------------
// Materials & colors
// ---------------------------------------------------------------------------
export const SIDING = [
  { id: 'lap', name: 'Lap siding', costSqft: 4.25, tex: 'lap' },
  { id: 'batten', name: 'Board & batten', costSqft: 4.0, tex: 'batten' },
  { id: 'shingle', name: 'Cedar shingle', costSqft: 7.5, tex: 'shingle' },
  { id: 'metal', name: 'Metal panel', costSqft: 5.0, tex: 'metalwall' },
  { id: 'log', name: 'Log siding', costSqft: 8.0, tex: 'log', stained: true },
  { id: 't111', name: 'T1-11 plywood', costSqft: 2.4, tex: 't111', stained: true },
  { id: 'shiplap', name: 'Shiplap', costSqft: 4.6, tex: 'shiplap', stained: true },
];

export const STONE_VENEER = [
  { id: 'ledge-gray', name: 'Ledgestone · gray', tex: 'ledgestone', hex: '#9a9a96' },
  { id: 'ledge-tan', name: 'Ledgestone · tan', tex: 'ledgestone', hex: '#b9a888' },
  { id: 'river-gray', name: 'River rock · gray', tex: 'riverrock', hex: '#8e8c88' },
  { id: 'river-warm', name: 'River rock · warm', tex: 'riverrock', hex: '#a3917a' },
  { id: 'field-brown', name: 'Fieldstone · brown', tex: 'fieldstone', hex: '#7f6a55' },
  { id: 'slate-char', name: 'Stacked slate · charcoal', tex: 'ledgestone', hex: '#5d5f63' },
];

export const ROOFING = [
  { id: 'asphalt', name: 'Asphalt shingle', costSquare: 140, tex: 'shingleroof', minPitch: 2 },
  { id: 'standing', name: 'Standing-seam metal', costSquare: 520, tex: 'standingseam', minPitch: 0.5 },
  { id: 'corrugated', name: 'Corrugated metal', costSquare: 340, tex: 'corrugated', minPitch: 1 },
  { id: 'shake', name: 'Cedar shake', costSquare: 620, tex: 'shake', minPitch: 4 },
  { id: 'membrane', name: 'Membrane (flat)', costSquare: 460, tex: 'membrane', minPitch: 0 },
];

export const FLOORING = [
  { id: 'hardwood', name: 'Hardwood', costSqft: 7.5, tex: 'hardwood' },
  { id: 'laminate', name: 'Laminate', costSqft: 3.0, tex: 'laminate' },
  { id: 'lvp', name: 'Luxury vinyl plank', costSqft: 3.8, tex: 'lvp' },
  { id: 'tile', name: 'Ceramic tile', costSqft: 9.0, tex: 'tile' },
  { id: 'slate', name: 'Slate tile', costSqft: 12.0, tex: 'slate' },
  { id: 'cork', name: 'Cork', costSqft: 6.0, tex: 'cork' },
  { id: 'carpet', name: 'Carpet', costSqft: 3.2, tex: 'carpet' },
  { id: 'concrete', name: 'Sealed concrete', costSqft: 1.5, tex: 'concretefloor' },
  { id: 'epoxy', name: 'Epoxy (garage)', costSqft: 4.5, tex: 'epoxy' },
];

export const SIDING_COLORS = [
  { id: 'spruce', name: 'Spruce green', hex: '#4a5e4a' }, { id: 'sage', name: 'Sage', hex: '#8a9a7b' },
  { id: 'barn', name: 'Barn red', hex: '#7a2e2a' }, { id: 'rust', name: 'Rust', hex: '#8f4a2b' },
  { id: 'fog', name: 'Fog', hex: '#b8bcb6' }, { id: 'slate', name: 'Slate blue', hex: '#55687a' },
  { id: 'navy', name: 'Navy', hex: '#2c3a52' }, { id: 'charcoal', name: 'Charcoal', hex: '#3b3d40' },
  { id: 'white', name: 'White', hex: '#e9e6df' }, { id: 'cream', name: 'Cream', hex: '#e2d8c2' },
  { id: 'tan', name: 'Tan', hex: '#b9a27d' }, { id: 'cedar', name: 'Cedar', hex: '#a86a3c' },
  { id: 'walnut', name: 'Walnut', hex: '#5e3f2b' }, { id: 'honey', name: 'Honey', hex: '#c98f4c' },
  { id: 'driftwood', name: 'Driftwood', hex: '#8f877a' }, { id: 'black', name: 'Black', hex: '#1f2022' },
];
export const TRIM_COLORS = [
  { id: 'white', name: 'White', hex: '#f1efe8' }, { id: 'cream', name: 'Cream', hex: '#e8dfc8' },
  { id: 'black', name: 'Black', hex: '#1e1f21' }, { id: 'charcoal', name: 'Charcoal', hex: '#44464a' },
  { id: 'cedar', name: 'Cedar', hex: '#a86a3c' }, { id: 'walnut', name: 'Walnut', hex: '#5e3f2b' },
  { id: 'spruce', name: 'Spruce green', hex: '#3f513f' }, { id: 'barn', name: 'Barn red', hex: '#72302b' },
];
export const INTERIOR_TRIM_COLORS = [
  { id: 'white', name: 'White', hex: '#f4f2ec' }, { id: 'cream', name: 'Cream', hex: '#e9e1cc' }, { id: 'natural', name: 'Natural wood', hex: '#c9a070' },
  { id: 'walnut', name: 'Walnut', hex: '#5e3f2b' }, { id: 'black', name: 'Black', hex: '#2a2a2c' }, { id: 'sage', name: 'Sage', hex: '#8fa08a' },
];
export const DOOR_COLORS = [
  { id: 'trim', name: 'Match trim', hex: '' }, { id: 'barn', name: 'Barn red', hex: '#a8452f' }, { id: 'navy', name: 'Navy', hex: '#223a5e' },
  { id: 'spruce', name: 'Spruce green', hex: '#3f513f' }, { id: 'honey', name: 'Honey wood', hex: '#c58f4a' }, { id: 'walnut', name: 'Walnut', hex: '#5e3f2b' },
  { id: 'black', name: 'Black', hex: '#1e1f21' }, { id: 'white', name: 'White', hex: '#f1efe8' }, { id: 'mustard', name: 'Mustard', hex: '#c9962b' },
];
export const ROOF_COLORS = [
  { id: 'charcoal', name: 'Charcoal', hex: '#3a3b3e' }, { id: 'weathered', name: 'Weathered wood', hex: '#6b5d4e' },
  { id: 'forest', name: 'Forest green', hex: '#2f4a38' }, { id: 'red', name: 'Rustic red', hex: '#6e2f28' },
  { id: 'galv', name: 'Galvanized', hex: '#9aa0a6' }, { id: 'bronze', name: 'Bronze', hex: '#4e4034' },
  { id: 'slate', name: 'Slate', hex: '#50606c' }, { id: 'black', name: 'Black', hex: '#1d1e20' },
];
export const STAIN_COLORS = [
  { id: 'natural', name: 'Natural pine', hex: '#d9b98a' }, { id: 'honey', name: 'Honey', hex: '#c58f4a' },
  { id: 'cedar', name: 'Cedar', hex: '#a86a3c' }, { id: 'walnut', name: 'Walnut', hex: '#5e3f2b' },
  { id: 'driftwood', name: 'Driftwood gray', hex: '#8f877a' }, { id: 'ebony', name: 'Ebony', hex: '#2a2420' },
  { id: 'white', name: 'Whitewash', hex: '#e8e1d2' }, { id: 'barn', name: 'Barn red', hex: '#7a3a30' },
];
export const PAINT_COLORS = [
  { id: 'warmwhite', name: 'Warm white', hex: '#f3efe6' }, { id: 'linen', name: 'Linen', hex: '#e7dfd0' },
  { id: 'greige', name: 'Greige', hex: '#cfc7b8' }, { id: 'sage', name: 'Sage', hex: '#b7c1ad' },
  { id: 'sky', name: 'Pale sky', hex: '#c9d6de' }, { id: 'clay', name: 'Clay', hex: '#c89b7e' },
  { id: 'slate', name: 'Slate', hex: '#6f7d88' }, { id: 'forest', name: 'Forest', hex: '#4b5f4b' },
  { id: 'navy', name: 'Navy', hex: '#34435c' }, { id: 'charcoal', name: 'Charcoal', hex: '#45474b' },
  { id: 'blush', name: 'Blush', hex: '#dcc3bb' }, { id: 'mustard', name: 'Mustard', hex: '#d2a644' },
];
export const FABRIC_COLORS = [
  { id: 'oat', name: 'Oatmeal', hex: '#cfc4b2' }, { id: 'gray', name: 'Heather gray', hex: '#8d8f93' },
  { id: 'charcoal', name: 'Charcoal', hex: '#44464b' }, { id: 'forest', name: 'Forest', hex: '#3f5a46' },
  { id: 'rust', name: 'Rust', hex: '#a3553a' }, { id: 'navy', name: 'Navy', hex: '#2f3f5f' },
  { id: 'cream', name: 'Cream', hex: '#efe8da' }, { id: 'plum', name: 'Plum', hex: '#5e3a52' },
  { id: 'leather', name: 'Brown leather', hex: '#6b4a32' }, { id: 'sage', name: 'Sage', hex: '#9aa58c' },
];
export const METAL_COLORS = [
  { id: 'stainless', name: 'Stainless', hex: '#c5c8cc' }, { id: 'white', name: 'White', hex: '#eceeee' },
  { id: 'black', name: 'Matte black', hex: '#2a2b2d' }, { id: 'slate', name: 'Slate', hex: '#6d7378' },
  { id: 'bisque', name: 'Bisque', hex: '#e6dcc8' }, { id: 'red', name: 'Cherry red', hex: '#9a2d2a' },
  { id: 'blue', name: 'Steel blue', hex: '#4f6b84' }, { id: 'copper', name: 'Copper', hex: '#b2704b' },
];
export const CABINET_FINISHES = [
  { id: 'wood', name: 'Stained wood' }, { id: 'painted', name: 'Painted' }, { id: 'laminate', name: 'Laminate (gloss)' },
];

// Older projects stored 'double' and 'french' as styles of their own.
export const LEGACY_DOOR_STYLES = { double: { style: 'single', leaves: 2 }, french: { style: 'glass', leaves: 2 } };
export const OPENING_STYLES = {
  // Doors: `w` is the single-leaf width, `w2` the double width. Any style can be single or double
  // (o.leaves), except sliders (always two panels) and garage doors.
  door: [
    { id: 'single', name: 'Panel door', w: 3.0, w2: 5.0, h: 6.67 },
    { id: 'glass', name: 'Glass door', w: 3.0, w2: 5.0, h: 6.67, glass: true, doubleName: 'French doors' },
    { id: 'sliding', name: 'Sliding glass', w: 6.0, w2: 6.0, h: 6.67, glass: true, slides: true, fixedLeaves: 2 },
    { id: 'barn', name: 'Barn door', w: 3.5, w2: 6.0, h: 7.0, slides: true },
    { id: 'dutch', name: 'Dutch door', w: 3.0, w2: 5.0, h: 6.67, dutch: true },
    { id: 'garage9', name: 'Garage door 9 ft', w: 9.0, h: 7.0, garage: true, fixedLeaves: 1 },
    { id: 'garage10', name: 'Garage door 10 ft × 8 ft', w: 10.0, h: 8.0, garage: true, fixedLeaves: 1 },
    { id: 'garage16', name: 'Garage door 16 ft', w: 16.0, h: 7.0, garage: true, fixedLeaves: 1 },
    { id: 'garage18', name: 'Garage door 18 ft × 8 ft', w: 18.0, h: 8.0, garage: true, fixedLeaves: 1 },
  ],
  opening: [
    { id: 'cased', name: 'Cased opening', w: 3.5, h: 6.83 },
    { id: 'arch', name: 'Arched opening', w: 3.5, h: 7.0, arch: true },
    { id: 'wide', name: 'Wide opening', w: 6.0, h: 6.83 },
    { id: 'passthru', name: 'Pass-through', w: 4.0, h: 3.0, sill: 3.5 },
  ],
  window: [
    { id: 'single', name: 'Single hung', w: 3.0, h: 4.0, sill: 3.0 },
    { id: 'double', name: 'Double hung pair', w: 5.0, h: 4.0, sill: 3.0 },
    { id: 'picture', name: 'Picture', w: 6.0, h: 5.0, sill: 2.5 },
    { id: 'slider', name: 'Slider', w: 5.0, h: 3.0, sill: 3.5 },
    { id: 'awning', name: 'Awning', w: 3.0, h: 2.0, sill: 5.0 },
    { id: 'small', name: 'Bath / utility', w: 2.0, h: 2.5, sill: 4.5 },
    { id: 'tall', name: 'Tall casement', w: 2.5, h: 6.0, sill: 1.5 },
    { id: 'clerestory', name: 'Clerestory strip', w: 8.0, h: 1.5, sill: 7.0 },
  ],
};

// ---------------------------------------------------------------------------
// Items. w × d × h in feet; `build` names the mesh recipe in builder.js.
//  color:     default color; `palette` says which swatch set the inspector offers
//  sizable:   {w:[min,max], d:[..], h:[..]} ranges the user can drag
//  vent:      {to:'roof'|'wall', dia, kind} — the builder routes a pipe/duct automatically
//  structural: feeds the engineer notes
// ---------------------------------------------------------------------------
export const ITEM_GROUPS = [
  { id: 'bedroom', name: 'Bedroom' }, { id: 'living', name: 'Living' }, { id: 'kitchen', name: 'Kitchen' },
  { id: 'bath', name: 'Bath' }, { id: 'utility', name: 'Utility' }, { id: 'garage', name: 'Garage & vehicles' }, { id: 'lights', name: 'Lights' },
  { id: 'landscape', name: 'Landscape' }, { id: 'site', name: 'Site & outdoors' }, { id: 'systems', name: 'Systems & vents' },
];

const WOOD = { palette: 'wood', color: '#8a5a3a' };
export const ITEMS = [
  // bedroom
  { id: 'bed-queen', name: 'Queen bed', group: 'bedroom', w: 5.0, d: 6.7, h: 2.0, build: 'bed', palette: 'fabric', color: '#6b7d8c' },
  { id: 'bed-king', name: 'King bed', group: 'bedroom', w: 6.3, d: 6.7, h: 2.0, build: 'bed', palette: 'fabric', color: '#6b7d8c' },
  { id: 'bed-full', name: 'Full bed', group: 'bedroom', w: 4.5, d: 6.3, h: 2.0, build: 'bed', palette: 'fabric', color: '#8d8f93' },
  { id: 'bed-twin', name: 'Twin bed', group: 'bedroom', w: 3.25, d: 6.4, h: 2.0, build: 'bed', palette: 'fabric', color: '#3f5a46' },
  { id: 'bunkbed', name: 'Bunk bed', group: 'bedroom', w: 3.4, d: 6.6, h: 5.8, build: 'bunk', ...WOOD },
  { id: 'crib', name: 'Crib', group: 'bedroom', w: 2.5, d: 4.5, h: 3.2, build: 'crib', palette: 'wood', color: '#d9c7a8' },
  { id: 'dresser', name: 'Dresser', group: 'bedroom', w: 5.0, d: 1.6, h: 2.8, build: 'drawers', ...WOOD, sizable: { w: [2.5, 7], d: [1.2, 2.2], h: [2.2, 4.5] } },
  { id: 'nightstand', name: 'Nightstand', group: 'bedroom', w: 1.8, d: 1.5, h: 2.0, build: 'drawers', ...WOOD },
  { id: 'closet', name: 'Wardrobe', group: 'bedroom', w: 4.0, d: 2.0, h: 6.5, build: 'box', palette: 'paint', color: '#cbbfae', sizable: { w: [2, 8], d: [1.5, 2.5], h: [5, 8] } },
  // living
  { id: 'sofa', name: 'Sofa', group: 'living', w: 7.0, d: 3.0, h: 2.6, build: 'sofa', palette: 'fabric', color: '#8a8275', sizable: { w: [4.5, 10], d: [2.6, 3.6] } },
  { id: 'sectional', name: 'Sectional', group: 'living', w: 9.0, d: 6.5, h: 2.6, build: 'sectional', palette: 'fabric', color: '#8d8f93' },
  { id: 'loveseat', name: 'Loveseat', group: 'living', w: 5.0, d: 3.0, h: 2.6, build: 'sofa', palette: 'fabric', color: '#a3553a' },
  { id: 'armchair', name: 'Armchair', group: 'living', w: 3.0, d: 3.0, h: 2.6, build: 'sofa', palette: 'fabric', color: '#6b4a32' },
  { id: 'recliner', name: 'Recliner', group: 'living', w: 3.0, d: 3.3, h: 3.3, build: 'sofa', palette: 'fabric', color: '#44464b' },
  { id: 'coffee', name: 'Coffee table', group: 'living', w: 4.0, d: 2.0, h: 1.4, build: 'table', ...WOOD, sizable: { w: [2, 6], d: [1.5, 3] } },
  { id: 'sidetable', name: 'Side table', group: 'living', w: 1.8, d: 1.8, h: 2.0, build: 'table', ...WOOD },
  { id: 'dining', name: 'Dining table', group: 'living', w: 6.0, d: 3.0, h: 2.5, build: 'table', ...WOOD, sizable: { w: [3, 10], d: [2.5, 4] } },
  { id: 'chair', name: 'Chair', group: 'living', w: 1.6, d: 1.6, h: 3.0, build: 'chair', ...WOOD },
  { id: 'bookshelf', name: 'Bookshelf', group: 'living', w: 3.0, d: 1.0, h: 6.0, build: 'shelves', ...WOOD, sizable: { w: [2, 8], h: [3, 8] } },
  { id: 'tvstand', name: 'TV stand', group: 'living', w: 5.0, d: 1.5, h: 1.8, build: 'tv', ...WOOD, sizable: { w: [3, 8] } },
  { id: 'tvwall', name: 'Wall-mounted TV', group: 'living', w: 4.2, d: 0.25, h: 2.4, build: 'tvwall', wall: true, mountHeight: 3.6, sizable: { w: [2.5, 7] }, note: 'Hung above a fireplace, the chimney is boxed in behind drywall inside and only shows above the roof.' },
  { id: 'curtains', name: 'Curtains + rod', group: 'living', w: 5.5, d: 0.5, h: 7.0, build: 'curtains', wall: true, mountHeight: 7.0, palette: 'fabric', color: '#cfc4b2', sizable: { w: [2.5, 12], h: [3, 9] }, note: 'Place over a window; the panels hang from the rod height you set.' },
  { id: 'coatrack', name: 'Coat rack beam', group: 'living', w: 3.0, d: 0.5, h: 0.5, build: 'coatrack', wall: true, mountHeight: 5.5, ...WOOD, sizable: { w: [1.5, 8] } },
  { id: 'wallshelf', name: 'Wall shelf', group: 'living', w: 3.0, d: 0.8, h: 0.2, build: 'wallshelf', wall: true, mountHeight: 5.0, ...WOOD, sizable: { w: [1.5, 8] } },
  { id: 'mirror', name: 'Wall mirror', group: 'living', w: 2.0, d: 0.15, h: 3.0, build: 'mirror', wall: true, mountHeight: 4.0, sizable: { w: [1, 5], h: [1, 6] } },
  { id: 'wallart', name: 'Framed art', group: 'living', w: 2.5, d: 0.15, h: 2.0, build: 'wallart', wall: true, mountHeight: 4.5, palette: 'paint', color: '#6f7d88', sizable: { w: [1, 6], h: [1, 4] } },
  { id: 'plant', name: 'Floor plant', group: 'living', w: 2.0, d: 2.0, h: 5.0, build: 'plant', palette: 'paint', color: '#cbbfae' },
  { id: 'bench', name: 'Entry bench', group: 'living', w: 4.0, d: 1.5, h: 1.6, build: 'bench', ...WOOD, sizable: { w: [2.5, 7] } },
  { id: 'stairs', name: 'Stairs (straight)', group: 'living', w: 3.5, d: 12, h: 9, build: 'stairs', stair: 'straight', ...WOOD, sizable: { w: [3, 5] }, note: 'Runs up to the next floor and cuts the opening in it. Rotate so the top lands where you want; the run length follows the floor height.' },
  { id: 'stairs-l', name: 'Stairs (L with landing)', group: 'living', w: 7.0, d: 9, h: 9, build: 'stairs', stair: 'L', ...WOOD, sizable: { w: [6, 9] }, note: 'Half the rise, a landing, then a quarter turn. The opening above is cut automatically.' },
  { id: 'woodstove', name: 'Wood stove', group: 'living', w: 2.2, d: 2.0, h: 2.6, build: 'woodstove', structural: 'heat', vent: { to: 'roof', dia: 0.5, kind: 'stovepipe' }, fire: { x: 0, y: 1.3, z: 1.05, size: 0.7, light: 18, distance: 14 } },
  { id: 'fireplace', name: 'Fireplace (masonry)', group: 'living', w: 5.0, d: 2.2, h: 4.5, build: 'fireplace', wall: true, structural: 'heat', vent: { to: 'roof', dia: 2.0, kind: 'chimney' }, palette: 'stone', color: '#8a8580', fire: { x: 0, y: 0.9, z: 0.95, size: 1.4, light: 30, distance: 22 } },
  { id: 'desk', name: 'Desk', group: 'living', w: 4.5, d: 2.2, h: 2.5, build: 'table', ...WOOD, sizable: { w: [3, 7] } },
  { id: 'deskchair', name: 'Office chair', group: 'living', w: 2.0, d: 2.0, h: 3.5, build: 'chair', palette: 'fabric', color: '#2a2b2d' },
  { id: 'rug', name: 'Rug', group: 'living', w: 8.0, d: 5.0, h: 0.05, build: 'rug', palette: 'fabric', color: '#9aa58c', sizable: { w: [3, 14], d: [2, 12] } },
  { id: 'piano', name: 'Upright piano', group: 'living', w: 5.0, d: 2.1, h: 4.2, build: 'box', palette: 'wood', color: '#2a2420', structural: 'heavy' },
  // kitchen
  { id: 'counter', name: 'Base cabinets 8 ft', group: 'kitchen', w: 8.0, d: 2.0, h: 3.0, build: 'counter', palette: 'cabinet', color: '#5f4a38', finish: 'wood', sizable: { w: [1.5, 16] } },
  { id: 'counter4', name: 'Base cabinets 4 ft', group: 'kitchen', w: 4.0, d: 2.0, h: 3.0, build: 'counter', palette: 'cabinet', color: '#5f4a38', finish: 'wood', sizable: { w: [1.5, 16] } },
  { id: 'cornercab', name: 'Corner base cabinet', group: 'kitchen', w: 3.0, d: 3.0, h: 3.0, build: 'counter', palette: 'cabinet', color: '#5f4a38', finish: 'wood' },
  { id: 'island', name: 'Island', group: 'kitchen', w: 6.0, d: 3.0, h: 3.0, build: 'counter', palette: 'cabinet', color: '#3b4a4d', finish: 'painted', island: true, sizable: { w: [3, 10], d: [2, 4.5] } },
  { id: 'uppercab', name: 'Upper cabinets 4 ft', group: 'kitchen', w: 4.0, d: 1.0, h: 2.5, build: 'uppercab', palette: 'cabinet', color: '#5f4a38', finish: 'wood', wall: true, mountHeight: 4.5, sizable: { w: [1.5, 12], h: [1.5, 3.5] } },
  { id: 'pantry', name: 'Pantry cabinet', group: 'kitchen', w: 2.0, d: 2.0, h: 7.0, build: 'box', palette: 'cabinet', color: '#5f4a38', finish: 'wood', sizable: { w: [1.5, 4] } },
  { id: 'sinkbase', name: 'Sink cabinet', group: 'kitchen', w: 3.0, d: 2.0, h: 3.0, build: 'counter', palette: 'cabinet', color: '#5f4a38', finish: 'wood', sink: true, plumbing: true },
  { id: 'fridge', name: 'Refrigerator', group: 'kitchen', w: 3.0, d: 2.6, h: 5.8, build: 'appliance', palette: 'metal', color: '#c5c8cc' },
  { id: 'range', name: 'Range', group: 'kitchen', w: 2.5, d: 2.2, h: 3.0, build: 'appliance', palette: 'metal', color: '#2b2c2e', range: true },
  { id: 'rangehood', name: 'Range hood', group: 'kitchen', w: 2.5, d: 1.6, h: 0.8, build: 'hood', palette: 'metal', color: '#c5c8cc', wall: true, mountHeight: 5.5, vent: { to: 'wall', dia: 0.5, kind: 'duct' } },
  { id: 'dishwasher', name: 'Dishwasher', group: 'kitchen', w: 2.0, d: 2.0, h: 2.9, build: 'appliance', palette: 'metal', color: '#c5c8cc', plumbing: true },
  { id: 'microwave', name: 'Microwave', group: 'kitchen', w: 1.8, d: 1.3, h: 1.0, build: 'box', palette: 'metal', color: '#2a2b2d', mountHeight: 3.1 },
  { id: 'barstool', name: 'Bar stool', group: 'kitchen', w: 1.3, d: 1.3, h: 2.5, build: 'stool', ...WOOD },
  { id: 'kitchentable', name: 'Kitchen table', group: 'kitchen', w: 4.0, d: 3.0, h: 2.5, build: 'table', ...WOOD },
  // bath
  { id: 'toilet', name: 'Toilet', group: 'bath', w: 1.6, d: 2.4, h: 2.5, build: 'toilet', plumbing: true },
  { id: 'vanity', name: 'Vanity', group: 'bath', w: 3.0, d: 1.8, h: 2.9, build: 'counter', palette: 'cabinet', color: '#4a5560', finish: 'painted', sink: true, plumbing: true, sizable: { w: [2, 6] } },
  { id: 'pedestal', name: 'Pedestal sink', group: 'bath', w: 2.0, d: 1.6, h: 2.9, build: 'pedestal', plumbing: true },
  { id: 'tub', name: 'Bathtub', group: 'bath', w: 5.0, d: 2.5, h: 1.8, build: 'tub', structural: 'heavy', plumbing: true },
  { id: 'tubshower', name: 'Tub + shower', group: 'bath', w: 5.0, d: 2.6, h: 7.0, build: 'tubshower', structural: 'heavy', plumbing: true },
  { id: 'shower', name: 'Shower', group: 'bath', w: 3.0, d: 3.0, h: 7.0, build: 'shower', plumbing: true, sizable: { w: [2.5, 6], d: [2.5, 6] } },
  { id: 'linen', name: 'Linen cabinet', group: 'bath', w: 2.0, d: 1.5, h: 6.5, build: 'box', palette: 'cabinet', color: '#e4dfd5', finish: 'painted' },
  { id: 'bathfan', name: 'Bath fan', group: 'bath', w: 1.0, d: 1.0, h: 0.3, build: 'marker', color: '#dfe3e8', ceiling: true, vent: { to: 'roof', dia: 0.33, kind: 'duct' } },
  // utility
  { id: 'washer', name: 'Washer', group: 'utility', w: 2.3, d: 2.3, h: 3.2, build: 'appliance', palette: 'metal', color: '#dfe2e5', structural: 'laundry', plumbing: true },
  { id: 'dryer', name: 'Dryer', group: 'utility', w: 2.3, d: 2.3, h: 3.2, build: 'appliance', palette: 'metal', color: '#dfe2e5', structural: 'laundry', vent: { to: 'wall', dia: 0.33, kind: 'duct' } },
  { id: 'stackedwd', name: 'Stacked washer/dryer', group: 'utility', w: 2.3, d: 2.5, h: 6.3, build: 'appliance', palette: 'metal', color: '#dfe2e5', structural: 'laundry', plumbing: true, vent: { to: 'wall', dia: 0.33, kind: 'duct' } },
  { id: 'utilitysink', name: 'Utility sink', group: 'utility', w: 2.0, d: 2.0, h: 2.9, build: 'utilitysink', plumbing: true },
  { id: 'waterheater', name: 'Water heater', group: 'utility', w: 1.8, d: 1.8, h: 5.0, build: 'cylinder', color: '#d8d8d8', structural: 'heavy', plumbing: true },
  { id: 'furnace', name: 'Furnace', group: 'utility', w: 2.5, d: 2.5, h: 4.5, build: 'box', color: '#9a9ea3', vent: { to: 'roof', dia: 0.5, kind: 'flue' } },
  { id: 'boiler', name: 'Boiler (hydronic)', group: 'utility', w: 2.2, d: 1.5, h: 3.0, build: 'box', color: '#b9bcc0', wall: true, mountHeight: 1.5, vent: { to: 'wall', dia: 0.33, kind: 'flue' } },
  { id: 'freezer', name: 'Chest freezer', group: 'utility', w: 4.0, d: 2.3, h: 2.9, build: 'appliance', palette: 'metal', color: '#e8e9ea' },
  { id: 'panel', name: 'Electrical panel', group: 'utility', w: 1.3, d: 0.4, h: 2.5, build: 'box', color: '#9fa6ad', wall: true, mountHeight: 4.5, system: 'electrical' },
  // garage & vehicles
  { id: 'truck-long', name: 'Crew-cab long-bed truck (22 ft)', group: 'garage', w: 6.9, d: 22.0, h: 6.6, build: 'truck', palette: 'metal', color: '#4f6b84', vehicle: true },
  { id: 'truck', name: 'Pickup truck (19 ft)', group: 'garage', w: 6.8, d: 19.3, h: 6.4, build: 'truck', palette: 'metal', color: '#9a2d2a', vehicle: true },
  { id: 'suv', name: 'SUV (16 ft)', group: 'garage', w: 6.5, d: 16.2, h: 6.0, build: 'suv', palette: 'metal', color: '#2a2b2d', vehicle: true },
  { id: 'car', name: 'Car (15 ft)', group: 'garage', w: 6.0, d: 15.3, h: 4.8, build: 'car', palette: 'metal', color: '#c5c8cc', vehicle: true },
  { id: 'snowmachine', name: 'Snowmachine', group: 'garage', w: 4.0, d: 10.5, h: 4.0, build: 'sled', palette: 'metal', color: '#2f6fb3', vehicle: true },
  { id: 'atv', name: 'Four-wheeler', group: 'garage', w: 4.0, d: 7.0, h: 4.0, build: 'atv', palette: 'metal', color: '#3f5a46', vehicle: true },
  { id: 'trailer', name: 'Utility trailer (12 ft)', group: 'garage', w: 6.5, d: 14.0, h: 3.0, build: 'trailer', color: '#5b5f63', vehicle: true },
  { id: 'workbench', name: 'Workbench', group: 'garage', w: 6.0, d: 2.2, h: 3.1, build: 'table', ...WOOD, sizable: { w: [3, 12] } },
  { id: 'toolchest', name: 'Tool chest', group: 'garage', w: 3.5, d: 1.6, h: 3.5, build: 'drawers', palette: 'metal', color: '#9a2d2a' },
  { id: 'shelving', name: 'Garage shelving', group: 'garage', w: 4.0, d: 1.5, h: 6.0, build: 'shelves', palette: 'metal', color: '#6d7378', sizable: { w: [2, 10], h: [3, 8] } },
  { id: 'genset', name: 'Generator', group: 'garage', w: 3.0, d: 2.0, h: 2.2, build: 'box', color: '#c33', outdoor: true },
  // lights
  { id: 'ceilinglight', name: 'Flush ceiling light', group: 'lights', w: 1.2, d: 1.2, h: 0.4, build: 'ceilinglight', light: { intensity: 60, kelvin: 2900, distance: 22 }, ceiling: true },
  { id: 'recessed', name: 'Recessed can', group: 'lights', w: 0.6, d: 0.6, h: 0.1, build: 'recessed', light: { intensity: 38, kelvin: 3000, distance: 16 }, ceiling: true },
  { id: 'pendant', name: 'Pendant', group: 'lights', w: 1.0, d: 1.0, h: 2.5, build: 'pendant', light: { intensity: 45, kelvin: 2700, distance: 18 }, ceiling: true, palette: 'metal', color: '#2b2b2b' },
  { id: 'chandelier', name: 'Chandelier', group: 'lights', w: 2.2, d: 2.2, h: 2.4, build: 'chandelier', light: { intensity: 90, kelvin: 2700, distance: 26 }, ceiling: true, palette: 'metal', color: '#3b3025' },
  { id: 'floorlamp', name: 'Floor lamp', group: 'lights', w: 1.2, d: 1.2, h: 5.5, build: 'floorlamp', light: { intensity: 35, kelvin: 2700, distance: 16 } },
  { id: 'tablelamp', name: 'Table lamp', group: 'lights', w: 1.0, d: 1.0, h: 2.0, build: 'tablelamp', light: { intensity: 25, kelvin: 2600, distance: 12 }, mountHeight: 2.0 },
  { id: 'sconce', name: 'Wall sconce', group: 'lights', w: 0.6, d: 0.4, h: 0.9, build: 'sconce', light: { intensity: 25, kelvin: 2700, distance: 12 }, wall: true },
  { id: 'porchlight', name: 'Porch light', group: 'lights', w: 0.6, d: 0.5, h: 1.0, build: 'sconce', light: { intensity: 30, kelvin: 2700, distance: 18 }, wall: true, exterior: true },
  { id: 'postlantern', name: 'Post lantern', group: 'lights', w: 0.8, d: 0.8, h: 6.5, build: 'lantern', light: { intensity: 40, kelvin: 2600, distance: 24 }, outdoor: true },
  { id: 'shoplight', name: 'Shop light (LED strip)', group: 'lights', w: 4.0, d: 0.5, h: 0.3, build: 'shoplight', light: { intensity: 80, kelvin: 5000, distance: 24 }, ceiling: true },
  // landscape
  { id: 'spruce', name: 'Spruce', group: 'landscape', w: 10, d: 10, h: 32, build: 'spruce', outdoor: true, sway: true },
  { id: 'spruce-small', name: 'Young spruce', group: 'landscape', w: 6, d: 6, h: 14, build: 'spruce', outdoor: true, sway: true },
  { id: 'birch', name: 'Birch', group: 'landscape', w: 14, d: 14, h: 30, build: 'birch', outdoor: true, sway: true },
  { id: 'aspen', name: 'Aspen / cottonwood', group: 'landscape', w: 12, d: 12, h: 36, build: 'aspen', outdoor: true, sway: true },
  { id: 'shrub', name: 'Shrub', group: 'landscape', w: 3.5, d: 3.5, h: 3, build: 'shrub', outdoor: true, sway: true },
  { id: 'boulder', name: 'Boulder', group: 'landscape', w: 4, d: 3.2, h: 2.2, build: 'boulder', outdoor: true },
  { id: 'lawn', name: 'Lawn patch', group: 'landscape', w: 30, d: 30, h: 0.02, build: 'lawn', outdoor: true, resizable: true, reveal: true },
  { id: 'gardenbed', name: 'Raised garden bed', group: 'landscape', w: 8, d: 4, h: 1.5, build: 'gardenbed', outdoor: true, resizable: true },
  { id: 'path', name: 'Stone path', group: 'landscape', w: 3, d: 20, h: 0.1, build: 'path', outdoor: true, resizable: true },
  { id: 'firepit', name: 'Fire pit', group: 'landscape', w: 4, d: 4, h: 1.2, build: 'firepit', outdoor: true, light: { intensity: 30, kelvin: 1900, distance: 20 }, fire: { x: 0, y: 0.7, z: 0, size: 1.6, light: 0, distance: 0 } },
  { id: 'picnic', name: 'Picnic table', group: 'landscape', w: 6, d: 5, h: 2.5, build: 'picnic', outdoor: true, ...WOOD },
  { id: 'woodpile', name: 'Wood pile', group: 'landscape', w: 8, d: 2, h: 4, build: 'woodpile', outdoor: true, resizable: true },
  // site
  { id: 'gravelpad', name: 'Gravel pad 40×60', group: 'site', w: 60, d: 40, h: 0.6, build: 'pad', outdoor: true, resizable: true, gravel: true },
  { id: 'driveway', name: 'Gravel driveway 12×60', group: 'site', w: 12, d: 60, h: 0.3, build: 'pad', outdoor: true, resizable: true, gravel: true },
  { id: 'deck', name: 'Deck', group: 'site', w: 12, d: 10, h: 2.5, build: 'deck', outdoor: true, resizable: true, ...WOOD, railing: true, deck: true },
  { id: 'porchroof', name: 'Covered porch', group: 'site', w: 12, d: 8, h: 9, build: 'porch', outdoor: true, resizable: true, ...WOOD, deck: true },
  { id: 'fence', name: 'Fence (8 ft section)', group: 'site', w: 8, d: 0.4, h: 4, build: 'fence', outdoor: true, resizable: true, ...WOOD },
  { id: 'shed', name: 'Storage shed 8×10', group: 'site', w: 10, d: 8, h: 8, build: 'shed', outdoor: true, resizable: true, palette: 'siding', color: '#8f877a' },
  { id: 'fueltank', name: 'Heating-oil tank', group: 'site', w: 5.5, d: 2.5, h: 4.5, build: 'tank', outdoor: true },
  { id: 'propane', name: 'Propane tank (500 gal)', group: 'site', w: 10, d: 3.2, h: 4.2, build: 'propane', outdoor: true },
  { id: 'wellhead', name: 'Well casing', group: 'site', w: 0.7, d: 0.7, h: 1.5, build: 'cylinder', color: '#5b6b7a', outdoor: true, note: 'Keep 100 ft from the septic drain field.' },
  { id: 'septic', name: 'Septic tank (buried)', group: 'site', w: 9, d: 5, h: 0.3, build: 'septic', outdoor: true, note: 'Tank 10 ft from the house; drain field downhill, 100 ft from the well.' },
  { id: 'solar-ground', name: 'Solar array (ground mount)', group: 'site', w: 14, d: 7, h: 6, build: 'solar', outdoor: true, solar: true },
  { id: 'solar-roof', name: 'Solar array (on roof)', group: 'site', w: 14, d: 10, h: 0.4, build: 'solarroof', outdoor: true, solar: true, onRoof: true },
  { id: 'heatpump', name: 'Heat pump (outdoor unit)', group: 'site', w: 3.0, d: 1.2, h: 2.6, build: 'heatpump', outdoor: true },
  // systems
  { id: 'outlet', name: 'Outlet', group: 'systems', w: 0.4, d: 0.1, h: 0.4, build: 'marker', color: '#ffb547', wall: true, system: 'electrical', mountHeight: 1.2 },
  { id: 'switch', name: 'Switch', group: 'systems', w: 0.4, d: 0.1, h: 0.4, build: 'marker', color: '#ffb547', wall: true, system: 'electrical', mountHeight: 4.0 },
  { id: 'supplyvent', name: 'HVAC supply register', group: 'systems', w: 1.0, d: 0.3, h: 0.3, build: 'marker', color: '#7fc8ff', wall: true, system: 'hvac', mountHeight: 0.4 },
  { id: 'returnvent', name: 'HVAC return', group: 'systems', w: 1.6, d: 0.3, h: 1.0, build: 'marker', color: '#7fc8ff', wall: true, system: 'hvac', mountHeight: 1.0 },
  { id: 'drainstack', name: 'Plumbing vent stack', group: 'systems', w: 0.35, d: 0.35, h: 8.0, build: 'cylinder', color: '#5c7f9c', system: 'plumbing', vent: { to: 'roof', dia: 0.25, kind: 'pvc' } },
  { id: 'chimney', name: 'Chimney (masonry)', group: 'systems', w: 2.0, d: 2.0, h: 3.0, build: 'chimneybase', palette: 'stone', color: '#8a8580', vent: { to: 'roof', dia: 2.0, kind: 'chimney' } },
  { id: 'roofvent', name: 'Roof vent (generic)', group: 'systems', w: 0.6, d: 0.6, h: 0.6, build: 'marker', color: '#9aa0a6', vent: { to: 'roof', dia: 0.4, kind: 'pvc' } },
  { id: 'hosebib', name: 'Hose bib', group: 'systems', w: 0.3, d: 0.3, h: 0.3, build: 'marker', color: '#5c7f9c', wall: true, system: 'plumbing', exterior: true, mountHeight: 1.5 },
  { id: 'hrv', name: 'HRV / air exchanger', group: 'systems', w: 2.5, d: 1.5, h: 2.0, build: 'box', color: '#b9bcc0', wall: true, mountHeight: 6.0, vent: { to: 'wall', dia: 0.5, kind: 'duct' } },
];

export function itemDef(id) { return ITEMS.find((i) => i.id === id); }

// ---------------------------------------------------------------------------
// Prices — national "medium" baseline in USD. Region multiplier × tier multiplier apply on top,
// then any manual override from the project's Advanced settings.
// ---------------------------------------------------------------------------
export const PRICES = {
  'stud-2x4-8': { name: '2×4 × 8 ft stud', unit: 'ea', price: 4.6 },
  'stud-2x6-8': { name: '2×6 × 8 ft stud', unit: 'ea', price: 7.4 },
  'stud-2x6-10': { name: '2×6 × 10 ft', unit: 'ea', price: 9.8 },
  'plate-2x4-16': { name: '2×4 × 16 ft plate', unit: 'ea', price: 10.5 },
  'plate-2x6-16': { name: '2×6 × 16 ft plate', unit: 'ea', price: 16.0 },
  'header-2x10-8': { name: '2×10 × 8 ft header stock', unit: 'ea', price: 18.5 },
  'header-2x12-10': { name: '2×12 × 10 ft header stock', unit: 'ea', price: 29.0 },
  'lvl-header-ft': { name: 'LVL header (per lineal ft, 1¾×11⅞)', unit: 'ft', price: 9.5 },
  'rafter-2x10-16': { name: '2×10 × 16 ft rafter', unit: 'ea', price: 32.0 },
  'rafter-2x12-16': { name: '2×12 × 16 ft rafter', unit: 'ea', price: 41.0 },
  'joist-2x10-16': { name: '2×10 × 16 ft joist', unit: 'ea', price: 32.0 },
  'ridge-2x12-16': { name: '2×12 × 16 ft ridge', unit: 'ea', price: 41.0 },
  'beam-glulam-ft': { name: 'Glulam beam 5⅛×12 (per ft)', unit: 'ft', price: 22.0 },
  'post-6x6-10': { name: '6×6 × 10 ft treated post', unit: 'ea', price: 42.0 },
  'osb-wall': { name: 'OSB wall sheathing 7/16 (4×8)', unit: 'sheet', price: 17.5 },
  'osb-roof': { name: 'OSB roof sheathing 5/8 (4×8)', unit: 'sheet', price: 25.0 },
  'subfloor': { name: 'Subfloor T&G 3/4 (4×8)', unit: 'sheet', price: 43.0 },
  'drywall': { name: 'Drywall 1/2 (4×8)', unit: 'sheet', price: 14.5 },
  'housewrap': { name: 'House wrap roll (9×100 ft)', unit: 'roll', price: 165.0 },
  'icewater': { name: 'Ice & water shield roll (200 sq ft)', unit: 'roll', price: 95.0 },
  'underlayment': { name: 'Synthetic underlayment roll (1,000 sq ft)', unit: 'roll', price: 115.0 },
  'drip-edge': { name: 'Drip edge (10 ft)', unit: 'ea', price: 9.0 },
  'flashing-roll': { name: 'Flashing (aluminum coil, 50 ft)', unit: 'roll', price: 48.0 },
  'window-flashing': { name: 'Window flashing tape roll (75 ft)', unit: 'roll', price: 28.0 },
  'insul-wall': { name: 'Wall insulation (per sq ft)', unit: 'sqft', price: 1.15 },
  'insul-ceiling': { name: 'Attic / roof insulation R-49 (per sq ft)', unit: 'sqft', price: 1.7 },
  'insul-slab': { name: 'Under-slab rigid foam R-10 (per sq ft)', unit: 'sqft', price: 1.4 },
  'vapor-barrier': { name: 'Vapor barrier 6-mil roll (1,000 sq ft)', unit: 'roll', price: 85.0 },
  'poly-sheeting': { name: 'Interior poly sheeting 6-mil (1,000 sq ft)', unit: 'roll', price: 85.0 },
  'concrete': { name: 'Ready-mix concrete (per cu yd, delivered)', unit: 'yd³', price: 175.0 },
  'rebar': { name: 'Rebar #4 × 20 ft', unit: 'ea', price: 14.0 },
  'anchor-bolt': { name: 'Anchor bolt 1/2 × 10', unit: 'ea', price: 3.6 },
  'sonotube': { name: 'Pier form tube 12 in × 4 ft', unit: 'ea', price: 26.0 },
  'gravel': { name: 'Crushed gravel (per ton, delivered)', unit: 'ton', price: 38.0 },
  'geotextile': { name: 'Geotextile fabric (per sq ft)', unit: 'sqft', price: 0.18 },
  'siding': { name: 'Siding (per sq ft)', unit: 'sqft', price: 4.25 },
  'stone-veneer': { name: 'Stone veneer (per sq ft, incl. lath & mortar)', unit: 'sqft', price: 13.5 },
  'trim-board': { name: 'Trim board 1×4 × 16 ft', unit: 'ea', price: 18.0 },
  'corner-board': { name: 'Corner board 1×6 × 10 ft', unit: 'ea', price: 19.0 },
  'soffit': { name: 'Vented soffit panel (per lineal ft)', unit: 'ft', price: 3.2 },
  'fascia': { name: 'Fascia board 2×8 (per lineal ft)', unit: 'ft', price: 2.9 },
  'roofing': { name: 'Roofing (per square = 100 sq ft)', unit: 'square', price: 140.0 },
  'ridge-cap': { name: 'Ridge cap (per lineal ft)', unit: 'ft', price: 4.0 },
  'ridge-vent': { name: 'Ridge vent (per lineal ft)', unit: 'ft', price: 3.5 },
  'snow-guards': { name: 'Snow guards (per lineal ft of eave)', unit: 'ft', price: 6.0 },
  'window-single': { name: 'Window, single hung', unit: 'ea', price: 440.0 },
  'window-double': { name: 'Window, double hung pair', unit: 'ea', price: 760.0 },
  'window-picture': { name: 'Window, picture', unit: 'ea', price: 720.0 },
  'window-slider': { name: 'Window, slider', unit: 'ea', price: 410.0 },
  'window-awning': { name: 'Window, awning', unit: 'ea', price: 330.0 },
  'window-small': { name: 'Window, small', unit: 'ea', price: 260.0 },
  'window-tall': { name: 'Window, tall casement', unit: 'ea', price: 690.0 },
  'window-clerestory': { name: 'Window, clerestory strip', unit: 'ea', price: 540.0 },
  'door-ext': { name: 'Exterior door, insulated steel', unit: 'ea', price: 680.0 },
  'door-double-ext': { name: 'Exterior double door', unit: 'ea', price: 1500.0 },
  'door-int': { name: 'Interior door, pre-hung', unit: 'ea', price: 190.0 },
  'door-double-int': { name: 'Interior double door', unit: 'ea', price: 420.0 },
  'door-french': { name: 'French doors', unit: 'ea', price: 1450.0 },
  'door-sliding': { name: 'Sliding glass door', unit: 'ea', price: 1650.0 },
  'door-barn': { name: 'Barn door + track', unit: 'ea', price: 520.0 },
  'door-garage9': { name: 'Garage door 9 ft', unit: 'ea', price: 1250.0 },
  'door-garage10': { name: 'Garage door 10×8', unit: 'ea', price: 1600.0 },
  'door-garage16': { name: 'Garage door 16 ft', unit: 'ea', price: 2300.0 },
  'door-garage18': { name: 'Garage door 18×8', unit: 'ea', price: 2900.0 },
  'casing-set': { name: 'Door / window casing set', unit: 'ea', price: 38.0 },
  'baseboard-ft': { name: 'Baseboard (per lineal ft, primed MDF)', unit: 'ft', price: 1.9 },
  'crown-ft': { name: 'Crown molding (per lineal ft)', unit: 'ft', price: 3.4 },
  'stair-straight': { name: 'Stair kit, straight (stringers, treads, risers, rail)', unit: 'ea', price: 1850.0 },
  'stair-l': { name: 'Stair kit, L with landing', unit: 'ea', price: 2600.0 },
  'door-dutch': { name: 'Dutch door', unit: 'ea', price: 980.0 },
  'door-glass-int': { name: 'Glass door', unit: 'ea', price: 540.0 },
  'flooring': { name: 'Flooring (per sq ft)', unit: 'sqft', price: 5.0 },
  'paint': { name: 'Interior paint (per gallon, ~350 sq ft)', unit: 'gal', price: 46.0 },
  'fasteners': { name: 'Nails, screws, hangers, adhesive (allowance per sq ft)', unit: 'sqft', price: 0.4 },
  'hurricane-tie': { name: 'Rafter / truss tie (H2.5)', unit: 'ea', price: 1.3 },
  'holddown': { name: 'Hold-down anchor (HDU)', unit: 'ea', price: 48.0 },
  'strap': { name: 'Coil strap (per 25 ft)', unit: 'ea', price: 26.0 },
  'blocking-2x10-8': { name: '2×10 × 8 ft blocking', unit: 'ea', price: 18.5 },
  'deck-sqft': { name: 'Deck framing + decking (per sq ft)', unit: 'sqft', price: 22.0 },
  'railing-ft': { name: 'Deck railing (per lineal ft)', unit: 'ft', price: 28.0 },
  'porch-sqft': { name: 'Covered porch roof + posts (per sq ft)', unit: 'sqft', price: 34.0 },
  'fence-ft': { name: 'Wood fence (per lineal ft)', unit: 'ft', price: 24.0 },
  'stovepipe-kit': { name: 'Class-A chimney kit (stove pipe, through-roof)', unit: 'ea', price: 1250.0 },
  'chimney-ft': { name: 'Masonry chimney (per vertical ft)', unit: 'ft', price: 210.0 },
  'vent-kit': { name: 'Wall / roof vent kit (hood, duct, flashing)', unit: 'ea', price: 85.0 },
  'solar-panel': { name: 'Solar panel 400 W (panel only)', unit: 'ea', price: 260.0 },
  'solar-bos': { name: 'Solar inverter, racking, wiring (allowance per panel)', unit: 'ea', price: 420.0 },
  'permit-allowance': { name: 'Permits, plan review & engineering (allowance)', unit: 'lot', price: 2500.0 },
};

export const PRICE_CATEGORIES = {
  site: 'Site work', foundation: 'Foundation', framing: 'Framing lumber', sheathing: 'Sheathing & wrap', roof: 'Roof',
  exterior: 'Exterior finish', openings: 'Doors & windows', insulation: 'Insulation', interior: 'Interior finish',
  hardware: 'Hardware & fasteners', structural: 'Hazard-zone extras', outdoor: 'Decks, porches & fences', systems: 'Vents, chimneys & solar', other: 'Allowances',
};

// Build phases — how a self-build is usually sequenced; the export groups the list this way.
export const PHASES = [
  { id: 'p1', name: 'Phase 1 · Land & pad', categories: ['site'] },
  { id: 'p2', name: 'Phase 2 · Foundation', categories: ['foundation'] },
  { id: 'p3', name: 'Phase 3 · Shell (frame, roof, close-in)', categories: ['framing', 'sheathing', 'roof', 'openings', 'exterior', 'hardware', 'structural'] },
  { id: 'p4', name: 'Phase 4 · Insulate & finish inside', categories: ['insulation', 'interior'] },
  { id: 'p5', name: 'Phase 5 · Outside living & systems', categories: ['outdoor', 'systems'] },
  { id: 'p0', name: 'Throughout', categories: ['other'] },
];

// Advanced settings expose these keys for manual pricing.
export const MANUAL_PRICE_KEYS = [
  'stud-2x4-8', 'stud-2x6-8', 'plate-2x6-16', 'osb-wall', 'osb-roof', 'drywall', 'concrete', 'siding', 'roofing',
  'window-single', 'door-ext', 'insul-wall', 'gravel', 'stone-veneer',
];

export const DISCLAIMER = 'Rough estimate of materials required. Confirm your designs with an engineer before building.';
