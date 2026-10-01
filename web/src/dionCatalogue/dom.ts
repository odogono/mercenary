export const node = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
export const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = ''
): HTMLElementTagNameMap[K] => {
  const result = document.createElement(tag);
  result.textContent = text;
  return result;
};
export const option = (value: string, label: string): HTMLOptionElement => {
  const o = element('option', label);
  o.value = value;
  return o;
};
export const paragraph = (parent: HTMLElement, text: string): void => {
  parent.append(element('p', text));
};
export const selectionLink = (
  name: string,
  id: string,
  params: Record<string, string> = {}
): HTMLAnchorElement => {
  const a = element('a', name);
  const url = new URL('/dion/catalogue', location.origin);
  url.searchParams.set('id', id);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  a.href = url.href;
  return a;
};
