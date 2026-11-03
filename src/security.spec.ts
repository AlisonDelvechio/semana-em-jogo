import { expect, it } from 'vitest'
import indexHtml from '../index.html?raw'
import netlifyToml from '../netlify.toml?raw'

// netlify.toml allows only scripts served by the site (script-src 'self'). An inline
// <script> in index.html would be blocked in production, e.g. the theme would flash.
it('keeps index.html free of inline scripts and handlers blocked by the CSP', () => {
  const scripts = [...indexHtml.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  expect(scripts.length).toBeGreaterThan(0)
  for (const [, attributes, body] of scripts) {
    expect(attributes).toMatch(/\bsrc=/)
    expect(body!.trim()).toBe('')
  }
  expect(indexHtml).not.toMatch(/\son[a-z]+=/i)
  expect(netlifyToml).toMatch(/Content-Security-Policy = "[^"]*script-src 'self';/)
  expect(netlifyToml).toMatch(/frame-ancestors 'none'/)
})
