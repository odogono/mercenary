export const card = (
  parent: HTMLElement,
  title: string,
  description: string
): HTMLElement => {
  const element = document.createElement('article');
  element.className = 'sound';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const text = document.createElement('p');
  text.textContent = description;
  const buttons = document.createElement('div');
  buttons.className = 'buttons';
  element.append(heading, text, buttons);
  parent.append(element);
  return buttons;
};

export const button = (
  parent: HTMLElement,
  label: string,
  action: () => void
): HTMLButtonElement => {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.addEventListener('click', action);
  parent.append(element);
  return element;
};
