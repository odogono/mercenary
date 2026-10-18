import type { EndgameCombat } from '../payload/documents.ts';

/// The Site Ledger and the commit path that changes it.
///
/// The Reference Build keeps one byte per Site holding three things at once —
/// whether it has been destroyed, which faction owned it, and which reaction it
/// has left to dispatch — and the commit path reads and rewrites that byte in a
/// fixed order. Keeping the bytes rather than a set of destroyed cells is what
/// lets a reaction be spent: a Site restored and struck again has the same
/// destroyed bit as the first time and no reaction behind it.

type SiteRules = EndgameCombat['siteDestruction'];

export type Faction = 'mechanoid' | 'palyar';

/// What a strike committed, and what the session owes the scripts because of it.
export type SiteStrike =
  /// The Site was already destroyed. The impact still happened; nothing else did.
  | { readonly kind: 'inert' }
  /// A neutral Site: destroyed, but counted by neither faction and reacted to
  /// by neither.
  | { readonly kind: 'neutral' }
  /// Destroyed and counted for `faction`, the Site's owner. `site` is its low
  /// id, which names it. `reaction` is the Benson Script the Site had left,
  /// which is absent once it has been spent.
  | {
      readonly faction: Faction;
      readonly kind: 'destroyed';
      readonly reaction: number | undefined;
      readonly site: number;
    }
  /// Destroyed and counted, and the lead it created reached the Gratitude
  /// Threshold: `grateful` is the faction the player has helped. The thanking
  /// script replaces the Site's own reaction, which is left unspent.
  | {
      readonly faction: Faction;
      readonly grateful: Faction;
      readonly kind: 'gratitude';
      readonly reaction: number;
      readonly site: number;
    }
  /// The Anti Time Bomb put the Site back. Nothing was counted, in either
  /// direction, and no reaction was spent.
  | { readonly kind: 'restored' }
  /// The Site was destroyed, but the player was over a different cell when the
  /// shot landed, so nobody was counted and nobody reacted. The bit stays set,
  /// and the Anti Time Bomb does not get a look either.
  | { readonly kind: 'awayFromPlayer' };

const BYTE = 0xff;

export class SiteLedger {
  private readonly rules: SiteRules;
  private readonly table: number[];
  private palyar = 0;
  private mechanoid = 0;

  constructor(rules: SiteRules, table?: readonly number[]) {
    this.rules = rules;
    this.table = [...(table ?? rules.initialTable)];
  }

  /// Restoring a session takes the table and both counters, because the
  /// counters are not implied by the table: a restored Site leaves the count it
  /// caused behind it.
  static restore(
    rules: SiteRules,
    table: readonly number[],
    palyar: number,
    mechanoid: number
  ): SiteLedger {
    const ledger = new SiteLedger(rules, table);
    ledger.palyar = palyar;
    ledger.mechanoid = mechanoid;
    return ledger;
  }

  get bytes(): readonly number[] {
    return this.table;
  }

  get palyarDestroyed(): number {
    return this.palyar;
  }

  get mechanoidDestroyed(): number {
    return this.mechanoid;
  }

  /// The Sites standing destroyed right now, which is what the scripts ask
  /// about and what a comparison is read for.
  destroyedCells(): number[] {
    const destroyed: number[] = [];
    for (const [cell, byte] of this.table.entries()) {
      if ((byte & this.rules.destroyedMask) !== 0) {
        destroyed.push(cell);
      }
    }
    return destroyed;
  }

  /// One shot arriving at one Site, in the order the Reference Build commits it.
  ///
  /// `playerCell` is where the player was when the shot landed. The Reference
  /// Build compares it against the struck cell before it commits anything, so
  /// bombing a Site from over its neighbour destroys it and tells nobody.
  strike(
    cell: number,
    options: {
      readonly playerCell: number;
      readonly restorationCarried: boolean;
    }
  ): SiteStrike {
    const rules = this.rules;
    const before = this.table[cell]!;
    // The impact sets the destroyed bit before anything decides what it meant.
    this.table[cell] = before | rules.destroyedMask;

    if (rules.requiresPlayerCell && options.playerCell !== cell) {
      return { kind: 'awayFromPlayer' };
    }

    // Carrying the Anti Time Bomb turns the strike around, and the count and
    // the reaction are both skipped whatever the Site was before.
    if (options.restorationCarried) {
      this.table[cell] = before & rules.restorationKeepMask;
      return { kind: 'restored' };
    }

    // A Site already destroyed changed nothing, so nothing follows from it.
    if (before === this.table[cell]) {
      return { kind: 'inert' };
    }

    const byte = this.table[cell]!;
    if ((byte & rules.neutralMask) !== 0) {
      return { kind: 'neutral' };
    }

    const faction: Faction =
      (byte & rules.mechanoidMask) !== 0 ? 'mechanoid' : 'palyar';
    if (faction === 'mechanoid') {
      this.mechanoid = (this.mechanoid + 1) & BYTE;
    } else {
      this.palyar = (this.palyar + 1) & BYTE;
    }
    const site = byte & rules.lowIdMask;

    // The lead is one byte wide and the negative arm complements it before
    // comparing, so the two factions reach their thresholds one apart.
    const objective = rules.factionObjective;
    const difference = (this.mechanoid - this.palyar) & BYTE;
    const trailing = (difference & 0x80) !== 0;
    const lead = trailing ? difference ^ BYTE : difference;
    if (lead >= objective.threshold) {
      return {
        faction,
        grateful: trailing ? 'mechanoid' : 'palyar',
        kind: 'gratitude',
        reaction: trailing ? objective.mechanoidScript : objective.palyarScript,
        site
      };
    }

    if (site === 0) {
      return { faction, kind: 'destroyed', reaction: undefined, site };
    }
    // A dispatched reaction is spent: the Site keeps everything but its id.
    this.table[cell] = byte & rules.reactionWipeMask;
    return {
      faction,
      kind: 'destroyed',
      reaction: rules.reactionDispatchBase | site,
      site
    };
  }
}
