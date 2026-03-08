const { ThreadsSidebarMenuTrigger } = require('../../src/ui/sidebar-menu-trigger');

function setBoundingRectangle(element, rectangle) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: rectangle.width,
      height: rectangle.height,
      top: rectangle.top,
      right: rectangle.left + rectangle.width,
      bottom: rectangle.top + rectangle.height,
      left: rectangle.left,
      x: rectangle.left,
      y: rectangle.top,
      toJSON: () => rectangle,
    }),
  });
}

function createRailFixture() {
  document.body.innerHTML = `
<div class="x7c8izy x6s0dn4 xktjril x1g7m7fl x78zum5 xdt5ytf x5yr21d x1o0tod x5mc7k8 x1plvlek xryxfnj xixxii4 x13vifvy x120sd54 x1vjfegm">
  <div class="x78zum5 xdt5ytf x1iyjqo2 xl56j7k x1r0jzty">
    <div class="x1n2onr6">
      <a class="x1i10hfl x1qjc9v5 xjbqb8w xjqpnuy x1rg5ohu x1a2a7pz" role="link" href="/">Home</a>
    </div>
  </div>
  <div id="native-more-wrapper" class="xg7h5cd x91k8ka">
    <div
      id="native-more-control"
      aria-expanded="false"
      aria-haspopup="menu"
      class="x1i10hfl x1qjc9v5 xjbqb8w xjqpnuy xc5r6h4 xqeqjp1 x1phubyo x13fuv20 x18b5jzi x1q0q8m5 x1t7ytsu x972fbf x10w94by x1qhh985 x14e42zd x9f619 x1ypdohk xdl72j9 x2lah0s x3ct3a4 xdj266r x14z9mp xat24cr x1lziwak x2lwn1j xeuugli xexx8yu xyri2b x18d9i69 x1c1uobl x1n2onr6 x16tdsg8 x1hl2dhg xggy1nq x1ja2u2z x1t137rt x1fmog5m xu25z0z x140muxe xo1y3bh x3nfvp2 x1q0g3np x87ps6o x1lku1pv x1a2a7pz x3oybdh x13dflua x11xpdln xvruv2t"
      role="button"
      tabindex="0"
    >
      <div class="xsdox4t x1n2onr6 x1useyqa">
        <div class="x6s0dn4 x78zum5 xsdox4t x1o0tod xl56j7k x10l6tqk x13vifvy x13dflua x19991ni x1useyqa x1hc1fzr x1g8kv23">
          <svg aria-label="More" role="img" class="x1lliihq x2lah0s x1n2onr6 x16ye13r x5lhr3w x3egl4o x117rol3" viewBox="0 0 24 24">
            <title>More</title>
            <rect x="3" y="7" rx="1.25"></rect>
          </svg>
        </div>
        <div class="x6s0dn4 x78zum5 xsdox4t x1o0tod xl56j7k x10l6tqk x13vifvy x13dflua x19991ni x1useyqa xg01cxk x1o7uuvo">
          <svg aria-label="More" role="img" class="x1lliihq x2lah0s x1n2onr6 x16ye13r x5lhr3w x86x9uj x117rol3" viewBox="0 0 24 24">
            <title>More</title>
            <rect x="3" y="7" rx="1.25"></rect>
          </svg>
        </div>
      </div>
    </div>
  </div>
</div>
`;

  const moreControlElement = document.getElementById('native-more-control');
  const moreWrapperElement = document.getElementById('native-more-wrapper');
  setBoundingRectangle(moreControlElement, {
    left: 14,
    top: 1216,
    width: 48,
    height: 48,
  });
  setBoundingRectangle(moreWrapperElement, {
    left: 14,
    top: 1216,
    width: 48,
    height: 53,
  });
}

async function flushAsyncQueue() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('ThreadsSidebarMenuTrigger', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    const styleElement = document.getElementById('btf-sidebar-trigger-style');
    if (styleElement && styleElement.parentElement) {
      styleElement.parentElement.removeChild(styleElement);
    }
  });

  test('mounts one trigger above native More and toggles callback on click', async () => {
    createRailFixture();
    const onActivate = jest.fn().mockResolvedValue(undefined);
    const trigger = new ThreadsSidebarMenuTrigger({ onActivate });

    await trigger.start();

    const triggerWrapper = document.querySelector('[data-btf-sidebar-trigger-root="true"]');
    const triggerControl = document.querySelector('[data-btf-sidebar-trigger-control="true"]');
    const moreWrapper = document.getElementById('native-more-wrapper');
    expect(triggerWrapper).toBeTruthy();
    expect(triggerWrapper.nextElementSibling).toBe(moreWrapper);
    expect(triggerControl.getAttribute('aria-label')).toBe('Bobbin Filters');
    expect(triggerControl.getAttribute('aria-haspopup')).toBeNull();
    expect(triggerControl.querySelectorAll('.btf-sidebar-trigger-icon')).toHaveLength(2);

    triggerControl.click();
    await flushAsyncQueue();
    expect(onActivate).toHaveBeenCalledTimes(1);

    trigger.stop();
  });

  test('reflects menu-open state through trigger attributes', async () => {
    createRailFixture();
    const trigger = new ThreadsSidebarMenuTrigger();

    await trigger.start();

    const triggerControl = document.querySelector('[data-btf-sidebar-trigger-control="true"]');
    trigger.setMenuOpen(true);
    expect(triggerControl.getAttribute('data-btf-open')).toBe('true');
    expect(triggerControl.getAttribute('aria-pressed')).toBe('true');

    trigger.setMenuOpen(false);
    expect(triggerControl.getAttribute('data-btf-open')).toBe('false');
    expect(triggerControl.getAttribute('aria-pressed')).toBe('false');

    trigger.stop();
  });

  test('re-mounts trigger when host rail re-renders', async () => {
    createRailFixture();
    const trigger = new ThreadsSidebarMenuTrigger();

    await trigger.start();
    const firstWrapper = document.querySelector('[data-btf-sidebar-trigger-root="true"]');
    firstWrapper.remove();

    trigger.refresh();
    const secondWrapper = document.querySelector('[data-btf-sidebar-trigger-root="true"]');
    expect(secondWrapper).toBeTruthy();
    expect(secondWrapper).not.toBe(firstWrapper);

    trigger.stop();
  });

  test('removes trigger and style tag on stop', async () => {
    createRailFixture();
    const trigger = new ThreadsSidebarMenuTrigger();

    await trigger.start();
    expect(document.getElementById('btf-sidebar-trigger-style')).toBeTruthy();
    expect(document.querySelector('[data-btf-sidebar-trigger-root="true"]')).toBeTruthy();

    trigger.stop();

    expect(document.getElementById('btf-sidebar-trigger-style')).toBeNull();
    expect(document.querySelector('[data-btf-sidebar-trigger-root="true"]')).toBeNull();
  });
});
