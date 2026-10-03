/// The actual Gameplay Session's recovered panel canvas and accessible controls.
/// The authored shell/Flyover element remains independently registered.
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
      </div>
      <div id="inventory-head">
        <button id="inventory-window" type="button" data-field="inventory" aria-label="Open the carried head" aria-describedby="damocles-panel-limits"></button>
        <button type="button" class="stack-rotate" data-rotate="forward" aria-label="Rotate the Carried Stack forward" title="Rotate forward ([)">‹</button>
        <button type="button" class="stack-rotate" data-rotate="backward" aria-label="Rotate the Carried Stack backward" title="Rotate backward (])">›</button>
      </div>
      <div id="damocles-aux">
        <canvas id="damocles-centre-canvas" width="64" height="32" role="button" tabindex="0" aria-label="Read the open document" hidden></canvas>
        <button type="button" id="damocles-centre-close" aria-label="Close the document" title="Close (Escape)" hidden>✕</button>
        <div id="damocles-centre-actions" hidden>
          <button class="panel-action" type="button" data-command="previous" aria-label="Previous item or decrease value">−</button>
          <button class="panel-action" type="button" data-command="read" aria-label="Read or activate the open item">Read</button>
          <button class="panel-action" type="button" data-command="next" aria-label="Next item or increase value">+</button>
          <button class="panel-action" type="button" data-command="parameter" aria-label="Next AUTHORS COMPUTER parameter" hidden>Parameter</button>
        </div>
      </div>`;
  }
}

if (customElements.get('damocles-game-panel') === undefined) {
  customElements.define('damocles-game-panel', DamoclesGamePanelElement);
}
