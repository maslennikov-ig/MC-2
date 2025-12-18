/**
 * Type declarations for snowball-stemmers package
 */

declare module 'snowball-stemmers' {
  export interface Stemmer {
    stem(word: string): string;
  }

  export class english {
    constructor();
    stem(word: string): string;
  }

  export class russian {
    constructor();
    stem(word: string): string;
  }

  export class spanish {
    constructor();
    stem(word: string): string;
  }

  export class french {
    constructor();
    stem(word: string): string;
  }

  export class german {
    constructor();
    stem(word: string): string;
  }

  export class portuguese {
    constructor();
    stem(word: string): string;
  }

  export class italian {
    constructor();
    stem(word: string): string;
  }

  export class arabic {
    constructor();
    stem(word: string): string;
  }

  export class turkish {
    constructor();
    stem(word: string): string;
  }

  export class hindi {
    constructor();
    stem(word: string): string;
  }
}
