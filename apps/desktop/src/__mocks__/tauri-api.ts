// Mock for @tauri-apps/api
export const invoke = async (_cmd: string, _args?: Record<string, unknown>) => null;
export const event = {
  listen: async (_event: string, _handler: Function) => () => {},
  emit: async (_event: string, _payload?: unknown) => {},
};
export const window = {
  appWindow: {
    setTitle: async (_title: string) => {},
    close: async () => {},
  },
};
