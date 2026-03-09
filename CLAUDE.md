# CITYSPROBLEM Website — Claude Rules

## Site
Three-file site — all changes must go in the correct file:
- `index.html` — HTML structure and content only. No `<style>` blocks, no inline `<script>` blocks.
- `styles.css` — All CSS. Linked via `<link rel="stylesheet" href="styles.css">` in `index.html`.
- `script.js` — All JavaScript. Loaded via `<script src="script.js">` at the bottom of `index.html`.

Backup at `index.backup.html`.

## Design rules
- All visible text elements on the site must scramble on cursor hover and resolve (left-to-right settle) on mouse-out. Every scramble must have a matching scrambleResolve call on mouseleave — no element should stop scrambling without settling back to its original text.
- Use the existing `scrambleLoop` / `scrambleResolve` functions and the `addScrambleHover(el)` helper for any new text elements added. When implementing custom (non-helper) scramble, store the return value of `scrambleResolve` in a cancel variable and cancel it on mouseenter to prevent a racing resolve+scramble conflict.
- New elements that contain user-visible static text should be passed to `addScrambleHover` in the "apply hover-scramble" block near the bottom of the script.
- Any time text appears on screen for the first time (page load, panel open, menu expand, etc.): start a `scrambleLoop` on it immediately when the animation/transition begins (element may be invisible at this point), then stop the loop and call `settleIn(text, setText, onComplete?)` when the animation ends. The text arrives on screen already scrambling and settles once it lands. For page-load elements trigger the settle from `animationend` ('fadeUp'); for panel elements use `setTimeout` of ~360 ms (the slide-in duration).
- Dynamic text elements (e.g. time displays, counters) are exempt — their hover scramble must capture the text at mouseenter time and resolve to that captured value.
- Scrambled text must never add characters beyond the original length — `scrambleLoop` already enforces this with 1:1 character replacement. Layout shifts are caused by extra characters, not by same-length width variation. Wrapping text elements can still be scrambled. Add `white-space: nowrap` to single-line elements (titles, labels, buttons) so proportional-font width variation across the glyph set doesn't cause unexpected line breaks.

## Info section
- Internal scrolling (`max-height: 70vh; overflow-y: auto` + matching scrollbar styles) is commented out in the CSS. Re-enable it once enough accordion items or content exist that the box actually overflows the viewport.
