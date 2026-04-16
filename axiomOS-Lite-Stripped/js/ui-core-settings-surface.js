// ================================================================
// ui-core-settings-surface.js - settings guide and PWA diagnostics
// Depends on globals provided by ui-core-settings.js and init.js.
// ================================================================

(function attachSettingsSurface(globalScope) {
  function renderLiteUpgradeBox() {
    const host = document.getElementById('lite-upgrade-box');
    if (!host) return;

    host.replaceChildren();

    const lite = globalScope.AxiomLite?.enabled ? globalScope.AxiomLite : null;
    const upgradeUrl = lite?.getUpgradeUrl?.() || '';
    if (!lite || !upgradeUrl) {
      host.className = 'hidden';
      return;
    }

    const lang = globalScope.db?.settings?.lang || globalScope.I18n?.lang || 'en';
    const strings = lang === 'it'
      ? {
          title: 'Sblocca la versione completa',
          body: 'Apri la versione completa su Gumroad per moduli avanzati, import, backup e personalizzazione completa.',
          cta: 'Vai al full',
          done: 'Apertura Gumroad...',
        }
      : {
          title: 'Unlock the full version',
          body: 'Open the full version on Gumroad for advanced modules, import, backup, and full customization.',
          cta: 'View full version',
          done: 'Opening Gumroad...',
        };

    host.className = 'settings-pwa-strip settings-upgrade-strip is-ok mb3';

    const shell = document.createElement('div');
    shell.className = 'settings-pwa-strip-main';

    const icon = document.createElement('div');
    icon.className = 'settings-pwa-strip-icon';
    icon.textContent = '⭐';

    const copyWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'settings-pwa-strip-title';
    title.textContent = strings.title;

    const body = document.createElement('div');
    body.className = 'settings-pwa-strip-body';
    body.textContent = strings.body;

    copyWrap.appendChild(title);
    copyWrap.appendChild(body);
    shell.appendChild(icon);
    shell.appendChild(copyWrap);
    host.appendChild(shell);

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'btn btn-primary btn-xs';
    cta.textContent = strings.cta;
    cta.addEventListener('click', () => {
      const opened = lite.openUpgradeUrl?.();
      if (opened) notify?.(strings.done, '⭐', 'info');
    });
    host.appendChild(cta);
  }

  function renderSettingsGuide() {
    const host = document.getElementById('settings-feature-guide');
    if (!host) return;

    host.replaceChildren();

    function createGroup(titleKey, titleFallback) {
      const group = document.createElement('div');
      group.className = 'settings-guide-group';

      const head = document.createElement('div');
      head.className = 'settings-guide-group-head';

      const title = document.createElement('div');
      title.className = 'settings-guide-group-title';
      title.textContent = _settingsText(titleKey, titleFallback);

      head.appendChild(title);

      const list = document.createElement('div');
      list.className = 'settings-guide-chip-grid';

      group.appendChild(head);
      group.appendChild(list);
      return { group, list };
    }

    function createGuideItem({ icon, title }) {
      const item = document.createElement('div');
      item.className = 'settings-guide-chip';

      const main = document.createElement('div');
      main.className = 'settings-guide-chip-main';

      const iconEl = document.createElement('span');
      iconEl.className = 'settings-guide-chip-icon';
      iconEl.textContent = icon;

      const titleEl = document.createElement('div');
      titleEl.className = 'settings-guide-chip-name';
      titleEl.textContent = title;

      main.appendChild(iconEl);
      main.appendChild(titleEl);
      item.appendChild(main);

      return item;
    }

    const accessoryModules = _getModuleRegistry().MODULE_DEF;

    const core = createGroup('settings_guide_core', 'Core functions');
    SETTINGS_GUIDE_CORE_ITEMS.forEach((item) => {
      core.list.appendChild(createGuideItem({
        icon: item.icon,
        title: _settingsText(item.labelKey, item.fallbackLabel),
      }));
    });

    const accessory = createGroup('settings_guide_accessory', 'Accessory functions');
    accessoryModules.forEach((moduleDef) => {
      accessory.list.appendChild(createGuideItem({
        icon: moduleDef.icon,
        title: _settingsText(moduleDef.labelKey, moduleDef.sec),
      }));
    });

    host.appendChild(core.group);
    host.appendChild(accessory.group);
  }

  function renderPwaInstallBox() {
    const host = document.getElementById('pwa-install-box');
    if (!host) return;

    host.replaceChildren();

    const pwaApi = globalScope.AxiomPWA || null;
    const state = pwaApi?.getState?.() || {
      protocol: (typeof location !== 'undefined' && location?.protocol) || '',
      installed: false,
      serviceWorkerSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
      canPromptInstall: false,
      canInstallFromContext: typeof location !== 'undefined' && location?.protocol !== 'file:' && typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    };

    let titleKey = 'settings_pwa_browser_title';
    let titleFallback = 'Use the browser install menu';
    let bodyKey = 'settings_pwa_browser_body';
    let bodyFallback = 'Install is not available right now. In Chrome or Edge, use the browser menu and choose Install app.';
    let tone = 'warn';
    let showInstallButton = false;

    if (state.installed) {
      titleKey = 'settings_pwa_installed_title';
      titleFallback = 'Already installed';
      bodyKey = 'settings_pwa_installed_body';
      bodyFallback = 'axiomOS is already running as an installed app on this device.';
      tone = 'ok';
    } else if (!state.serviceWorkerSupported) {
      titleKey = 'settings_pwa_unsupported_title';
      titleFallback = 'PWA install not supported here';
      bodyKey = 'settings_pwa_unsupported_body';
      bodyFallback = 'This browser context cannot register the service worker needed for install and offline support.';
    } else if (state.entrypointKind && state.entrypointKind !== 'app') {
      titleKey = 'settings_pwa_entrypoint_title';
      titleFallback = 'Open the main app to install';
      bodyKey = 'settings_pwa_entrypoint_body';
      bodyFallback = 'This page is a demo or brochure surface. Open index.html, or use Start-axiomOS.cmd / Install-axiomOS.cmd, if you want the installable local app.';
    } else if (state.protocol === 'file:') {
      titleKey = 'settings_pwa_localhost_title';
      titleFallback = 'Web install unavailable from local file';
      bodyKey = 'settings_pwa_localhost_body';
      bodyFallback = 'Run Start-axiomOS.cmd or Install-axiomOS.cmd to open axiomOS on local localhost. That gives you the correct origin for install and service worker support.';
    } else if (state.canPromptInstall) {
      titleKey = 'settings_pwa_ready_title';
      titleFallback = 'Ready to install';
      bodyKey = 'settings_pwa_ready_body';
      bodyFallback = 'This browser can install axiomOS as a desktop app and keep the shell available offline.';
      tone = 'ok';
      showInstallButton = true;
    }

    host.className = `settings-pwa-strip mb3${tone === 'ok' ? ' is-ok' : ''}`;

    const shell = document.createElement('div');
    shell.className = 'settings-pwa-strip-main';

    const icon = document.createElement('div');
    icon.className = 'settings-pwa-strip-icon';
    icon.textContent = tone === 'ok' ? '📲' : '⚙';

    const copyWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'settings-pwa-strip-title';
    title.textContent = _settingsText(titleKey, titleFallback);

    const body = document.createElement('div');
    body.className = 'settings-pwa-strip-body';
    body.textContent = _settingsText(bodyKey, bodyFallback);

    copyWrap.appendChild(title);
    copyWrap.appendChild(body);
    shell.appendChild(icon);
    shell.appendChild(copyWrap);
    host.appendChild(shell);

    if (!state.installed) {
      const hints = document.createElement('div');
      hints.className = 'settings-pwa-hints';

      const localHint = document.createElement('div');
      localHint.className = 'settings-pwa-hint';
      const localHintTitle = document.createElement('div');
      localHintTitle.className = 'settings-pwa-hint-title';
      localHintTitle.textContent = _settingsText('settings_pwa_hint_local_title', 'Use it as a local app');
      const localHintBody = document.createElement('div');
      localHintBody.className = 'settings-pwa-hint-body';
      localHintBody.textContent = _settingsText('settings_pwa_hint_local_body', 'Double-click Start-axiomOS.cmd');
      localHint.appendChild(localHintTitle);
      localHint.appendChild(localHintBody);

      const installHint = document.createElement('div');
      installHint.className = 'settings-pwa-hint';
      const installHintTitle = document.createElement('div');
      installHintTitle.className = 'settings-pwa-hint-title';
      installHintTitle.textContent = _settingsText('settings_pwa_hint_install_title', 'Install it from the browser');
      const installHintBody = document.createElement('div');
      installHintBody.className = 'settings-pwa-hint-body';
      installHintBody.textContent = _settingsText('settings_pwa_hint_install_body', 'Double-click Install-axiomOS.cmd, then use Install app on index.html.');
      installHint.appendChild(installHintTitle);
      installHint.appendChild(installHintBody);

      hints.appendChild(localHint);
      hints.appendChild(installHint);
      host.appendChild(hints);
    }

    if (!showInstallButton) return;

    const installBtn = document.createElement('button');
    installBtn.type = 'button';
    installBtn.className = 'btn btn-primary btn-xs';
    installBtn.textContent = _settingsText('settings_pwa_install_cta', 'Install app');
    installBtn.addEventListener('click', async () => {
      try {
        const result = await pwaApi.promptInstall();
        const key = result?.outcome === 'accepted'
          ? 'settings_pwa_install_done'
          : result?.outcome === 'dismissed'
            ? 'settings_pwa_install_dismissed'
            : 'settings_pwa_install_unavailable';
        const fallback = result?.outcome === 'accepted'
          ? 'Installation prompt opened.'
          : result?.outcome === 'dismissed'
            ? 'Installation dismissed.'
            : 'Installation is not available right now.';
        notify?.(_settingsText(key, fallback), '📲', 'info');
      } catch (err) {
        console.warn('[PWA] install prompt failed:', err);
        notify?.(_settingsText('settings_pwa_install_unavailable', 'Installation is not available right now.'), '📲', 'info');
      } finally {
        renderPwaInstallBox();
      }
    });
    host.appendChild(installBtn);
  }

  globalScope.AxiomSettingsSurface = {
    renderSettingsGuide,
    renderLiteUpgradeBox,
    renderPwaInstallBox,
  };
})(globalThis);
