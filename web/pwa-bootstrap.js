"use strict";

const installButton = document.querySelector("#install-app-button");
const installStatus = document.querySelector("#install-status");
let deferredInstallPrompt = null;

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches
    || window.navigator.standalone === true;
}

function showInstallStatus(message) {
  installStatus.textContent = message;
  installStatus.hidden = false;
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = isInstalled();
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    return;
  }

  const prompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  installButton.disabled = true;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    showInstallStatus(
      choice.outcome === "accepted"
        ? "KoKo wordt geïnstalleerd."
        : "Installatie is geannuleerd.",
    );
    installButton.hidden = true;
  } catch (error) {
    console.error("KoKo installeren is mislukt.", error);
    showInstallStatus(`Installeren is mislukt: ${error.message}`);
  } finally {
    installButton.disabled = false;
  }
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  installButton.hidden = true;
  showInstallStatus("KoKo is geïnstalleerd.");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js", {
    updateViaCache: "none",
  })
    .then((registration) => registration.update())
    .catch((error) => {
      console.error("De KoKo-appbestanden konden niet worden bijgewerkt.", error);
    });
}
