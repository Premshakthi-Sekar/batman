const beam = document.getElementById("beam");
const params = new URLSearchParams(window.location.search);
const fromX = Number(params.get("fromX") || 0);
const fromY = Number(params.get("fromY") || 0);
const length = Number(params.get("length") || 0);
const angle = Number(params.get("angle") || 0);

beam.style.left = `${fromX}px`;
beam.style.top = `${fromY - 1.5}px`;
beam.style.setProperty("--beam-length", `${Math.max(0, length)}px`);
beam.style.transform = `rotate(${angle}rad)`;
requestAnimationFrame(() => beam.classList.add("fire"));
