// ================================================================
// ui-core.js - Shared date helpers and runtime accessors
// ================================================================

// Shell state lives in AxiomShellState and mutable UI runtime state lives in
// AxiomUIState. This file keeps only the date helpers that many classic
// scripts still consume directly.

const toKey = (d) => d.toISOString().split('T')[0];
const today = () => toKey(new Date());

function appDateLocale() {
  return globalThis.AxiomText?.locale() || 'en-US';
}

const formatDate = (d) => new Date(d).toLocaleDateString(appDateLocale(), {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
});

function getAppMeta() {
  return globalThis.APP_META || {
    NAME: 'axiomOS',
    VERSION: '2.2.2',
    DEFAULT_TAGLINE: 'Private habit + focus',
    DESCRIPTION: 'Private habit and focus PWA. No signup, works offline, and helps you build daily momentum in seconds.',
  };
}

function applyAppMeta(doc = document) {
  if (!doc) return;
  const meta = getAppMeta();

  doc.querySelectorAll?.('[data-app-name]').forEach((node) => {
    node.textContent = meta.NAME;
  });
  doc.querySelectorAll?.('[data-app-version]').forEach((node) => {
    node.textContent = meta.VERSION;
  });

  const appNameMeta = doc.querySelector?.('meta[name="application-name"]');
  if (appNameMeta) appNameMeta.setAttribute('content', meta.NAME);

  if ((location.pathname || '').includes('/demo/')) return;

  const descriptionMeta = doc.querySelector?.('meta[name="description"]');
  if (descriptionMeta) descriptionMeta.setAttribute('content', `${meta.NAME} - ${meta.DESCRIPTION}`);

  const taglineNode = doc.getElementById?.('logo-tagline-text');
  const tagline = taglineNode?.textContent?.trim?.() || meta.DEFAULT_TAGLINE;
  doc.title = `${meta.NAME} - ${tagline} PWA v${meta.VERSION}`;
}
