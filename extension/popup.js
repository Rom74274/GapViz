// Popup logic. V1 minimal — affiche juste l'état + lien vers Star Gap.

document.addEventListener('DOMContentLoaded', async () => {
  const statusText = document.getElementById('status-text');

  // Détecte si on est actuellement sur une page Ahrefs.
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url?.includes('app.ahrefs.com')) {
      statusText.textContent = 'Connecté à Ahrefs ✓';
    } else {
      statusText.textContent = 'Va sur Ahrefs pour importer';
    }
  } catch (e) {
    statusText.textContent = 'Prêt';
  }
});
