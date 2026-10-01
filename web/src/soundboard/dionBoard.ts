import { button, card } from './cards.ts';
import type { DionBoardCommand } from './dionProgram.ts';

export const installDionBoard = (
  board: HTMLElement,
  play: (commands: readonly DionBoardCommand[]) => Promise<void>,
  stop: () => void
): void => {
  for (const [title, description, cue] of [
    [
      'Key click',
      'The TAXICARD and taxi controls: the same one-second tone as Damocles’s shared effect.',
      'key_click'
    ],
    [
      'Prison door moving',
      'The same looping tone and noise as Damocles’s doors. Play the stop burst to finish it.',
      'door_moving'
    ],
    [
      'Prison door stop',
      'The shared four-tick noise burst, then METIS’s silent ambient programme.',
      'door_stop'
    ],
    [
      'Taxi set-down',
      'Taxi descent: noise swells and flutters to silence over 55 ticks.',
      'taxi_set_down'
    ],
    [
      'Lift-off',
      'Taxi departure: a 41-tick swell, then the continuous taxi engine.',
      'lift_off'
    ],
    [
      'Leave',
      'Leaving the taxi: engine tone and noise fade out over 101 ticks.',
      'leave'
    ]
  ] as const) {
    button(
      card(board, title, description),
      'Play',
      () => void play([{ cue, kind: 'cue' }])
    );
  }

  let control = 0;
  const engine = card(
    board,
    'Taxi engine',
    'Tone and noise follow the taxi’s speed class, with a gradual pitch change at constant volume. Lift-off and leave use the same setting.'
  );
  button(
    engine,
    'Start',
    () =>
      void play([
        { kind: 'control', value: control },
        { cue: 'engine', kind: 'cue' }
      ])
  );
  button(engine, 'Stop', stop);
  const controlLabel = document.createElement('label');
  controlLabel.textContent = 'Taxi speed class';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '7';
  input.value = String(control);
  input.addEventListener('input', () => {
    control = Number(input.value);
    void play([{ kind: 'control', value: control }]);
  });
  controlLabel.append(input);
  engine.after(controlLabel);

  const message = card(
    board,
    'Message tone',
    'The scrolling text sounds for 36 ticks. It follows the shared character sequence, at half Damocles’s pitch; spaces are silent.'
  );
  const text = document.createElement('input');
  text.value = 'WELCOME TO METIS';
  text.maxLength = 48;
  text.setAttribute('aria-label', 'Mercenary III message text');
  message.before(text);
  button(
    message,
    'Type',
    () =>
      void play([
        { kind: 'message', text: text.value.toUpperCase().slice(0, 48) }
      ])
  );

  button(
    card(
      board,
      'Cell-crossing cut',
      'Cuts channels B and C immediately. A running engine or door programme sounds again on the next tick.'
    ),
    'Cut channels',
    () => void play([{ cue: 'cut', kind: 'cue' }])
  );
  button(board, 'Stop Mercenary III', stop);
};
