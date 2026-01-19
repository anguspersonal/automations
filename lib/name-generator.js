const crypto = require('crypto');
const { wordlists } = require('./wordlists');

class DeterministicNameGenerator {
  constructor(adjectives, nouns, generatorVersion) {
    if (!Array.isArray(adjectives) || adjectives.length === 0) {
      throw new Error('adjectives wordlist must be a non-empty array');
    }
    if (!Array.isArray(nouns) || nouns.length === 0) {
      throw new Error('nouns wordlist must be a non-empty array');
    }
    if (!generatorVersion || String(generatorVersion).trim() === '') {
      throw new Error('generatorVersion must be a non-empty string');
    }

    this.adjectives = adjectives;
    this.nouns = nouns;
    this.version = String(generatorVersion);
  }

  generate(seed) {
    if (typeof seed !== 'string' || seed.trim() === '') {
      throw new Error('seed must be a non-empty string');
    }

    const hash = crypto
      .createHash('sha256')
      .update(seed)
      .update(this.version)
      .digest('hex');

    const adjIndex = parseInt(hash.substring(0, 8), 16) % this.adjectives.length;
    const nounIndex = parseInt(hash.substring(8, 16), 16) % this.nouns.length;

    const adjective = this.adjectives[adjIndex];
    const noun = this.nouns[nounIndex];
    const slug = `${adjective}-${noun}`;

    return {
      name: `Sprint ${slug}`,
      slug,
      generator_version: this.version,
    };
  }
}

function getNameGenerator() {
  // Keep a singleton across module reloads (useful for tests/dev).
  const globalKey = '__automations_name_generator_instance__';
  if (!globalThis[globalKey]) {
    const version = process.env.GENERATOR_VERSION || '1.0.0';
    globalThis[globalKey] = new DeterministicNameGenerator(
      wordlists.adjectives,
      wordlists.nouns,
      version
    );
  }
  return globalThis[globalKey];
}

module.exports = {
  DeterministicNameGenerator,
  getNameGenerator,
};

