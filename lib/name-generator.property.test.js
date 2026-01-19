const fc = require('fast-check');
const { DeterministicNameGenerator } = require('./name-generator');
const { wordlists } = require('./wordlists');

describe('DeterministicNameGenerator (property tests)', () => {
  test('Property 1: deterministic for same seed + generator_version', () => {
    const generatorVersion = 'prop-test-1';
    const generator = new DeterministicNameGenerator(
      wordlists.adjectives,
      wordlists.nouns,
      generatorVersion
    );

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1 })
          .filter((seed) => typeof seed === 'string' && seed.trim() !== ''),
        (seed) => {
          const a = generator.generate(seed);
          const b = generator.generate(seed);
          expect(a).toEqual(b);
          expect(a.generator_version).toBe(generatorVersion);
        }
      ),
      { numRuns: 200 }
    );
  });
});

