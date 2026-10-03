const DAMOCLES_PANEL_TAG = 'damocles-panel';

/// The authored Damocles Benson Panel composition for Targ and Flyover (ADR 0027).
/// Actual Damocles gameplay uses its recovered panel element under ADR 0070.
///
/// Light DOM keeps the existing renderer and token layer at the same seam: consumers supply a
/// PanelViewModel instead of maintaining another visual imitation. The temperature, power and
/// capacity gauges have no Targ reading to show, so they stand at the levels the original's
/// opening frame shows (ADR 0027).
///
/// `data-head-controls` adds the Damocles Session's pointer Accommodation (#599): ‹ and › over
/// the Carried Stack head's name, and ✕ over the centre box while a document is open. The
/// renditions that dress Targ data leave it off. The buttons take no focus, so Enter and Space
/// stay game keys rather than pressing the button last clicked.
export class DamoclesPanelElement extends HTMLElement {
  connectedCallback(): void {
    if (this.dataset['componentReady'] === 'true') {
      return;
    }
    this.dataset['componentReady'] = 'true';
    const headControls = this.dataset['headControls'] !== undefined;
    const stackButtons = headControls
      ? `<button type="button" class="stack-rotate" data-rotate="forward" tabindex="-1" aria-label="Rotate the Carried Stack forward" title="Rotate forward ([)">‹</button><button type="button" class="stack-rotate" data-rotate="backward" tabindex="-1" aria-label="Rotate the Carried Stack backward" title="Rotate backward (])">›</button>`
      : '';
    const closeButton = headControls
      ? `<button type="button" id="damocles-centre-close" tabindex="-1" aria-label="Close the document" title="Close (Escape)" hidden>✕</button>`
      : '';
    this.innerHTML = `
      <div class="tp-gauge" style="--tube-fill: var(--temperature-fill)"><div class="tube"><div class="fill" style="--fill-rows: 23"></div></div><div class="tp-label">T</div></div>
      <div id="damocles-message-bar">
        <div id="damocles-message" data-field="message"></div>
        <canvas id="damocles-message-canvas" width="288" height="5" hidden></canvas>
      </div>
      <div id="damocles-body">
        <div id="damocles-nav">
          <div class="nav-row"><div class="nav-lcd readout nav-name" data-field="locationName"></div><div class="nav-lcd readout nav-speed"><span class="compact" data-field="speedLabel"></span></div></div>
          <div class="nav-lower">
            <div id="damocles-elevation" class="readout"><canvas id="damocles-elevation-canvas" class="instrument-canvas" width="11" height="20"></canvas></div>
            <div class="nav-stack">
              <div class="nav-row"><div class="nav-lcd readout nav-body"><span class="compact" data-field="bodyCoordinates"></span></div><div class="nav-lcd readout nav-location"><span class="compact" data-field="locationLabel"></span></div><div class="nav-lcd readout nav-altitude"><span class="compact" data-field="altitude"></span></div></div>
              <div class="nav-foot"><div class="panel-label compact">NAVIGATION</div><div id="damocles-compass" class="readout"><canvas id="damocles-compass-canvas" class="instrument-canvas" width="32" height="9"></canvas></div></div>
            </div>
          </div>
        </div>
        <div id="damocles-aux"><span class="aux-title${(this.dataset['title'] ?? 'TARG').length > 4 ? ' long' : ''}">${this.dataset['title'] ?? 'TARG'}</span><canvas id="damocles-centre-canvas" width="256" height="128" data-provenance="authored" hidden></canvas>${closeButton}</div>
        <div id="damocles-right">
          <div id="damocles-inventory" class="block"><div id="inventory-capacity"><div class="fill" style="--fill-rows: 2"></div></div><div class="inventory-stack"><div id="inventory-head"><div id="inventory-window" class="readout" data-field="inventory"></div>${stackButtons}</div><div class="inventory-foot"><div id="inventory-cash" class="readout"><span class="compact" data-field="cash"></span></div><div class="panel-label compact">INVENTORY</div></div></div></div>
          <div id="damocles-foot"><span class="damocles-lamp" data-lamp="groundLamp"></span><span class="damocles-lamp" data-lamp="attackLamp"></span><span class="damocles-lamp" data-lamp="runLamp"></span><span id="damocles-clock" data-field="clock"></span></div>
        </div>
      </div>
      <div class="tp-gauge" style="--tube-fill: var(--power-fill)"><div class="tube"><div class="fill" style="--fill-rows: 36"></div></div><div class="tp-label">P</div></div>`;
  }
}

if (customElements.get(DAMOCLES_PANEL_TAG) === undefined) {
  customElements.define(DAMOCLES_PANEL_TAG, DamoclesPanelElement);
}
