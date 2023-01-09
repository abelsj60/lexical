/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import * as Prism from 'prismjs';

import 'prismjs/components/prism-c';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-objectivec';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-swift';

export const DEFAULT_CODE_LANGUAGE = 'javascript';

type TokenContent = string | Token | (string | Token)[];

export interface Token {
  type: string;
  content: TokenContent;
}

export interface NormalizedToken {
  type: string | undefined;
  content: string;
}

export interface Tokenizer {
  tokenize(text: string, language?: string): (string | Token)[];
}

export const PrismTokenizer: Tokenizer = {
  tokenize(text: string, language: string): (string | Token)[] {
    return Prism.tokenize(text, Prism.languages[language]);
  },
};

export const CODE_LANGUAGE_FRIENDLY_NAME_MAP: Record<string, string> = {
  c: 'C',
  clike: 'C-like',
  css: 'CSS',
  html: 'HTML',
  js: 'JavaScript',
  markdown: 'Markdown',
  objc: 'Objective-C',
  plain: 'Plain Text',
  py: 'Python',
  rust: 'Rust',
  sql: 'SQL',
  swift: 'Swift',
  ts: 'TypeScript',
  xml: 'XML',
};

export const CODE_LANGUAGE_MAP: Record<string, string> = {
  javascript: 'js',
  md: 'markdown',
  plaintext: 'plain',
  python: 'py',
  text: 'plain',
};

export function normalizeCodeLang(lang: string) {
  return CODE_LANGUAGE_MAP[lang] || lang;
}

export function getLanguageFriendlyName(lang: string) {
  const _lang = normalizeCodeLang(lang);
  return CODE_LANGUAGE_FRIENDLY_NAME_MAP[_lang] || _lang;
}

export const getDefaultCodeLanguage = (): string => DEFAULT_CODE_LANGUAGE;

export const getCodeLanguages = (): Array<string> =>
  Object.keys(Prism.languages)
    .filter(
      // Prism has several language helpers mixed into languages object
      // so filtering them out here to get langs list
      (language) => typeof Prism.languages[language] !== 'function',
    )
    .sort();

export const mapToPrismLanguage = (language?: string): string | undefined => {
  // eslint-disable-next-line no-prototype-builtins
  return language && Prism.languages.hasOwnProperty(language)
    ? language
    : undefined;
};
