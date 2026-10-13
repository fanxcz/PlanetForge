(() => {
  const workspace = document.querySelector(".workspace");
  const nav = document.getElementById("mobileNav");
  if (!workspace || !nav) return;
  const buttons = Array.from(nav.querySelectorAll("[data-mobile-view]"));
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.mobileView;
      if (!view) return;
      workspace.dataset.mobileView = view;
      buttons.forEach((item) => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      if (window.matchMedia("(max-width: 680px)").matches) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });
})();
