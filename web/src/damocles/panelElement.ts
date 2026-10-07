/// The actual Gameplay Session's recovered panel canvas and accessible readouts. The shared
/// panel controls (`shell/panelControls.ts`) lie over it; the authored shell/Flyover element
/// remains independently registered.
export class DamoclesGamePanelElement extends HTMLElement {
  connectedCallback(): void {
    if (this.dataset['componentReady'] === 'true') {
      return;
    }
    this.dataset['componentReady'] = 'true';
    this.innerHTML = `
      <canvas id="damocles-panel-canvas" width="320" height="64" aria-hidden="true" data-provenance="recovered"></canvas>
      <div class="panel-readouts">
        <div class="nav-row">Body <span data-field="locationName"></span>; Speed <span data-field="speedLabel"></span></div>
        <div class="nav-row">Navigation <span data-field="bodyCoordinates"></span>; Cell <span data-field="locationLabel"></span>; Altitude/range <span data-field="altitude"></span></div>
        <span class="aux-title">DAMOCLES</span>
        Credits <span data-field="cash"></span>; Impact clock <span data-field="clock"></span>.
        <span data-lamp="groundLamp"></span><span data-lamp="attackLamp"></span><span data-lamp="runLamp"></span>
        <span data-field="message"></span>
        <span id="damocles-panel-limits">Temperature and power levels are authored placeholders. The grid font, dynamic computer, switch and detonator layouts are authored. Space navigation layout is unsupported; the retained body-coordinate window is a placeholder in space.</span>
      </div>`;
  }
}

if (customElements.get('damocles-game-panel') === undefined) {
  customElements.define('damocles-game-panel', DamoclesGamePanelElement);
}
