const DAMOCLES_PANEL_TAG = 'damocles-panel';

/// The authored Damocles Benson Panel composition shared by gameplay and Flyover.
///
/// Light DOM keeps the existing renderer and token layer at the same seam: consumers supply a
/// PanelViewModel instead of maintaining another visual imitation.
export class DamoclesPanelElement extends HTMLElement {
  connectedCallback(): void {
    if (this.dataset['componentReady'] === 'true') {
      return;
    }
    this.dataset['componentReady'] = 'true';
    this.innerHTML = `
      <div id="damocles-message-bar" class="inset">
        <div id="damocles-message" data-field="message"></div>
      </div>
      <div id="damocles-body">
        <div class="tp-gauge inset"><div class="fill" style="height: 34%"></div><div class="tp-label">T</div></div>
        <div id="damocles-nav">
          <div class="nav-row"><div class="nav-lcd" data-field="locationName"></div><div class="nav-lcd" data-field="speedLabel"></div></div>
          <div class="nav-lower">
            <div id="damocles-elevation"><canvas id="damocles-elevation-canvas" class="instrument-canvas" width="42" height="84"></canvas></div>
            <div class="nav-stack">
              <div class="nav-row"><div class="nav-lcd" data-field="locationLabel"></div><div class="nav-lcd" data-field="altitude"></div><div class="nav-lcd" data-field="heading"></div></div>
              <div class="nav-foot"><div class="plabel">NAVIGATION</div><div id="damocles-compass"><canvas id="damocles-compass-canvas" class="instrument-canvas" width="114" height="27"></canvas></div></div>
            </div>
          </div>
        </div>
        <div id="damocles-aux"><span class="aux-title">TARG</span></div>
        <div id="damocles-right">
          <div id="damocles-inventory"><div id="inventory-capacity"><div class="fill" style="height: 4%"></div></div><div class="inventory-stack"><div id="inventory-window" data-field="inventory"></div><div class="inventory-foot"><span id="inventory-cash" data-field="cash"></span><span class="plabel">INVENTORY</span></div></div></div>
          <div id="damocles-foot"><span class="lamp" data-lamp="groundLamp"></span><span class="lamp" data-lamp="attackLamp"></span><span class="lamp" data-lamp="runLamp"></span><span id="damocles-clock" data-field="clock"></span></div>
        </div>
        <div class="tp-gauge inset"><div class="fill" style="height: 52%"></div><div class="tp-label">P</div></div>
      </div>`;
  }
}

if (customElements.get(DAMOCLES_PANEL_TAG) === undefined) {
  customElements.define(DAMOCLES_PANEL_TAG, DamoclesPanelElement);
}
