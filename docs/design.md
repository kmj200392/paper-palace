# Paper Palace design

Paper Palace is a personal research room: original papers stay central, and navigation provides a calm frame around them. The existing PP monogram and green identity are retained.

## Visual system

- Porcelain `#f5f7f5`, white paper, deep ivy `#183c32`, dark ink `#20362e`, muted slate `#596b62`, and soft moss `#e5ede6`.
- DM Sans and Noto Sans KR for Korean headlines and interface text; DM Serif Display for the established wordmark and manuscript/graph names.
- A dark navigation rail, compact document rows, and a full-height PDF reader. Healthy saved state is quiet; pending saves and errors remain visible.
- The introduction demonstrates the product through an interactive paper map and a five-section reading example. These are explicitly labeled examples and never call AI or modify a library.

## Interaction

- A 140–200 ms response for press/hover, with 220–320 ms for small panel transitions.
- Reader tools stay mounted as before; a single selection indicator moves between summary, notes, and chat. Native dialogs retain focus trapping and Escape dismissal.
- No perpetual decorative animation. Reduced-motion preferences suppress movement.
- The graph retains directed edges, node placement, local zoom, and its in-page expanded mode. PDF resizing and the icon rail are preserved.

## References reviewed

These inform principles, rather than supply copied templates or assets.

| Reference                                    | Application                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| [Linear](https://linear.app/)                | Consistent navigation density and demonstrations that respond to a user action |
| [Readwise Reader](https://readwise.io/read/) | Original content first, contextual reading tools                               |
| [Are.na](https://www.are.na/)                | Content hierarchy and meaningful collection context                            |
| [Cosmos](https://www.cosmos.so/)             | Quiet chrome around a collection                                               |
| [Raindrop](https://raindrop.io/)             | Scannable library metadata                                                     |
| [Pentagram](https://www.pentagram.com/work)  | Brand consistency across surfaces                                              |
| [Rauno Craft](https://rauno.me/craft)        | Action-linked motion and focus reading                                         |

## Design guidance applied

- [Anthropic frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design): subject-specific composition, type hierarchy, restraint, visual critique.
- [Vercel web-design-guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines): focus visibility, semantic controls, keyboard operation, contrast, reduced motion, and responsive overflow.
- Sites presentation guidance: show a concrete product progression rather than repeat feature claims.

## Validation

Use the isolated local fixture for signed-in QA. Never mutate the personal GitHub library or call paid AI merely to inspect design. Verify desktop and mobile rendering, keyboard navigation, dialogs, graph expansion/zoom, reader panels, and chat. Re-run the production build, typecheck, and existing data/auth regression suite before release.
