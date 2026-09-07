export const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = ''
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
};
export const node = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export const address = (value: number): string =>
  `$${value.toString(16).padStart(6, '0').toUpperCase()}`;
export const selectionUrl = (
  kind: 'model' | 'instance',
  id: string
): string => {
  const url = new URL(location.href);
  url.searchParams.delete('model');
  url.searchParams.delete('instance');
  url.searchParams.delete('variant');
  url.searchParams.set(kind, id);
  return url.pathname + url.search;
};
export const link = (
  text: string,
  kind: 'model' | 'instance',
  id: string
): HTMLAnchorElement => {
  const anchor = element('a', text);
  anchor.href = selectionUrl(kind, id);
  return anchor;
};
