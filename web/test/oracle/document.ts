import type { Token } from '../../src/payload/documents.ts';
import type { BensonDocument } from './documents.ts';

export const readOracleDocument = (body: string): BensonDocument => {
  const document: BensonDocument = JSON.parse(body);
  return {
    ...document,
    instructions: document.instructions.map(instruction => ({
      ...instruction,
      ...(instruction.tokens === undefined
        ? {}
        : {
            tokens: instruction.tokens.map((token): Token => ({
              kind: token.kind,
              ...(token.word === undefined ? {} : { word: token.word }),
              ...(token.text === undefined ? {} : { text: token.text }),
              ...(token.slot === undefined ? {} : { slot: token.slot })
            }))
          })
    }))
  };
};
