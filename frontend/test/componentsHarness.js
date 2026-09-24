import { Window } from 'happy-dom';
import { build } from 'esbuild';
import { parse, compileScript } from '@vue/compiler-sfc';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, afterEach } from 'node:test';
import { existsSync } from 'node:fs';

const browser = new Window({ url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'history', 'location', 'HTMLElement', 'Element', 'Node', 'SVGElement', 'Event', 'KeyboardEvent', 'MouseEvent', 'localStorage', 'sessionStorage']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? browser : browser[key] });
}
globalThis.requestAnimationFrame = browser.requestAnimationFrame.bind(browser);
globalThis.cancelAnimationFrame = browser.cancelAnimationFrame.bind(browser);
const { createApp, nextTick } = await import('vue');
const { createPinia, setActivePinia } = await import('pinia');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'sobracorte-components-'));
let moduleCount = 0;
const mountedComponents = new Set();
export const api = {
  get: async () => ({ data: [] }), post: async () => ({ data: {} }),
  put: async () => ({ data: {} }), patch: async () => ({ data: {} }), delete: async () => ({ data: {} }),
};
globalThis.__componentTestApi = api;

export async function loadComponent(path, { mockHttpClient = true } = {}) {
  const output = join(temporaryDirectory, `${moduleCount++}.mjs`);
  await build({
    entryPoints: [resolve(path)], outfile: output, bundle: true, format: 'esm', platform: 'node',
    logLevel: 'silent', define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'vue-dom-tests',
      setup(builder) {
        builder.onResolve({ filter: /^(vue|pinia|vue-router|lucide-vue-next)$/ }, (args) => ({
          path: new URL(import.meta.resolve(args.path)).pathname, external: true,
        }));
        if (mockHttpClient) {
          builder.onResolve({ filter: /services\/httpClient$/ }, () => ({ path: 'http-client', namespace: 'test' }));
          builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: 'export const api = globalThis.__componentTestApi; export const authApi = api; export const refreshAuthSession = async () => {}; export const setSessionRefreshHandler = () => {};', loader: 'js',
          }));
        }
        builder.onResolve({ filter: /^@\// }, (args) => {
          const base = resolve('src', args.path.slice(2));
          return { path: [base, `${base}.js`, `${base}.ts`].find(existsSync) || base };
        });
        builder.onLoad({ filter: /\.vue$/ }, async (args) => {
          const source = await readFile(args.path, 'utf8');
          const { descriptor } = parse(source, { filename: args.path });
          const script = compileScript(descriptor, { id: args.path, inlineTemplate: true });
          return { contents: script.content, loader: 'ts', resolveDir: resolve(args.path, '..') };
        });
      },
    }],
  });
  const module = await import(pathToFileURL(output).href);
  return module.default || module;
}

export async function mountComponent(component, { props = {}, pinia = createPinia(), router, stubs = {} } = {}) {
  setActivePinia(pinia);
  const element = document.createElement('div');
  document.body.appendChild(element);
  const app = createApp(component, props);
  app.use(pinia);
  if (router) app.use(router);
  for (const [name, stub] of Object.entries(stubs)) app.component(name, stub);
  const vm = app.mount(element);
  const unmount = () => {
    if (!mountedComponents.delete(unmount)) return;
    app.unmount();
    element.remove();
  };
  mountedComponents.add(unmount);
  await nextTick();
  return { element, app, vm, pinia, unmount };
}

afterEach(() => {
  for (const unmount of [...mountedComponents]) unmount();
});

export async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

after(async () => {
  await rm(temporaryDirectory, { recursive: true, force: true });
  await browser.happyDOM.close();
});
