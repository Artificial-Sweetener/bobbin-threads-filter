const { SettingsSchema } = require('../../src/storage/settings-schema');
const packageManifest = require('../../package.json');
const {
  ThreadsSettingsMenu,
  joinCommaSeparatedList,
  splitCommaSeparatedList,
} = require('../../src/ui/settings-menu');

function createNormalizedSettings(overrides = {}) {
  const schema = new SettingsSchema();
  return schema.normalize(overrides);
}

function flushAsyncQueue() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function waitMs(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function clickByAction(action) {
  const element = document.querySelector(`[data-btf-action="${action}"]`);
  if (!element) {
    throw new Error(`Action element not found: ${action}`);
  }

  element.click();
}

function isActionSetHidden(elementId) {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Action set not found: ${elementId}`);
  }

  return element.getAttribute('aria-hidden') === 'true';
}

describe('ThreadsSettingsMenu', () => {
  afterEach(() => {
    document.body.className = '';
    document.body.innerHTML = '';
    const styleElement = document.getElementById('btf-settings-modal-style');
    if (styleElement && styleElement.parentElement) {
      styleElement.parentElement.removeChild(styleElement);
    }
  });

  test('normalizes comma-separated helpers predictably', () => {
    expect(splitCommaSeparatedList('alpha, beta\nbeta, ,gamma')).toEqual([
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(joinCommaSeparatedList(['alpha', 'beta', '', null])).toBe('alpha, beta');
  });

  test('hydrates chips from persisted settings on open', async () => {
    const settings = createNormalizedSettings({
      filters: {
        verified: {
          enabled: false,
          hideBadges: true,
          whitelistHandles: ['trusted_creator', '@newsroom'],
        },
        aiLabel: {
          enabled: true,
        },
        suggestedFollow: {
          enabled: true,
        },
        trending: {
          enabled: true,
          hideAll: false,
          blockedTopics: ['daily deals', 'local events'],
          notInterested: {
            enabledTopics: ['daily deals'],
          },
        },
        phrase: {
          entries: [
            { pattern: 'ai\\s+slop', isRegex: true },
            { pattern: 'sponsored', isRegex: false },
          ],
          notInterested: {
            enabledEntries: [{ pattern: 'ai\\s+slop', isRegex: true }],
          },
        },
        username: {
          blockedHandles: ['@noisy_account', 'ads_bot'],
          notInterested: {
            enabledHandles: ['noisy_account'],
          },
        },
      },
    });
    const settingsStore = {
      load: jest.fn().mockResolvedValue(settings),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    expect(document.getElementById('btf-settings-verified-enabled').checked).toBe(false);
    expect(document.getElementById('btf-settings-verified-badge-enabled').checked).toBe(true);
    expect(document.getElementById('btf-settings-ai-label-enabled').checked).toBe(true);
    expect(document.getElementById('btf-settings-suggested-follow-enabled').checked).toBe(true);
    expect(document.getElementById('btf-settings-trending-hide-all-enabled').checked).toBe(false);
    const verifiedWhitelistChips = Array.from(
      document.querySelectorAll('[data-btf-action="verified-whitelist-chip"]')
    ).map((element) => element.textContent);
    expect(verifiedWhitelistChips).toEqual(['@trusted_creator', '@newsroom']);
    const trendingTopicChips = Array.from(
      document.querySelectorAll('[data-btf-action="trending-topic-chip"]')
    );
    expect(trendingTopicChips).toHaveLength(2);
    expect(trendingTopicChips[0].textContent).toContain('daily deals');
    expect(trendingTopicChips[0].textContent).toContain('NI');
    expect(trendingTopicChips[1].textContent).toContain('local events');
    expect(trendingTopicChips[1].textContent).not.toContain('NI');
    const phraseChips = Array.from(document.querySelectorAll('[data-btf-action="phrase-chip"]'));
    expect(phraseChips).toHaveLength(2);
    expect(phraseChips[0].textContent).toContain('ai\\s+slop');
    expect(phraseChips[0].textContent).toContain('Regex');
    expect(phraseChips[0].textContent).toContain('NI');
    expect(phraseChips[1].textContent).toContain('sponsored');
    const userChips = Array.from(document.querySelectorAll('[data-btf-action="user-chip"]'));
    expect(userChips).toHaveLength(2);
    expect(userChips[0].textContent).toContain('@noisy_account');
    expect(userChips[0].textContent).toContain('NI');
    expect(userChips[1].textContent).toContain('@ads_bot');
    expect(isActionSetHidden('btf-settings-clean-actions')).toBe(false);
    expect(isActionSetHidden('btf-settings-dirty-actions')).toBe(true);

    menu.destroy();
  });

  test('does not autofocus the first toggle when menu opens', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const verifiedToggle = document.getElementById('btf-settings-verified-enabled');
    expect(document.activeElement).not.toBe(verifiedToggle);

    menu.destroy();
  });

  test('renders versioned menu title from package manifest', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    expect(document.getElementById('btf-settings-title').textContent).toBe(
      `Bobbin v${packageManifest.version}`
    );
    expect(document.querySelector('.btf-settings-subtitle')).toBeNull();
    expect(document.getElementById('btf-settings-about-trigger')).not.toBeNull();

    menu.destroy();
  });

  test('opens About modal with expected maintainer copy and links', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    clickByAction('open-about');

    const aboutModal = document.getElementById('btf-settings-about-modal');
    expect(aboutModal.hidden).toBe(false);
    expect(aboutModal.textContent).toContain(
      'I hope this script helps you get more of what you want out of Threads.'
    );
    expect(aboutModal.textContent).toContain('If it helps, a star on GitHub would mean a lot.');
    expect(aboutModal.textContent).toContain(
      'Come say hi to me on Threads - I share my art, poetry, and dev updates over there.'
    );
    expect(aboutModal.textContent).toContain(
      "If you want to see what I'm up to around the web, my website is the best place to start."
    );
    expect(aboutModal.textContent).toContain(
      'Want more control over your other feeds? I maintain Facebook Clean My Feeds, too.'
    );

    const aboutLinks = Array.from(aboutModal.querySelectorAll('.btf-about-copy-line a')).map(
      (element) => element.href
    );
    expect(aboutLinks).toEqual(
      expect.arrayContaining([
        expect.stringContaining('github.com/Artificial-Sweetener/bobbin-threads-filter'),
        expect.stringContaining('threads.net/@artificialsweetener.ai'),
        expect.stringContaining('artificialsweetener.ai'),
        expect.stringContaining('github.com/Artificial-Sweetener/facebook-clean-my-feeds'),
      ])
    );

    clickByAction('close-about');
    expect(aboutModal.hidden).toBe(true);

    menu.destroy();
  });

  test('closes About modal on Escape before closing settings root', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-about');

    const rootElement = document.getElementById('btf-settings-modal-root');
    const aboutModal = document.getElementById('btf-settings-about-modal');
    expect(rootElement.hidden).toBe(false);
    expect(aboutModal.hidden).toBe(false);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(aboutModal.hidden).toBe(true);
    expect(rootElement.hidden).toBe(false);

    menu.destroy();
  });

  test('emits visibility callbacks while opening and closing', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const onVisibilityChanged = jest.fn();
    const menu = new ThreadsSettingsMenu({ settingsStore, onVisibilityChanged });

    await menu.open();
    expect(onVisibilityChanged).toHaveBeenNthCalledWith(1, true);

    menu.close();
    expect(onVisibilityChanged).toHaveBeenNthCalledWith(2, false);

    menu.destroy();
  });

  test('re-applies theme tokens when host appearance changes while open', async () => {
    document.documentElement.classList.add('__fb-dark-mode');
    document.body.style.backgroundColor = 'rgb(16, 16, 16)';
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const rootElement = document.getElementById('btf-settings-modal-root');
    expect(rootElement.getAttribute('data-theme')).toBe('dark');

    document.body.style.backgroundColor = 'rgb(255, 255, 255)';
    document.documentElement.classList.remove('__fb-dark-mode');
    await flushAsyncQueue();
    await flushAsyncQueue();
    expect(rootElement.getAttribute('data-theme')).toBe('light');

    document.body.style.backgroundColor = 'rgb(16, 16, 16)';
    document.documentElement.classList.add('__fb-dark-mode');
    await flushAsyncQueue();
    await flushAsyncQueue();
    expect(rootElement.getAttribute('data-theme')).toBe('dark');

    menu.destroy();
  });

  test('edits phrase entry from chip click through editor modal', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(
        createNormalizedSettings({
          filters: {
            phrase: {
              entries: [{ pattern: 'old phrase', isRegex: false }],
            },
          },
        })
      ),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    clickByAction('phrase-chip');
    const editorModal = document.getElementById('btf-settings-editor-modal');
    const editorInput = document.getElementById('btf-settings-editor-input');
    const editorRegexToggle = document.getElementById('btf-settings-editor-regex-toggle');
    const editorNotInterestedToggle = document.getElementById(
      'btf-settings-editor-not-interested-toggle'
    );
    const editorForm = document.getElementById('btf-settings-editor-form');

    expect(editorModal.hidden).toBe(false);
    expect(editorInput.value).toBe('old phrase');
    editorInput.value = 'new\\s+phrase';
    editorRegexToggle.checked = true;
    editorNotInterestedToggle.checked = true;
    editorForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const phraseChip = document.querySelector('[data-btf-action="phrase-chip"]');
    expect(phraseChip.textContent).toContain('new\\s+phrase');
    expect(phraseChip.textContent).toContain('Regex');
    expect(phraseChip.textContent).toContain('NI');
    expect(document.getElementById('btf-settings-status').textContent).toBe(
      'Phrase filters updated. Save & Close to apply.'
    );
    expect(isActionSetHidden('btf-settings-clean-actions')).toBe(true);
    expect(isActionSetHidden('btf-settings-dirty-actions')).toBe(false);

    menu.destroy();
  });

  test('removes username chip through confirmation modal', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(
        createNormalizedSettings({
          filters: {
            username: {
              blockedHandles: ['alpha', 'beta'],
            },
          },
        })
      ),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const firstUserChip = document.querySelector('[data-btf-action="user-chip"]');
    firstUserChip.click();
    const confirmModal = document.getElementById('btf-settings-confirm-modal');
    expect(confirmModal.hidden).toBe(false);
    expect(document.getElementById('btf-settings-confirm-message').textContent).toContain('@alpha');

    clickByAction('confirm-accept');
    const remainingUsers = Array.from(
      document.querySelectorAll('[data-btf-action="user-chip"]')
    ).map((element) => element.textContent);
    expect(remainingUsers).toEqual(['@beta']);
    expect(document.getElementById('btf-settings-status').textContent).toBe(
      'Username filter removed. Save & Close to apply.'
    );
    expect(isActionSetHidden('btf-settings-clean-actions')).toBe(true);
    expect(isActionSetHidden('btf-settings-dirty-actions')).toBe(false);

    menu.destroy();
  });

  test('removes verified-whitelist chip through confirmation modal', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(
        createNormalizedSettings({
          filters: {
            verified: {
              whitelistHandles: ['trusted_creator', 'newsroom'],
            },
          },
        })
      ),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const firstVerifiedWhitelistChip = document.querySelector(
      '[data-btf-action="verified-whitelist-chip"]'
    );
    firstVerifiedWhitelistChip.click();
    const confirmModal = document.getElementById('btf-settings-confirm-modal');
    expect(confirmModal.hidden).toBe(false);
    expect(document.getElementById('btf-settings-confirm-message').textContent).toContain(
      '@trusted_creator'
    );

    clickByAction('confirm-accept');
    const remainingHandles = Array.from(
      document.querySelectorAll('[data-btf-action="verified-whitelist-chip"]')
    ).map((element) => element.textContent);
    expect(remainingHandles).toEqual(['@newsroom']);
    expect(document.getElementById('btf-settings-status').textContent).toBe(
      'Verified whitelist handle removed. Save & Close to apply.'
    );
    expect(isActionSetHidden('btf-settings-clean-actions')).toBe(true);
    expect(isActionSetHidden('btf-settings-dirty-actions')).toBe(false);

    menu.destroy();
  });

  test('adds and removes trending-topic chips through editor and confirmation modal', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(
        createNormalizedSettings({
          filters: {
            trending: {
              enabled: true,
              hideAll: false,
              blockedTopics: ['daily deals'],
            },
          },
        })
      ),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    clickByAction('open-trending-topic-editor');
    const editorInput = document.getElementById('btf-settings-editor-input');
    const notInterestedToggle = document.getElementById(
      'btf-settings-editor-not-interested-toggle'
    );
    const editorForm = document.getElementById('btf-settings-editor-form');
    editorInput.value = 'local events';
    notInterestedToggle.checked = true;
    notInterestedToggle.dispatchEvent(new Event('change', { bubbles: true }));
    editorForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    let topicChips = Array.from(
      document.querySelectorAll('[data-btf-action="trending-topic-chip"]')
    );
    expect(topicChips).toHaveLength(2);
    expect(topicChips[0].textContent).toContain('daily deals');
    expect(topicChips[1].textContent).toContain('local events');
    expect(topicChips[1].textContent).toContain('NI');

    const peteChip = Array.from(
      document.querySelectorAll('[data-btf-action="trending-topic-chip"]')
    ).find((element) => element.textContent.includes('local events'));
    expect(peteChip).toBeTruthy();
    peteChip.click();
    clickByAction('confirm-accept');

    topicChips = Array.from(document.querySelectorAll('[data-btf-action="trending-topic-chip"]'));
    expect(topicChips).toHaveLength(1);
    expect(topicChips[0].textContent).toContain('daily deals');
    expect(topicChips[0].textContent).not.toContain('NI');
    expect(document.getElementById('btf-settings-status').textContent).toBe(
      'Trending topic filter removed. Save & Close to apply.'
    );

    menu.destroy();
  });

  test('removes trending topic not-interested toggle when topic chip is removed', async () => {
    const schema = new SettingsSchema();
    const settingsStore = {
      load: jest.fn().mockResolvedValue(
        createNormalizedSettings({
          filters: {
            trending: {
              enabled: true,
              hideAll: false,
              blockedTopics: ['daily deals', 'local events'],
              notInterested: {
                enabledTopics: ['daily deals', 'local events'],
              },
            },
          },
        })
      ),
      save: jest.fn().mockImplementation(async (candidate) => schema.normalize(candidate)),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const peteChip = Array.from(
      document.querySelectorAll('[data-btf-action="trending-topic-chip"]')
    ).find((element) => element.textContent.includes('local events'));
    expect(peteChip).toBeTruthy();
    peteChip.click();
    clickByAction('confirm-accept');
    clickByAction('save-close');
    await flushAsyncQueue();

    expect(settingsStore.save).toHaveBeenCalledTimes(1);
    const submittedSettings = settingsStore.save.mock.calls[0][0];
    expect(submittedSettings.filters.trending.blockedTopics).toEqual(['daily deals']);
    expect(submittedSettings.filters.trending.notInterested.enabledTopics).toEqual(['daily deals']);

    menu.destroy();
  });

  test('inserts account-search suggestion into username editor input', async () => {
    const accountSearchClient = {
      searchMentionCandidates: jest.fn().mockResolvedValue([
        {
          handle: 'ameniwa_',
          displayName: 'Ameniwa',
          isVerified: false,
          profilePictureUrl: '',
        },
      ]),
    };
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore, accountSearchClient });

    await menu.open();
    clickByAction('open-user-editor');

    const editorInput = document.getElementById('btf-settings-editor-input');
    const editorForm = document.getElementById('btf-settings-editor-form');
    editorInput.value = '@am';
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitMs(220);
    await flushAsyncQueue();

    expect(accountSearchClient.searchMentionCandidates).toHaveBeenCalledWith('am');
    const suggestionButton = document.querySelector(
      '[data-btf-action="editor-suggestion-pick"][data-suggestion-index="0"]'
    );
    expect(suggestionButton).not.toBeNull();

    suggestionButton.click();
    expect(editorInput.value).toBe('@ameniwa_, ');

    editorForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const userChips = Array.from(document.querySelectorAll('[data-btf-action="user-chip"]')).map(
      (element) => element.textContent
    );
    expect(userChips).toEqual(['@ameniwa_']);
    expect(document.getElementById('btf-settings-status').textContent).toBe(
      'Username filters updated. Save & Close to apply.'
    );

    menu.destroy();
  });

  test('inserts account-search suggestion into verified-whitelist editor input', async () => {
    const accountSearchClient = {
      searchMentionCandidates: jest.fn().mockResolvedValue([
        {
          handle: 'trusted_creator',
          displayName: 'Trusted Creator',
          isVerified: true,
          profilePictureUrl: '',
        },
      ]),
    };
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore, accountSearchClient });

    await menu.open();
    clickByAction('open-verified-whitelist-editor');

    const editorInput = document.getElementById('btf-settings-editor-input');
    const editorForm = document.getElementById('btf-settings-editor-form');
    editorInput.value = '@tr';
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitMs(220);
    await flushAsyncQueue();

    expect(accountSearchClient.searchMentionCandidates).toHaveBeenCalledWith('tr');
    const suggestionButton = document.querySelector(
      '[data-btf-action="editor-suggestion-pick"][data-suggestion-index="0"]'
    );
    expect(suggestionButton).not.toBeNull();

    suggestionButton.click();
    expect(editorInput.value).toBe('@trusted_creator, ');

    editorForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const verifiedWhitelistChips = Array.from(
      document.querySelectorAll('[data-btf-action="verified-whitelist-chip"]')
    ).map((element) => element.textContent);
    expect(verifiedWhitelistChips).toEqual(['@trusted_creator']);
    expect(document.getElementById('btf-settings-status').textContent).toBe(
      'Verified whitelist updated. Save & Close to apply.'
    );

    menu.destroy();
  });

  test('renders username suggestions in fixed overlay outside editor form flow', async () => {
    const accountSearchClient = {
      searchMentionCandidates: jest.fn().mockResolvedValue([
        {
          handle: 'ameniwa_',
          displayName: 'Ameniwa',
          isVerified: false,
          profilePictureUrl: 'https://cdn.example/avatar-1.jpg',
        },
      ]),
    };
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore, accountSearchClient });

    await menu.open();
    clickByAction('open-user-editor');

    const editorForm = document.getElementById('btf-settings-editor-form');
    const editorInput = document.getElementById('btf-settings-editor-input');
    editorInput.value = '@am';
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));
    await waitMs(220);
    await flushAsyncQueue();

    const overlayElement = document.getElementById('btf-settings-editor-suggestion-overlay');
    const suggestionList = document.getElementById('btf-settings-editor-suggestion-list');
    expect(overlayElement).not.toBeNull();
    expect(suggestionList).not.toBeNull();
    expect(editorForm.contains(suggestionList)).toBe(false);
    expect(overlayElement.contains(suggestionList)).toBe(true);

    const styleElement = document.getElementById('btf-settings-modal-style');
    expect(styleElement.textContent).toContain('.btf-suggestion-overlay{position:fixed');
    expect(styleElement.textContent).toContain('.btf-suggestion-overlay-panel{width:280px');

    menu.destroy();
  });

  test('never exposes regex controls while editing usernames', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-user-editor');

    const regexRow = document.getElementById('btf-settings-editor-regex-row');
    const regexToggle = document.getElementById('btf-settings-editor-regex-toggle');
    const notInterestedRow = document.getElementById('btf-settings-editor-not-interested-row');
    const notInterestedToggle = document.getElementById(
      'btf-settings-editor-not-interested-toggle'
    );
    expect(regexRow.hidden).toBe(true);
    expect(regexToggle.checked).toBe(false);
    expect(regexToggle.disabled).toBe(true);
    expect(notInterestedRow.hidden).toBe(false);
    expect(notInterestedToggle.checked).toBe(false);
    expect(notInterestedToggle.disabled).toBe(false);

    clickByAction('editor-cancel');
    clickByAction('open-phrase-editor');
    expect(regexRow.hidden).toBe(false);
    expect(regexToggle.disabled).toBe(false);
    expect(notInterestedRow.hidden).toBe(false);
    expect(notInterestedToggle.disabled).toBe(false);

    menu.destroy();
  });

  test('shows not-interested toggle while adding trending topics', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-trending-topic-editor');

    const regexRow = document.getElementById('btf-settings-editor-regex-row');
    const regexToggle = document.getElementById('btf-settings-editor-regex-toggle');
    const notInterestedRow = document.getElementById('btf-settings-editor-not-interested-row');
    const notInterestedToggle = document.getElementById(
      'btf-settings-editor-not-interested-toggle'
    );

    expect(regexRow.hidden).toBe(true);
    expect(regexToggle.disabled).toBe(true);
    expect(notInterestedRow.hidden).toBe(false);
    expect(notInterestedToggle.disabled).toBe(false);

    menu.destroy();
  });

  test('shows reactive clean/dirty actions in phrase editor modal', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-phrase-editor');

    const cleanActions = document.getElementById('btf-settings-editor-clean-actions');
    const dirtyActions = document.getElementById('btf-settings-editor-dirty-actions');
    const editorInput = document.getElementById('btf-settings-editor-input');
    expect(cleanActions.getAttribute('aria-hidden')).toBe('false');
    expect(dirtyActions.getAttribute('aria-hidden')).toBe('true');
    expect(cleanActions.textContent).toContain('Close');
    expect(dirtyActions.textContent).toContain('Discard & Close');

    editorInput.value = 'promoted content';
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cleanActions.getAttribute('aria-hidden')).toBe('true');
    expect(dirtyActions.getAttribute('aria-hidden')).toBe('false');

    editorInput.value = '';
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cleanActions.getAttribute('aria-hidden')).toBe('false');
    expect(dirtyActions.getAttribute('aria-hidden')).toBe('true');

    menu.destroy();
  });

  test('shows reactive clean/dirty actions in username editor modal', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-user-editor');

    const cleanActions = document.getElementById('btf-settings-editor-clean-actions');
    const dirtyActions = document.getElementById('btf-settings-editor-dirty-actions');
    const editorInput = document.getElementById('btf-settings-editor-input');
    expect(cleanActions.getAttribute('aria-hidden')).toBe('false');
    expect(dirtyActions.getAttribute('aria-hidden')).toBe('true');

    editorInput.value = '@noisy_account';
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cleanActions.getAttribute('aria-hidden')).toBe('true');
    expect(dirtyActions.getAttribute('aria-hidden')).toBe('false');

    editorInput.value = '';
    editorInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cleanActions.getAttribute('aria-hidden')).toBe('false');
    expect(dirtyActions.getAttribute('aria-hidden')).toBe('true');

    menu.destroy();
  });

  test('marks added username chips with NI when username signaling is enabled', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-user-editor');

    const editorInput = document.getElementById('btf-settings-editor-input');
    const notInterestedToggle = document.getElementById(
      'btf-settings-editor-not-interested-toggle'
    );
    const editorForm = document.getElementById('btf-settings-editor-form');
    editorInput.value = '@noisy_account';
    notInterestedToggle.checked = true;
    notInterestedToggle.dispatchEvent(new Event('change', { bubbles: true }));
    editorForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    const userChip = document.querySelector('[data-btf-action="user-chip"]');
    expect(userChip).not.toBeNull();
    expect(userChip.textContent).toContain('@noisy_account');
    expect(userChip.textContent).toContain('NI');

    menu.destroy();
  });

  test('applies dedicated spacing layout to phrase editor regex controls', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-phrase-editor');

    const editorForm = document.getElementById('btf-settings-editor-form');
    const regexRow = document.getElementById('btf-settings-editor-regex-row');
    expect(editorForm.classList.contains('btf-submodal-form')).toBe(true);
    expect(regexRow.classList.contains('btf-editor-regex-row')).toBe(true);

    const styleElement = document.getElementById('btf-settings-modal-style');
    expect(styleElement.textContent).toContain('.btf-submodal-form{display:grid;row-gap:8px}');
    expect(styleElement.textContent).toContain('.btf-editor-regex-row{padding-top:2px}');
    expect(styleElement.textContent).toContain('.btf-editor-not-interested-row{padding-top:2px}');
    expect(styleElement.textContent).toContain('.btf-submodal-status:empty{display:none}');
    expect(styleElement.textContent).toContain(
      '.btf-submodal-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-submodal-actions-main{display:inline-flex;align-items:center;gap:8px}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-submodal-actions-main-reactive{display:grid;grid-template-columns:max-content;grid-template-rows:auto;justify-items:end;align-items:center;min-height:34px}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-submodal-action-set{grid-area:1/1;display:none;align-items:center;gap:8px}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-submodal-action-set[aria-hidden="false"]{display:inline-flex;animation:btf-submodal-action-set-in 140ms ease}'
    );
    expect(styleElement.textContent).toContain(
      '@keyframes btf-submodal-action-set-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}'
    );

    menu.destroy();
  });

  test('keeps confirm modal actions in inline row while editor uses reactive layout', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(
        createNormalizedSettings({
          filters: {
            username: {
              blockedHandles: ['alpha'],
            },
          },
        })
      ),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-phrase-editor');

    const editorMainActions = document.querySelector(
      '#btf-settings-editor-modal .btf-submodal-actions-main'
    );
    expect(editorMainActions.classList.contains('btf-submodal-actions-main-reactive')).toBe(true);

    clickByAction('editor-cancel');
    clickByAction('user-chip');
    const confirmMainActions = document.querySelector(
      '#btf-settings-confirm-modal .btf-submodal-actions-main'
    );
    expect(confirmMainActions.classList.contains('btf-submodal-actions-main-reactive')).toBe(false);

    menu.destroy();
  });

  test('suppresses browser autofill metadata on editor inputs', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    clickByAction('open-user-editor');

    const editorForm = document.getElementById('btf-settings-editor-form');
    const editorInput = document.getElementById('btf-settings-editor-input');
    const firstInputName = editorInput.getAttribute('name');
    expect(editorForm.getAttribute('autocomplete')).toBe('off');
    expect(editorInput.getAttribute('autocomplete')).toBe('off');
    expect(editorInput.getAttribute('autocorrect')).toBe('off');
    expect(editorInput.getAttribute('autocapitalize')).toBe('off');
    expect(editorInput.getAttribute('spellcheck')).toBe('false');
    expect(editorInput.getAttribute('inputmode')).toBe('text');

    clickByAction('editor-cancel');
    clickByAction('open-phrase-editor');

    const secondInputName = editorInput.getAttribute('name');
    expect(secondInputName).not.toBe(firstInputName);

    menu.destroy();
  });

  test('uses reply-options style switch structure for top-level toggles', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const verifiedToggle = document.getElementById('btf-settings-verified-enabled');
    expect(verifiedToggle).not.toBeNull();
    expect(verifiedToggle.getAttribute('role')).toBe('switch');
    expect(verifiedToggle.getAttribute('aria-checked')).toBe(String(verifiedToggle.checked));

    verifiedToggle.checked = !verifiedToggle.checked;
    verifiedToggle.dispatchEvent(new Event('change', { bubbles: true }));
    expect(verifiedToggle.getAttribute('aria-checked')).toBe(String(verifiedToggle.checked));

    const switchShell = verifiedToggle.parentElement.querySelector('.btf-switch-shell');
    const switchTrack = verifiedToggle.parentElement.querySelector('.btf-switch-track');
    const switchThumb = verifiedToggle.parentElement.querySelector('.btf-switch-thumb');
    expect(switchShell).not.toBeNull();
    expect(switchTrack).not.toBeNull();
    expect(switchThumb).not.toBeNull();

    const styleElement = document.getElementById('btf-settings-modal-style');
    expect(styleElement.textContent).toContain(
      '.btf-setting-toggle-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:12px;min-height:52px;padding:0'
    );
    expect(styleElement.textContent).toContain(
      '.btf-switch{position:relative;display:inline-flex;align-items:center;justify-content:center;justify-self:end;width:40px;height:24px'
    );
    expect(styleElement.textContent).toContain(
      '.btf-switch-thumb{position:absolute;top:1px;left:1px;width:22px;height:22px;box-sizing:border-box;border-radius:14px;border:1px solid var(--f);background:#0a0a0a'
    );
    expect(styleElement.textContent).toContain(
      '.btf-switch-shell{position:absolute;inset:0;border-radius:16px'
    );
    expect(styleElement.textContent).toContain(
      '.btf-switch-track{position:absolute;inset:0;border-radius:16px;background:#fff;opacity:0'
    );
    expect(styleElement.textContent).toContain(
      '[data-theme="light"] .btf-switch-track{background:#1c1e21}'
    );
    expect(styleElement.textContent).toContain(
      '[data-theme="light"] .btf-switch-thumb{border-color:rgba(17,24,39,.2);background:#fff}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-switch input:checked + .btf-switch-shell .btf-switch-track{opacity:1}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-switch input:checked + .btf-switch-shell .btf-switch-thumb{transform:translateX(16px)}'
    );

    menu.destroy();
  });

  test('refreshes an existing modal style tag to latest css tokens', async () => {
    const staleStyle = document.createElement('style');
    staleStyle.id = 'btf-settings-modal-style';
    staleStyle.textContent = '.btf-switch-thumb{background:#101010}';
    document.head.appendChild(staleStyle);

    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const refreshedStyle = document.getElementById('btf-settings-modal-style');
    expect(refreshedStyle.textContent).toContain(
      '.btf-switch-thumb{position:absolute;top:1px;left:1px;width:22px;height:22px;box-sizing:border-box;border-radius:14px;border:1px solid var(--f);background:#0a0a0a'
    );
    expect(refreshedStyle.textContent).toContain(
      '.btf-setting-toggle-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:12px;min-height:52px;padding:0'
    );

    menu.destroy();
  });

  test('discards dirty changes through footer discard action', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(
        createNormalizedSettings({
          filters: {
            verified: {
              enabled: true,
            },
          },
        })
      ),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });
    await menu.open();

    const verifiedToggle = document.getElementById('btf-settings-verified-enabled');
    verifiedToggle.checked = false;
    verifiedToggle.dispatchEvent(new Event('change', { bubbles: true }));

    expect(isActionSetHidden('btf-settings-clean-actions')).toBe(true);
    expect(isActionSetHidden('btf-settings-dirty-actions')).toBe(false);

    clickByAction('discard-close');
    expect(document.getElementById('btf-settings-modal-root').hidden).toBe(true);
    expect(settingsStore.save).not.toHaveBeenCalled();

    menu.destroy();
  });

  test('saves updated entries and publishes live update callback', async () => {
    const schema = new SettingsSchema();
    const initialSettings = schema.createDefaults();
    const settingsStore = {
      load: jest.fn().mockResolvedValue(initialSettings),
      save: jest.fn().mockImplementation(async (candidate) => schema.normalize(candidate)),
    };
    const onSettingsUpdated = jest.fn();
    const menu = new ThreadsSettingsMenu({ settingsStore, onSettingsUpdated });

    await menu.open();

    document.getElementById('btf-settings-verified-enabled').checked = false;
    document.getElementById('btf-settings-verified-badge-enabled').checked = true;
    document.getElementById('btf-settings-ai-label-enabled').checked = true;
    document.getElementById('btf-settings-suggested-follow-enabled').checked = true;
    document.getElementById('btf-settings-trending-hide-all-enabled').checked = false;

    clickByAction('open-phrase-editor');
    document.getElementById('btf-settings-editor-input').value = 'promoted\\s+post';
    document.getElementById('btf-settings-editor-regex-toggle').checked = true;
    document.getElementById('btf-settings-editor-not-interested-toggle').checked = true;
    document
      .getElementById('btf-settings-editor-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    clickByAction('open-user-editor');
    document.getElementById('btf-settings-editor-input').value = '@NoisyAccount, ads_bot';
    document.getElementById('btf-settings-editor-not-interested-toggle').checked = true;
    document
      .getElementById('btf-settings-editor-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    clickByAction('open-verified-whitelist-editor');
    document.getElementById('btf-settings-editor-input').value = '@TrustedCreator, newsroom';
    document
      .getElementById('btf-settings-editor-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    clickByAction('open-trending-topic-editor');
    document.getElementById('btf-settings-editor-input').value = 'Daily Deals';
    document.getElementById('btf-settings-editor-not-interested-toggle').checked = true;
    document
      .getElementById('btf-settings-editor-form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    clickByAction('save-close');
    await flushAsyncQueue();

    expect(settingsStore.save).toHaveBeenCalledTimes(1);
    const submittedSettings = settingsStore.save.mock.calls[0][0];
    expect(submittedSettings.filters.verified.enabled).toBe(false);
    expect(submittedSettings.filters.verified.hideBadges).toBe(true);
    expect(submittedSettings.filters.verified.whitelistHandles).toEqual([
      'trustedcreator',
      'newsroom',
    ]);
    expect(submittedSettings.filters.aiLabel.enabled).toBe(true);
    expect(submittedSettings.filters.suggestedFollow.enabled).toBe(true);
    expect(submittedSettings.filters.trending.hideAll).toBe(false);
    expect(submittedSettings.filters.trending.blockedTopics).toEqual(['daily deals']);
    expect(submittedSettings.filters.trending.notInterested.enabledTopics).toEqual(['daily deals']);
    expect(submittedSettings.filters.phrase.enabled).toBe(true);
    expect(submittedSettings.filters.phrase.entries).toEqual([
      { pattern: 'promoted\\s+post', isRegex: true },
    ]);
    expect(submittedSettings.filters.phrase.notInterested.enabledEntries).toEqual([
      { pattern: 'promoted\\s+post', isRegex: true },
    ]);
    expect(submittedSettings.filters.phrase.notInterested.enabledPatterns).toEqual([
      'promoted\\s+post',
    ]);
    expect(submittedSettings.filters.username.enabled).toBe(true);
    expect(submittedSettings.filters.username.blockedHandles).toEqual(['noisyaccount', 'ads_bot']);
    expect(submittedSettings.filters.username.notInterested.enabledHandles).toEqual([
      'noisyaccount',
      'ads_bot',
    ]);

    expect(onSettingsUpdated).toHaveBeenCalledTimes(1);
    const publishedSettings = onSettingsUpdated.mock.calls[0][0];
    expect(publishedSettings.filters.verified.enabled).toBe(false);
    expect(publishedSettings.filters.verified.hideBadges).toBe(true);
    expect(publishedSettings.filters.verified.whitelistHandles).toEqual([
      'trustedcreator',
      'newsroom',
    ]);
    expect(publishedSettings.filters.aiLabel.enabled).toBe(true);
    expect(publishedSettings.filters.suggestedFollow.enabled).toBe(true);
    expect(publishedSettings.filters.trending.hideAll).toBe(false);
    expect(publishedSettings.filters.trending.blockedTopics).toEqual(['daily deals']);
    expect(publishedSettings.filters.trending.notInterested.enabledTopics).toEqual(['daily deals']);
    expect(publishedSettings.filters.phrase.entries).toEqual([
      { pattern: 'promoted\\s+post', isRegex: true },
    ]);
    expect(publishedSettings.filters.phrase.notInterested.enabledEntries).toEqual([
      { pattern: 'promoted\\s+post', isRegex: true },
    ]);
    expect(publishedSettings.filters.username.blockedHandles).toEqual(['noisyaccount', 'ads_bot']);
    expect(publishedSettings.filters.username.notInterested.enabledHandles).toEqual([
      'noisyaccount',
      'ads_bot',
    ]);
    expect(document.getElementById('btf-settings-modal-root').hidden).toBe(true);

    menu.destroy();
  });

  test('keeps modal root fully hidden when closed', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();
    menu.close();

    const rootElement = document.getElementById('btf-settings-modal-root');
    const styleElement = document.getElementById('btf-settings-modal-style');

    expect(rootElement.hidden).toBe(true);
    expect(styleElement.textContent).toContain('#btf-settings-modal-root[hidden]');
    expect(styleElement.textContent).toContain(
      '#btf-settings-modal-root [hidden]{display:none!important}'
    );

    menu.destroy();
  });

  test('uses responsive footer action layout for long button labels', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const styleElement = document.getElementById('btf-settings-modal-style');
    expect(styleElement.textContent).toContain('.btf-footer-actions{display:grid');
    expect(styleElement.textContent).toContain('.btf-footer-action-set .btf-button{flex:0 0 auto}');
    expect(styleElement.textContent).toContain(
      '.btf-footer-actions{width:100%;min-width:0;min-height:72px}'
    );
    expect(styleElement.textContent).not.toContain('.btf-footer-actions{position:relative');
    expect(styleElement.textContent).not.toContain(
      '.btf-footer-actions{position:relative;min-width:236px;height:34px'
    );

    menu.destroy();
  });

  test('uses consistent heading hierarchy classes for primary and nested sections', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const trendingTitle = Array.from(document.querySelectorAll('.btf-section-title')).find(
      (element) => element.textContent === 'Trending Filters'
    );
    const phraseTitle = Array.from(document.querySelectorAll('.btf-section-title')).find(
      (element) => element.textContent === 'Filtered Phrases'
    );
    const usernameTitle = Array.from(document.querySelectorAll('.btf-section-title')).find(
      (element) => element.textContent === 'Filtered Usernames'
    );
    const verifiedWhitelistTitle = Array.from(document.querySelectorAll('.btf-section-title')).find(
      (element) => element.textContent === 'Verified Whitelist'
    );
    const trendingTopicsTitle = Array.from(document.querySelectorAll('.btf-section-title')).find(
      (element) => element.textContent === 'Trending Topics'
    );
    const verifiedToggleTitle = Array.from(
      document.querySelectorAll('.btf-setting-toggle-title')
    ).find((element) => element.textContent === 'Filter Verified Users');
    const aiLabelToggleTitle = Array.from(
      document.querySelectorAll('.btf-setting-toggle-title')
    ).find((element) => element.textContent === 'Filter AI Posts');
    const suggestedToggleTitle = Array.from(
      document.querySelectorAll('.btf-setting-toggle-title')
    ).find((element) => element.textContent === 'Filter Suggested For You');

    expect(trendingTitle.classList.contains('btf-section-title-main')).toBe(true);
    expect(phraseTitle.classList.contains('btf-section-title-main')).toBe(true);
    expect(usernameTitle.classList.contains('btf-section-title-main')).toBe(true);
    expect(verifiedWhitelistTitle.classList.contains('btf-section-title-sub')).toBe(true);
    expect(trendingTopicsTitle.classList.contains('btf-section-title-sub')).toBe(true);
    expect(verifiedToggleTitle.classList.contains('btf-section-title-main')).toBe(true);
    expect(aiLabelToggleTitle.classList.contains('btf-section-title-main')).toBe(true);
    expect(suggestedToggleTitle.classList.contains('btf-section-title-main')).toBe(true);

    const styleElement = document.getElementById('btf-settings-modal-style');
    expect(styleElement.textContent).toContain(
      '.btf-section-title-main{font-size:15px;line-height:1.3;font-weight:600;color:var(--t)}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-section-title-sub{font-size:13px;line-height:1.35;font-weight:600;color:var(--m);letter-spacing:.01em}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-setting-toggle-title{margin:0;font-size:15px;line-height:1.3;font-weight:600;color:var(--t);padding-right:6px}'
    );

    menu.destroy();
  });

  test('describes AI filtering as post-level self-disclosure', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const aiLabelHelpText = Array.from(document.querySelectorAll('.btf-helper-text')).find(
      (element) =>
        element.textContent ===
        "Hide posts marked with Threads' AI self-disclosure label. This only filters disclosed posts, not all AI content."
    );

    expect(aiLabelHelpText).not.toBeUndefined();

    menu.destroy();
  });

  test('pins header and footer while body handles scrolling', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const styleElement = document.getElementById('btf-settings-modal-style');
    expect(styleElement.textContent).toContain(
      '.btf-settings-dialog{width:min(680px,calc(100vw - 24px));max-height:calc(100vh - 40px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden'
    );
    expect(styleElement.textContent).toContain(
      '#btf-settings-modal-root #btf-settings-form{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;overflow:hidden}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-settings-body{padding:0 22px;overflow:auto;min-height:0}'
    );

    menu.destroy();
  });

  test('uses Threads-native neutral modal action button palette', async () => {
    const settingsStore = {
      load: jest.fn().mockResolvedValue(new SettingsSchema().createDefaults()),
      save: jest.fn(),
    };
    const menu = new ThreadsSettingsMenu({ settingsStore });

    await menu.open();

    const styleElement = document.getElementById('btf-settings-modal-style');
    expect(styleElement.textContent).toContain(
      '.btf-button-primary{border-color:var(--fb);font-weight:600}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-button-danger{border-color:var(--f);font-weight:500}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-button{border:1px solid var(--f);border-radius:999px;font-size:13px;font-weight:500;padding:8px 14px;cursor:pointer;line-height:1.2;color:var(--t);background:transparent}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-submodal-title{margin:0;font-size:17px;font-weight:700;color:var(--t)}'
    );
    expect(styleElement.textContent).toContain(
      '.btf-about-trigger{border:0;padding:0;background:transparent;color:var(--m);cursor:pointer;display:inline-flex;align-items:center;gap:8px;min-height:28px}'
    );
    expect(styleElement.textContent).toContain(
      '@keyframes btf-about-hat-rock{0%{transform:rotate(0deg)}35%{transform:rotate(-8deg)}70%{transform:rotate(6deg)}100%{transform:rotate(0deg)}}'
    );
    expect(styleElement.textContent).toContain('--o:rgba(0,0,0,.7)');
    expect(styleElement.textContent).toContain('#btf-settings-modal-root{--o:rgba(0,0,0,.7)');
    expect(styleElement.textContent).toContain('--s:rgb(24,24,24)');
    expect(styleElement.textContent).toContain('--b:rgba(243,245,247,.15)');
    expect(styleElement.textContent).toContain('--t:rgb(243,245,247)');
    expect(styleElement.textContent).toContain('animation:btf-overlay-fade-in .2s ease-in-out');
    expect(styleElement.textContent).toContain(
      ".btf-settings-dialog{width:min(680px,calc(100vw - 24px));max-height:calc(100vh - 40px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border-radius:16px;border:1px solid var(--b);background:var(--s);box-shadow:rgba(0,0,0,.08) 0 12px 24px 0;color:var(--t);font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;animation:btf-overlay-fade-in .2s ease-in-out,btf-modal-scale-in .2s ease-in-out}"
    );
    expect(styleElement.textContent).toContain(
      '@keyframes btf-overlay-fade-in{0%{opacity:0}100%{opacity:1}}'
    );
    expect(styleElement.textContent).toContain(
      '@keyframes btf-modal-scale-in{0%{transform:scale(.95)}100%{transform:none}}'
    );
    expect(styleElement.textContent).not.toContain('#0095f6');
    expect(styleElement.textContent).not.toContain('#ff5a5a');
    expect(styleElement.textContent).not.toContain('backdrop-filter:blur(');

    menu.destroy();
  });
});
