export class IntegrationRegistry {
  constructor() {
    this.providers = new Map();
    this.actions = new Map();
  }

  registerProvider(name, config) {
    this.providers.set(name, config);
  }

  registerAction(actionName, handler) {
    this.actions.set(actionName, handler);
  }

  getProvider(name) {
    return this.providers.get(name) ?? null;
  }

  async executeAction(actionName, context) {
    const handler = this.actions.get(actionName);

    if (!handler) {
      throw new Error(`No integration action registered for "${actionName}".`);
    }

    return handler(context);
  }
}

