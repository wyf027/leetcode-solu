import catalog from './style-catalog.json';

// Original catalog and preview images captured on 2026-10-15.
// Only generation is simulated; template IDs, order and layouts come from the source site.
export const demoStyles = catalog.items.filter((style) => style.id !== 'free_style');
export const freeStyle = catalog.items.find((style) => style.id === 'free_style');
