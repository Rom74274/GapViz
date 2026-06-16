// Popup — affiche l'état + détecte sur quel provider l'user est.

const PROVIDERS = [
  { match: 'app.ahrefs.com', label: 'Ahrefs' },
  { match: 'semrush.com', label: 'Semrush' },
  { match: 'seranking.com', label: 'SE Ranking' },
];

function detectProvider(url) {
  if (!url) return null;
  for (const p of PROVIDERS) {
    if (url.includes(p.match)) return p.label;
  }
  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
  const statusText = document.getElementById('status-text');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const provider = detectProvider(tab?.url);
    if (provider) {
      statusText.textContent = `Connecté à ${provider} ✓`;
    } else {
      statusText.textContent = 'Va sur Ahrefs, Semrush ou SE Ranking';
    }
  } catch (e) {
    statusText.textContent = 'Prêt';
  }
});
