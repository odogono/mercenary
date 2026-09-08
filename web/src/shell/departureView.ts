import type { DepartureDirector, Destination } from './departure.ts';

/// The Departure's Browser Shell chrome: the carousel of Destinations laid over the deep-space
/// frame, and the one control that can hurry the journey.
///
/// Two pieces, deliberately in two places. The carousel — kicker, name, place and Commit — sits
/// over the canvas, because it is what the deep-space frame is for. Skip sits in the page chrome
/// below the authored frame, because it exists only during the journey and must vanish at the
/// join without the picture changing: the prototype found chrome moving at the title card reads
/// as a cut (`docs/research/departure-opening-prototype.md`).
///
/// The markup declares the containers; this fills the track from the Destinations that exist, so
/// the page never lists an entry the app cannot commit to.

export interface DepartureViewElements {
  /// The Commit button inside the carousel.
  readonly commit: HTMLButtonElement;
  /// The carousel section over the canvas.
  readonly root: HTMLElement;
  /// The Skip button in the page chrome.
  readonly skip: HTMLButtonElement;
  /// The track the Destination entries are laid out along.
  readonly track: HTMLElement;
}

export interface DepartureViewOptions {
  readonly destinations: readonly Destination[];
  readonly elements: DepartureViewElements;
  readonly onCommit: () => void;
  readonly onSkip: () => void;
}

export interface DepartureView {
  readonly update: (director: DepartureDirector) => void;
}

const entryElement = (destination: Destination): HTMLElement => {
  const entry = document.createElement('article');
  entry.className = 'departure-destination';
  entry.dataset['destination'] = destination.slug;
  const kicker = document.createElement('div');
  kicker.className = 'departure-kicker';
  kicker.textContent = 'DESTINATION';
  const name = document.createElement('h1');
  name.className = 'departure-name';
  name.textContent = destination.name;
  const place = document.createElement('div');
  place.className = 'departure-place';
  place.textContent = destination.place;
  entry.append(kicker, name, place);
  return entry;
};

export const installDepartureView = (
  options: DepartureViewOptions
): DepartureView => {
  const { commit, root, skip, track } = options.elements;
  track.replaceChildren(
    ...options.destinations.map(destination => entryElement(destination))
  );
  commit.addEventListener('click', options.onCommit);
  skip.addEventListener('click', options.onSkip);

  let shownPhase: string | undefined;
  return {
    update: director => {
      const phase = director.current().kind;
      const atCarousel = director.atCarousel();
      const inJourney = director.inJourney();
      if (phase !== shownPhase) {
        shownPhase = phase;
        root.hidden = !atCarousel;
        skip.hidden = !inJourney;
        // A control that has just gone must not keep the keyboard: the keys are the game's
        // from the join, and the Arrival's from the commit.
        const focused = document.activeElement as HTMLElement | null;
        if (
          focused !== null &&
          ((root.hidden && root.contains(focused)) ||
            (skip.hidden && focused === skip))
        ) {
          focused.blur();
        }
      }
      if (atCarousel) {
        const position = director.carouselPosition();
        track.style.transform = `translateX(${-position * 100}%)`;
        const selected = director.selected().slug;
        for (const entry of track.children) {
          const current =
            (entry as HTMLElement).dataset['destination'] === selected;
          if (current) {
            entry.setAttribute('aria-current', 'true');
          } else {
            entry.removeAttribute('aria-current');
          }
        }
      }
    }
  };
};
