# ADR-0024: Separate observation clarity from cyberpunk atmosphere

## Context

The application repeated deployment facts such as observer mode and autonomous
software operation in the sidebar, top bar, Observatory header and evidence
footer. They consumed attention without helping a person read the city.

The old `dark`, `hacker` and `matrix` options were visual effects rather than a
real color-mode system. Light mode did not exist, while many non-Observatory
views used the same flat dark cards despite the project's cyberpunk identity.

## Decision

1. Remove redundant observer-mode, software-run and digital-twin badges from
   rendered UI. Safety and deployment boundaries remain in contracts and docs.
2. Support exactly two persistent color modes: accessible light and dark.
   Persisted `matrix` or `hacker` values migrate to dark.
3. Keep Human Observatory visually restrained and information-first.
4. Wrap every other view in a shared cyberpunk atmosphere: chromatic ambient
   gradients, grid, particles, scanlines, translucent panels and varied glow.
5. Theme semantic colors through CSS variables so existing domain states,
   tables and controls inherit both palettes without component forks.
6. Require desktop/mobile Playwright and WCAG A/AA checks in both modes.

## Consequences

- Theme switching changes presentation only and cannot mutate either world.
- Existing browser state remains compatible through store migration v4.
- The light palette remains recognizably cyberpunk without low-contrast neon
  text on white surfaces.
- Future pages receive both color modes and the atmosphere by default unless
  they explicitly use the Observatory surface.
