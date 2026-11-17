# Product-led onboarding

The public introduction uses the palace interior as a full-bleed setting and
real product captures as the central demonstration. App authentication, libraries,
AI requests and the PDF reader are unchanged.

The entrance has one orchestrated arrival, a light sweep, gentle pointer response
and a perspective that straightens with scrolling. The product tour keeps one
screen in view while the story moves through graph, PDF reading and quoted chat.
Every scene can also be selected directly. Screen previews open a native modal
with keyboard navigation and Escape to close. Scrolling is never intercepted.

On narrower or short screens the pinned tour becomes an ordinary gallery.
Reduced-motion preferences remove perspective, parallax, animated transitions,
the pinned scroll length and automatic scene changes; all controls remain usable.

## Assets

`public/previews/graph.webp`, `reader.webp`, and `chat.webp` were captured from the
actual app on an isolated local fixture. They contain illustrative public-paper
examples, hand-prepared summary text and a local fixed chat reply. No private
library data or paid AI requests were used. Captions identify the example content.
The images are UI demonstrations, not evidence of a model quality evaluation.

The existing original palace background is reused. Captures are approximately
75 KB, 140 KB and 125 KB respectively. Other scenes load lazily; there is no
video player, WebGL runtime or animation dependency.

## References

- [Linear](https://linear.app/): product UI takes the foreground in the introduction.
- [Readwise Reader](https://readwise.io/read): reading and highlighting are explained with concrete screen examples.
- [mymind](https://mymind.com/): an immersive introduction to a personal knowledge space.

The palette and architecture remain specific to Paper Palace; no third-party
artwork, screenshots, testimonials or usage statistics are included.
