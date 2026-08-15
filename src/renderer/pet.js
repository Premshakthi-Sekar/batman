const hero = document.getElementById("hero");
const zzz = document.querySelector(".zzz");

hero.addEventListener("click", () => {
  window.batman.petClicked();
});

window.batman.onPetState((state) => {
  hero.classList.toggle("left", state.facing < 0);
  hero.classList.toggle("paused", Boolean(state.paused));
  hero.classList.toggle("sleeping", Boolean(state.sleeping));
  zzz.hidden = !state.sleeping;
});
