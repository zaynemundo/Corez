/**
 * CoreZ Runtime Capability Registry
 * Inspects available tools and environment capabilities (Git, Terminal, Filesystem, Browser, APIs).
 */

export class CapabilityRegistry {
  constructor(capabilities = {}) {
    this.capabilities = new Map([
      ['filesystem', capabilities.filesystem !== false],
      ['terminal', capabilities.terminal !== false],
      ['git', Boolean(capabilities.git)],
      ['browser', Boolean(capabilities.browser)],
      ['apis', capabilities.apis !== false]
    ]);
  }

  hasCapability(name) {
    return Boolean(this.capabilities.get(name));
  }

  getAvailableTools() {
    return Array.from(this.capabilities.entries())
      .filter(([_, available]) => available)
      .map(([name, _]) => name);
  }

  setCapability(name, value) {
    this.capabilities.set(name, Boolean(value));
  }
}

export const defaultCapabilityRegistry = new CapabilityRegistry({
  filesystem: true,
  terminal: true,
  git: false,
  browser: false,
  apis: true
});
