// Leokani G2P: English text to Kokoro-style phonemes, without espeak-ng.

export declare const FORMAT: 'leokani-g2p/1';
export declare const VERSION: string;
export declare const USER_FORMAT: 'leokani-g2p-user/1';
export declare const FILES: { lexicon: string; encoder: string; decoder: string; context: string };

/** A custom pronunciation: "/phonemes/" or a respelling, or an object naming the kind. */
export type Pronunciation = string | { phonemes: string } | { say: string };

/** A user lexicon document (product/data/leokani-g2p-user-lexicon.schema.json). */
export interface UserLexiconDocument {
  format: 'leokani-g2p-user/1';
  words: Record<string, Pronunciation>;
}

export declare class UserLexiconError extends Error {}

export interface UserLexiconEntry { kind: 'phonemes' | 'say'; value: string }

/** Custom pronunciations, checked before the lexicon and before any normaliser rule. */
export declare class UserLexicon {
  constructor(entries?: UserLexicon | UserLexiconDocument | Record<string, Pronunciation> | Map<string, Pronunciation> | null,
    options?: { symbols?: Set<string> | null });
  readonly size: number;
  symbols: Set<string> | null;
  static parse(value: Pronunciation): UserLexiconEntry;
  add(word: string, value: Pronunciation): this;
  delete(word: string): boolean;
  clear(): void;
  update(entries: UserLexicon | UserLexiconDocument | Record<string, Pronunciation> | Map<string, Pronunciation>): this;
  loadJSON(doc: string | UserLexiconDocument | Record<string, Pronunciation>): this;
  loadTSV(text: string, name?: string): this;
  /** JSON if the text starts with "{", otherwise TSV (key TAB value; # comments). */
  load(text: string, options?: { format?: 'json' | 'tsv'; name?: string }): this;
  toJSON(): UserLexiconDocument;
  get(core: string): UserLexiconEntry | null;
  rewrite(core: string): UserLexiconEntry | null;
}

export interface PieceWords {
  phonemes: string;
  forms: string[];
  joins: boolean[];
  sources: Array<'lexicon' | 'oov' | 'number' | 'symbol' | 'empty'>;
}

export declare class LeokaniG2P {
  /** Custom pronunciations; edit at any time. */
  readonly userLexicon: UserLexicon;
  /** The variant load() checked the files against. */
  readonly variant: Variant;
  /** Milliseconds load() took. */
  readonly loadMs: number;
  /** Node: 'onnxruntime-web', 'onnxruntime-node' or 'custom'. */
  readonly backend?: string;
  /** A line or paragraph -> one phoneme string (the chunks joined by a space). */
  phonemize(text: string): Promise<string>;
  /** A line or paragraph -> phonemes, one string per clause chunk. */
  phonemizeChunks(text: string): Promise<string[]>;
  /** One clause with no punctuation -> phonemes. */
  piece(piece: string): Promise<string>;
  pieceWords(piece: string): Promise<PieceWords>;
  /** A line as a person reads it: numbers, money, dates, abbreviations, ... written out. */
  normalize(text: string, pauses?: boolean): string;
  addPronunciation(word: string, value: Pronunciation): this;
  removePronunciation(word: string): boolean;
  /** A document or object, or JSON / TSV text. */
  loadUserLexicon(source: string | UserLexiconDocument | Record<string, Pronunciation>, options?: { format?: 'json' | 'tsv'; name?: string }): this;
  dispose(): Promise<void>;
}

export type Variant = 'micro' | 'mini';
export declare const VARIANTS: Record<Variant, string>;
export declare const DEFAULT_VARIANT: Variant;

export interface LoadOptions {
  /** 'micro' (default, 2.2M letter-to-sound parameters) or 'mini' (2.9M: better on names and rare words). */
  variant?: Variant;
  /** Browsers: the folder (URL) holding the four model files. Default: the package's models/ folder. */
  modelBase?: string | URL;
  /** Node: the folder (path or file: URL) holding the four model files. */
  modelDir?: string | URL;
  /** The files' bytes instead of reading them. */
  files?: Partial<Record<'lexicon' | 'encoder' | 'decoder' | 'context', ArrayBuffer | Uint8Array>>;
  /** Custom pronunciations; in Node also a .json or .tsv path. */
  userLexicon?: UserLexicon | UserLexiconDocument | Record<string, Pronunciation> | string;
  /** Inference threads (default 1). */
  threads?: number;
  /** Browsers: where onnxruntime-web's .wasm file is, if your bundler doesn't copy it. */
  wasmPaths?: string | Record<string, string>;
  /** Node: 'wasm' (default), 'onnxruntime-node' or 'auto'. */
  backend?: 'wasm' | 'onnxruntime-node' | 'auto';
  /** An onnxruntime module to use instead. */
  ort?: unknown;
  /** false: skip the sha256 check of the model files (needed for other model files). */
  sha256?: boolean;
  fetch?: typeof fetch;
  executionProviders?: unknown[];
  sessionOptions?: Record<string, unknown>;
}

export declare function load(options?: LoadOptions): Promise<LeokaniG2P>;
/** The default phonemizer, loaded on first use. */
export declare function getDefault(): Promise<LeokaniG2P>;
export declare function phonemize(text: string): Promise<string>;
export declare function phonemizeChunks(text: string): Promise<string[]>;
/** Node only: add the custom pronunciations in a .json or .tsv file. */
export declare function loadUserLexiconFile(g2p: LeokaniG2P, path: string): Promise<LeokaniG2P>;
export declare function clean(text: string): string;
export declare function chunks(text: string): string[];
export declare function pieces(text: string): string[];
