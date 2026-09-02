import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement matchMedia - ThemeProvider (and anything else
// checking prefers-color-scheme) needs a stand-in so it doesn't throw.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
