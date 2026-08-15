const hero = document.getElementById("hero");
const zzz = document.querySelector(".zzz");

const DRAG_THRESHOLD = 6;
let press = null;

function pointFromEvent(event) {
  return { screenX: event.screenX, screenY: event.screenY };
}

function playHoverMove() {
  if (hero.classList.contains("sleeping") || press) return;
  hero.classList.remove("flip", "fight");
  void hero.offsetWidth;
  const move = Math.random() < 0.5 ? "flip" : "fight";
  hero.classList.add(move);
  window.setTimeout(() => hero.classList.remove("flip", "fight"), 750);
}

hero.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  press = { ...pointFromEvent(event), dragged: false };
  window.batman.dragStart(pointFromEvent(event));
});

window.addEventListener("mousemove", (event) => {
  if (!press) return;
  const dx = event.screenX - press.screenX;
  const dy = event.screenY - press.screenY;
  if (Math.hypot(dx, dy) > DRAG_THRESHOLD) press.dragged = true;
  if (press.dragged) window.batman.dragMove(pointFromEvent(event));
});

window.addEventListener("mouseup", () => {
  if (!press) return;
  window.batman.dragEnd({ dragged: press.dragged });
  press = null;
});

hero.addEventListener("mouseenter", () => {
  window.batman.hover(true);
  playHoverMove();
});

hero.addEventListener("mouseleave", () => {
  if (!press) window.batman.hover(false);
});

window.batman.onPetState((state) => {
  hero.classList.toggle("left", state.facing < 0);
  hero.classList.toggle("paused", Boolean(state.paused));
  hero.classList.toggle("sleeping", Boolean(state.sleeping));
  zzz.hidden = !state.sleeping;
});
