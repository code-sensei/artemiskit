/**
 * Typo mutation - introduces typos to test robustness
 */

import type { Mutation } from './index';
import { MUTATION_CVSS_SCORES, type CvssScore } from '../severity';

export class TypoMutation implements Mutation {
  readonly name = 'typo';
  readonly description = 'Introduces random typos to test input robustness';
  readonly severity = 'low' as const;
  readonly cvssScore: CvssScore = MUTATION_CVSS_SCORES.typo;

  private typoRate: number;

  constructor(typoRate = 0.1) {
    this.typoRate = typoRate;
  }

  mutate(prompt: string): string {
    const words = prompt.split(' ');
    const mutatedWords = words.map((word) => {
      if (Math.random() < this.typoRate && word.length > 2) {
        return this.introduceTypo(word);
      }
      return word;
    });
    return mutatedWords.join(' ');
  }

  private introduceTypo(word: string): string {
    const typoTypes = ['swap', 'delete', 'duplicate', 'replace'];
    const typoType = typoTypes[Math.floor(Math.random() * typoTypes.length)];
    const pos = Math.floor(Math.random() * (word.length - 1)) + 1;

    switch (typoType) {
      case 'swap':
        if (pos < word.length - 1) {
          return word.slice(0, pos) + word[pos + 1] + word[pos] + word.slice(pos + 2);
        }
        return word;
      case 'delete':
        return word.slice(0, pos) + word.slice(pos + 1);
      case 'duplicate':
        return word.slice(0, pos) + word[pos] + word.slice(pos);
      case 'replace': {
        const nearby = this.getNearbyKey(word[pos]);
        return word.slice(0, pos) + nearby + word.slice(pos + 1);
      }
      default:
        return word;
    }
  }

  private getNearbyKey(char: string): string {
    const keyboard: Record<string, string> = {
      q: 'wa',
      w: 'qeas',
      e: 'wrd',
      r: 'etf',
      t: 'ryg',
      y: 'tuh',
      u: 'yij',
      i: 'uok',
      o: 'ipl',
      p: 'ol',
      a: 'qws',
      s: 'awde',
      d: 'serf',
      f: 'drtg',
      g: 'ftyh',
      h: 'gyuj',
      j: 'huik',
      k: 'jiol',
      l: 'kop',
      z: 'asx',
      x: 'zsd',
      c: 'xdf',
      v: 'cfg',
      b: 'vgh',
      n: 'bhj',
      m: 'njk',
    };
    const lowerChar = char.toLowerCase();
    const options = keyboard[lowerChar] || lowerChar;
    const replacement = options[Math.floor(Math.random() * options.length)];
    return char === char.toUpperCase() ? replacement.toUpperCase() : replacement;
  }
}
