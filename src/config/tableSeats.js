// Seat layout for the ordinary 9-max Texas table.
// Coords come straight from gameTable.fire (scene design space, origin = center, y up).
// See docs/10 §5.9.2. seatNode preloads 10 static seats; 9-max hides seat9 (top-center).
// Order below = ring order around the table (index 0 = bottom / Hero), which the
// sit-down carousel (sitdownWithAni) walks one slot at a time.
// NOTE: a few seats were fine-tuned with the user (top pair raised, Hero lowered,
// side columns widened/spread) on 2026-06-28.
export const SEAT_POSITIONS = [
  { id: 0, x: 0, y: -732 }, // bottom center (Hero)
  { id: 1, x: -446, y: -198 }, // left-low
  { id: 2, x: -446, y: 198 }, // left-mid
  { id: 3, x: -446, y: 594 }, // left-high
  { id: 4, x: -126, y: 817 }, // top-left
  { id: 5, x: 126, y: 817 }, // top-right
  { id: 6, x: 446, y: 594 }, // right-high
  { id: 7, x: 446, y: 198 }, // right-mid
  { id: 8, x: 446, y: -198 }, // right-low
  // seat9 { x:0, y:817 } top-center hidden on 9-max
]

// scene (x up-y) -> CSS node vars. Screen y is flipped.
export const toCx = (x) => x
export const toCy = (y) => -y
