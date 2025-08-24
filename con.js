import * as OS from "/dist/index.js";
import * as Distro from "/dist/distro.js";
window.OS = OS;
const os = (window.os = await Distro.connect("sw:///"));
addEventListener("keydown", (evt) => {
  if (evt.altKey && evt.key.toLowerCase() === "escape") {
    console.log("Caught Alt+Escape, send escape event to root window");
    window.parent?.postMessage({ type: "topFocus" }, "*");
    evt.preventDefault();
  }
});
document.body.style.margin = "0";
document.body.style.height = "100vh";
document.body.style.width = "100vw";

const compositorButton = document.createElement("button");
compositorButton.style.position = "absolute";
compositorButton.style.top = "10px";
compositorButton.style.left = "10px";

document.body.appendChild(compositorButton);

const params = new URLSearchParams(location.search);

compositorButton.textContent = "Launch Compsitor";
compositorButton.addEventListener("click", async () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const compositor = await os.api["me.endercass.compositor"];
  await compositor.join(
    root,
    params.get("name") + "@" + params.get("display"),
    params.get("idx") || 0,
    params.get("idy") || 0,
  );
  compositorButton.remove();

  await compositor.create({
    title: "Mercury Workshop",
    namespace: params.get("name") + "@" + params.get("display"),

    content: {
      type: "iframe",
      src: "https://mercurywork.shop/",
    },
  });
});
