# MCP server marks

Copied 2026-11-04 from the approved draft's `.doan/assets/mcp-logos/` for the preset MCP servers in Settings > MCP Connectors; the notes below are that directory's. Retrieved 2026-11-04 from official sources. These local assets were draft references; inclusion is not a claim of trademark ownership or endorsement. App packaging and brand-use requirements remain implementation work.

- `notion.png`: https://www.notion.com/front-static/logo-ios.png — the app icon linked by notion.com (`apple-touch-icon`), 512 × 512.
- `atlassian.svg`: the Atlassian icon path from Atlassian's own logo package `@atlaskit/logo` 23.3.1 (https://registry.npmjs.org/@atlaskit/logo/-/logo-23.3.1.tgz, `dist/esm/legacy-logos/atlassian/icon.js`; Apache-2.0, repository https://bitbucket.org/atlassian/atlassian-frontend-mirror), filled with that package's light-mode `brand` icon colour `#1868DB` (`legacy-logos/get-colors-from-appearance.js`). It matches the mark on https://www.atlassian.com/favicon.ico.
- `figma.svg`: https://static.figma.com/app/icon/1/favicon.svg

Processed 2026-11-04 so every mark is a bare glyph on a transparent background, cropped to its own bounds, for a uniform 24px glyph box in a 32px slot: `notion.png` makes the white outside the cube transparent (flood fill from the corners; the cube's own white faces stay), crops to the cube and scales to 64px on its long side; `atlassian.svg` keeps the single path and crops the viewBox to it; `figma.svg` drops the 16 × 16 mask and its `xlink:href` uses (each shape is written out as its own path with the same transform and fill) and crops the viewBox to the five shapes. The originals are the URLs above.

SVG assets are stored without scripts or external resource references. Server names remain visible beside decorative marks.
