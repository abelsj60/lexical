/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
// eslint-disable-next-line simple-import-sort/imports
import {
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  // ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  Point,
  RangeSelection,
  SerializedElementNode,
  NodeSelection,
  GridSelection,
} from 'lexical';
import * as Prism from 'prismjs';

import {
  $createCodeHighlightNode,
  $isCodeHighlightNodeN,
  CodeHighlightNodeN,
} from './chnNext';
import {$isCodeNodeN} from './cnNext';

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
    return Prism.tokenize(text, language as Prism.Grammar);
  },
};

type SerializedCodeLineNode = Spread<
  {
    type: 'code-line';
    version: 1;
  },
  SerializedElementNode
>;

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

export class CodeLineNodeN extends ElementNode {
  constructor(key?: NodeKey) {
    super(key);
  }

  static getType() {
    // return 'paragraph';
    return 'code-line';
  }

  static clone(node: CodeLineNodeN): CodeLineNodeN {
    return new CodeLineNodeN(node.__key);
  }

  // append(nodesToAppend: CodeHighlightNodeN[]): this {
  //   if (Array.isArray(nodesToAppend)) {
  //     const self = this.getLatest();
  //     const childrenSize = self.getChildrenSize();
  //     const startingIndex = childrenSize > 0
  //       ? childrenSize - 1
  //       : 0;

  //     // nodesToAppend.forEach((node) => {
  //     //   nodes.push(node);
  //     // });

  //     return super.splice(startingIndex, 0, nodesToAppend);
  //   }

  //   return null;
  // }

  splitLineText(offset: number) {
    const self = this.getLatest();
    const lineText = self.getTextContent();

    const textBeforeSplit = lineText.slice(0, offset);
    const textAfterSplit = lineText.slice(offset, lineText.length);

    return [textBeforeSplit, textAfterSplit];
  }

  tokenizePlainText(text: string): (string | Token)[] {
    const self = this.getLatest();
    const codeNode = self.getParent();

    let language = Prism.languages[DEFAULT_CODE_LANGUAGE];
    let tokenize = PrismTokenizer.tokenize;

    if ($isCodeNodeN(codeNode)) {
      const config = codeNode.getConfig();
      const configLanguage = codeNode.getLanguage() || config.defaultLanguage;
      const configTokenizer = config.tokenizer;

      if (configLanguage) {
        language = Prism.languages[configLanguage];
      }

      if (configTokenizer) {
        tokenize = configTokenizer.tokenize;
      }
    }

    return tokenize(text, language as string);
  }

  getNormalizedTokens(text: string): NormalizedToken[] {
    // this allows for diffing w/o wasting node keys
    if (text.length === 0) return [];

    const self = this.getLatest();
    const tokens = self.tokenizePlainText(text);

    return getNormalizedTokens(tokens);
  }

  getHighlightNodes(text: string): CodeHighlightNodeN[] {
    if (text.length === 0) return [];

    const self = this.getLatest();
    const normalizedTokens = self.getNormalizedTokens(text);

    return normalizedTokens.map((token) => {
      return $createCodeHighlightNode(token.content, token.type);
    });
  }

  nextSelection(aOffset: number, bOffset?: number) {
    const self = this.getLatest();
    const selectStart = aOffset === 0 || self.isEmptyLine();

    if (selectStart) {
      self.selectStart();
    } else {
      const {childFromLineOffset: nextChildA, updatedChildOffset: nextOffsetA} =
        self.getChildFromLineOffset(aOffset);

      if (typeof bOffset === 'undefined' && typeof nextChildA !== 'undefined') {
        nextChildA.select(nextOffsetA, nextOffsetA);
      }

      // else if (typeof bOffset !== 'undefined') {
      //   const {
      //     childFromLineOffset: nextChildB,
      //     updatedChildOffset: nextOffsetB
      //   } = self.getChildFromLineOffset(bOffset);
      //   const selection = $getSelection();

      //   if (selection !== null) {
      //     selection.set(nextChildA, nextOffsetA, nextChildB, nextOffsetB);
      //   }
      // }
    }
  }

  isLineCurrent(): boolean {
    const self = this.getLatest();
    const text = self.getTextContent();
    const children = self.getChildren<CodeHighlightNodeN>();
    const normalizedTokens = self.getNormalizedTokens(text);
    // console.log('--', text, normalizedTokens, self, children);

    // empty text strings can cause length mismatch on paste
    // if (children.length !== normalizedTokens.length) return false;
    // console.log('-')

    return children.every((child, idx) => {
      const expected = normalizedTokens[idx];

      return (
        child.__highlightType === expected.type &&
        child.__text === expected.content
      );
    });
  }

  updateLineCode(): boolean {
    // call .isCurrent() first!
    const self = this.getLatest();
    const text = self.getTextContent();

    if (text.length > 0) {
      const children = self.getChildren();
      const comparison = self.getLineComparison(text);
      const isCurrent = children.every((child, idx) => {
        const expected = comparison[idx];
        return (
          child.__highlightType === expected.type &&
          child.__text === expected.content
        );
      });

      if (!isCurrent) {
        const code = self.getHighlightNodes(text) as CodeHighlightNodeN[];
        self.splice(0, self.getChildrenSize(), code);

        return true;
      }
    }

    return false;
  }

  replaceLineCode(text: string): CodeHighlightNodeN[] {
    const self = this.getLatest();
    const code = self.getHighlightNodes(text) as CodeHighlightNodeN[];

    self.splice(0, self.getChildrenSize(), code);

    return self.getChildren<CodeHighlightNodeN>();
  }

  getLineOffset(point: Point) {
    const previousSiblings = point.getNode().getPreviousSiblings();

    return (
      point.offset +
      previousSiblings.reduce((offset, _node) => {
        return (offset += _node.getTextContentSize());
      }, 0)
    );
  }

  getChildFromLineOffset(lineOffset: number) {
    const self = this.getLatest();
    const children = self.getChildren();
    let updatedChildOffset = lineOffset;

    const childFromLineOffset = children.find((_node) => {
      const textContentSize = _node.getTextContentSize();

      if (textContentSize >= updatedChildOffset) {
        return true;
      }

      updatedChildOffset -= textContentSize;

      return false;
    });

    return {
      childFromLineOffset,
      updatedChildOffset:
        typeof updatedChildOffset === 'number' ? updatedChildOffset : undefined,
    };
  }

  isEndOfLine() {
    const selection = $getSelection();

    if (selection !== null && !$isNodeSelection(selection)) {
      const self = this.getLatest();
      const anchor = selection.anchor;
      const lastChild = self.getLastChild();

      // null === empty line
      if (lastChild !== null) {
        const isLastChild = anchor.key === lastChild.getKey();
        const isLastOffset = anchor.offset === lastChild.getTextContentSize();

        return isLastChild && isLastOffset;
      }
    }

    return false;
  }

  isTabOrSpace(char: string) {
    const isString = typeof char === 'string';
    const isMultipleCharacters = char.length > 1;

    if (!isString || isMultipleCharacters) return false;

    return /[\t ]/.test(char);
  }

  isEmptyLine() {
    const self = this.getLatest();
    return self.getChildrenSize() === 0;
  }

  isStartOfLine() {
    const selection = $getSelection();

    if (selection !== null && !$isNodeSelection(selection)) {
      const isCollapsed = selection.isCollapsed();
      const isOffsetZero = isCollapsed && selection.anchor.offset === 0;

      return isOffsetZero;
    }

    return false;
  }

  isStartOfFirstLine() {
    const self = this.getLatest();
    const isStartOfLine = self.isStartOfLine();
    const isFirstLine = self.getIndexWithinParent() === 0;

    return isStartOfLine && isFirstLine;
  }

  isEndOfLastLine() {
    const self = this.getLatest();
    const codeNode = self.getParent();

    if (codeNode !== null) {
      const childrenSize = codeNode.getChildrenSize();

      const isEndOfLine = self.isEndOfLine();
      const isLastLine = self.getIndexWithinParent() === childrenSize - 1;

      return isEndOfLine && isLastLine;
    }

    return false;
  }

  getFirstCharacterIndex(lineOffset: number): number {
    const self = this.getLatest();
    const text = self.getTextContent();
    const splitText = text.slice(0, lineOffset).split('');
    const allSpaces = splitText.every((char) => {
      return self.isTabOrSpace(char);
    });

    if (allSpaces) return splitText.length;

    return splitText.findIndex((char) => {
      return !self.isTabOrSpace(char);
    });
  }

  collapseAtStart(): boolean {
    // lexical only seems to call this if the offset is 0
    // when the user hits backspace on the first line
    const self = this.getLatest();
    const parent = self.getParent();

    return lineText.slice(0, endIndex > -1 ? endIndex : 0);
  }

  makeSpace(num: number) {
    return ' '.repeat(num);
  }

  insertControlledText(text: string) {
    const selection = $getSelection();

    if (selection !== null && $isRangeSelection(selection)) {
      const isCollapsed = selection.isCollapsed();
      const isStringPayload = typeof text === 'string';

      if (isStringPayload) {
        const {
          topPoint,
          splitText,
          topLine: line,
          lineRangeFromSelection: linesForUpdate,
        } = getLinesFromSelection(selection);

        if (typeof line !== 'undefined' && Array.isArray(linesForUpdate)) {
          if (isCollapsed) {
            // is empty line, help lexical insert initial text
            const code = line.getHighlightNodes(text) as CodeHighlightNodeN[];
            const firstHighlight = line.getFirstChild();

            line.append(...code);

            if (firstHighlight !== null) {
              firstHighlight.select();
            }
          } else if (Array.isArray(splitText)) {
            const lineOffset = line.getLineOffset(topPoint);
            const [textBeforeSplit, textAfterSplit] = splitText;
            const isTopLineEmpty = topPoint.getNode().isEmptyLine();

            if (isTopLineEmpty) {
              // top line of range is an empty line
              line.replaceLineCode(`${text}${textAfterSplit}`);
            } else {
              // bottom line of range is empty line
              line.replaceLineCode(`${textBeforeSplit}${text}`);
            }

            line.nextSelection(isTopLineEmpty ? 1 : lineOffset + 1);
            linesForUpdate.slice(1).forEach((ln) => ln.remove());
          }

          return true;
        }
      }
    }

    return false;
  }

  insertNewAfter(): CodeLineNodeN | ParagraphNode {
    const self = this.getLatest();

    const codeNode = self.getParent();
    const hasBreakOutLine =
      $isCodeNodeN(codeNode) && codeNode.hasBreakOutLine();

    if (hasBreakOutLine) {
      return codeNode.insertNewAfter();
    }

    const selection = $getSelection();

    if ($isRangeSelection(selection)) {
      const {
        topPoint,
        splitText = [],
        topLine: line,
        lineRange: linesForUpdate,
      } = getLinesFromSelection(selection);

      if ($isCodeLineNodeN(line) && Array.isArray(linesForUpdate)) {
        const newLine = $createCodeLineNode();

        const lineOffset = line.getLineOffset(topPoint);
        const firstCharacterIndex = line.getFirstCharacterIndex(lineOffset);
        const lineSpacers =
          firstCharacterIndex > 0
            ? line.getTextContent().slice(0, firstCharacterIndex)
            : '';
        const [beforeSplit, afterSplit] = splitText;
        const trimEnd = afterSplit
          .slice(0, lineSpacers.length)
          .split('')
          .every((char) => {
            return line.isTabOrSpace(char);
          });
        const afterSplitAndSpacers = `${lineSpacers}${
          trimEnd ? afterSplit.trimEnd() : afterSplit
        }`;
        const code = line.getHighlightNodes(afterSplitAndSpacers);

        newLine.append(...code);

        line.insertAfter(newLine);
        line.replaceLineCode(beforeSplit);
        linesForUpdate.slice(1).forEach((ln) => ln.remove());

        const hasChildren = newLine.getChildrenSize() > 0;

        newLine.setDirection(this.getDirection());
        newLine.nextSelection(hasChildren ? lineSpacers.length : 0);

        return newLine;
      }
    }

    return new CodeLineNodeN();
  }

  insertNewAfter() {
    const self = this.getLatest();
    const codeNode = self.getParent();

    if ($isCodeNodeN(codeNode)) {
      const lastLine = codeNode.getLastChild();

      if (lastLine !== null) {
        const prevLine = self.getPreviousSibling();
        const isLastLine = self.getKey() === lastLine.getKey();

        const isEmptyLastLine = isLastLine && self.getChildrenSize() === 0;
        const isEmptySecondToLastLine =
          isLastLine && prevLine?.getChildrenSize() === 0;
        const hasTwoEmptyLastLines = isEmptyLastLine && isEmptySecondToLastLine;

        if (hasTwoEmptyLastLines) {
          prevLine.remove();
          self.remove(); // must be last!

          return codeNode.insertNewAfter();
        }

        const selection = $getSelection();

        if (selection !== null && $isRangeSelection(selection)) {
          const isCollapsed = selection.isCollapsed();

          const {
            topPoint,
            bottomPoint,
            splitText,
            topLine: line,
            lineRangeFromSelection: linesForUpdate,
          } = getLinesFromSelection(selection);
          const isMultiLineRange =
            !isCollapsed && topPoint.key !== bottomPoint.key;

          if (typeof line !== 'undefined' && Array.isArray(linesForUpdate)) {
            const lineSpacers = line.getLineSpacers();
            const newLine = $createCodeLineNode();

            if (!isMultiLineRange) {
              const code = line.getHighlightNodes(
                lineSpacers,
              ) as CodeHighlightNodeN[];
              newLine.append(...code); // append initial code
            } else if (Array.isArray(splitText)) {
              const [textBeforeSplit, textAfterSplit] = splitText;
              let code;

              if (!selection.isBackward()) {
                code = line.getHighlightNodes(
                  `${lineSpacers}${textAfterSplit}`,
                ) as CodeHighlightNodeN[];
              } else {
                // is CodeLineNodeN when a backward selection starts at the bottom
                const newLineText = !$isCodeLineNodeN(bottomPoint.getNode())
                  ? `${lineSpacers}${textAfterSplit}`
                  : lineSpacers;
                code = line.getHighlightNodes(
                  newLineText,
                ) as CodeHighlightNodeN[];
                line.replaceLineCode(textBeforeSplit);
              }

              newLine.append(...code);
              linesForUpdate.slice(1).forEach((ln) => ln.remove());
            }

            // test b/c 0-idx strings make no children!
            const hasChildren = newLine.getChildrenSize() > 0;

            line.insertAfter(newLine);
            newLine.nextSelection(hasChildren ? lineSpacers.length : 0);

            return newLine;
          }
        }
      }
    }

    return null;
  }

  createDOM(config: EditorConfig) {
    const dom = document.createElement('div');
    return dom;
  }

  updateDOM(
    prevNode: CodeHighlightNodeN,
    dom: HTMLElement,
    config: EditorConfig,
  ) {
    return false;
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (node: Node) => ({
        conversion: convertDivElement,
        priority: 0,
      }),
    };
  }

  static importJSON(): CodeLineNodeN {
    // static importJSON(serializedNode: SerializedCodeLineNode): CodeLineNodeN {
    return $createCodeLineNode();
  }

  exportJSON(): SerializedCodeLineNode {
    return {
      ...super.exportJSON(),
      type: 'code-line',
      version: 1,
    };
  }

  canInsertTab(): boolean {
    const selection = $getSelection();

    if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
      return false;
    }

    return true;
  }

  canIndent(): false {
    return false;
  }
}

export function $createCodeLineNode() {
  return new CodeLineNodeN();
}

export function $isCodeLineNodeN(
  node: LexicalNode | CodeLineNodeN | null | undefined,
): node is CodeLineNodeN {
  return node instanceof CodeLineNodeN;
}

function convertDivElement(): DOMConversionOutput {
  return {node: $createCodeLineNode()};
}

function getHighlightNodes(
  tokens: (string | Prism.Token)[],
  forComparison = false,
) {
  const nextLine: (PlainHighlight | CodeHighlightNodeN)[] = [];

    if (isPlainText) {
      line.push({content: token, type: undefined});
    } else {
      const {content, type} = token;

      const isStringToken = typeof content === 'string';
      const isNestedStringToken =
        Array.isArray(content) &&
        content.length === 1 &&
        typeof content[0] === 'string';
      const isNestedTokenArray = Array.isArray(content);

      if (isStringToken) {
        line.push({content: content as string, type});
      } else if (isNestedStringToken) {
        line.push({content: content[0] as string, type});
      } else if (isNestedTokenArray) {
        line.push(...getNormalizedTokens(content));
      }
    }

    return line;
  }, [] as NormalizedToken[]);
}

type BorderPoints = {
  bottomPoint: Point;
  topPoint: Point;
};
type SelectedLines = {
  bottomLine?: CodeLineNodeN;
  lineRange?: CodeLineNodeN[];
  splitText?: string[];
  topLine?: CodeLineNodeN;
};
type PartialLinesFromSelection = BorderPoints & Partial<SelectedLines>;
type LinesFromSelection = BorderPoints & SelectedLines;

export function getLinesFromSelection(selection: RangeSelection) {
  const anchor = selection.anchor;
  const focus = selection.focus;

  const codeNode = getCodeNode();
  const partialLineData = {} as PartialLinesFromSelection;

  const topLine = (getLineFromPoint(topPoint) as CodeLineNodeN) || null;
  const bottomLine = (getLineFromPoint(bottomPoint) as CodeLineNodeN) || null;

  const skipLineSearch =
    !$isCodeNodeN(codeNode) ||
    !$isCodeLineNodeN(topLine) ||
    !$isCodeLineNodeN(bottomLine);

  if (!skipLineSearch) {
    const start = topLine.getIndexWithinParent();
    const end = bottomLine.getIndexWithinParent() + 1;
    const lineData = Object.assign({}, partialLineData) as LinesFromSelection;

    lineData.lineRange = codeNode
      .getChildren<CodeLineNodeN>()
      .slice(start, end);
    lineData.topLine = topLine;
    lineData.bottomLine = bottomLine;

    const topLineOffset = topLine.getLineOffset(lineData.topPoint);
    const bottomLineOffset = bottomLine.getLineOffset(lineData.bottomPoint);

    const [textBefore] = topLine.splitLineText(topLineOffset);
    const [, textAfter] = bottomLine.splitLineText(bottomLineOffset);

    lineData.splitText = [textBefore, textAfter];

    return lineData;
  }

  const codeNode = topLine.getParent();

  if (codeNode === null) {
    return {bottomPoint, topPoint};
  }

  const startingLineIndex = topLine.getIndexWithinParent();
  const endingLineIndex = bottomLine.getIndexWithinParent() + 1;

  const lineRangeFromSelection = codeNode
    .getChildren()
    .slice(startingLineIndex, endingLineIndex) as CodeLineNodeN[];

  const topLineOffset = topLine.getLineOffset(topPoint);
  const bottomLineOffset = bottomLine.getLineOffset(bottomPoint);

  const [textBeforeSplit] = topLine.splitLineText(topLineOffset);
  const [, textAfterSplit] = bottomLine.splitLineText(bottomLineOffset);

  const splitText = [textBeforeSplit, textAfterSplit];

  return {
    bottomLine,
    bottomPoint,
    lineRangeFromSelection,
    splitText,
    topLine,
    topPoint,
  };
}

export function handleMultiLineDelete(
  line: CodeLineNodeN,
  linesForUpdate: CodeLineNodeN[],
  topPoint: Point,
) {
  const originalOffset = topPoint.offset;
  const lineOffset = line.getLineOffset(topPoint);
  const selection = $getSelection();

  if (selection !== null && $isRangeSelection(selection)) {
    const {splitText} = getLinesFromSelection(selection);

    if (Array.isArray(splitText)) {
      const [textBeforeSplit, textAfterSplit] = splitText;

      line.replaceLineCode(`${textBeforeSplit}${textAfterSplit}`);
      linesForUpdate.slice(1).forEach((ln) => ln.remove());

      if (originalOffset === 0) {
        line.selectStart();
      } else {
        const {childFromLineOffset: nextChild, updatedChildOffset: nextOffset} =
          line.getChildFromLineOffset(lineOffset);

        if (typeof nextChild !== 'undefined') {
          nextChild.select(nextOffset, nextOffset);
        }
      }
    }
  }
}

function getLineFromPoint(point: Point) {
  const pointNode = point.getNode();

  if (
    parentNode !== null &&
    $isCodeLineNodeN(parentNode) &&
    parentNode.getChildren().length > 0
  ) {
    return parentNode;
  } else if ($isCodeLineNodeN(pointNode) || $isParagraphNode(pointNode)) {
    return pointNode;
  }

  return null;
}

export function isInsideCodeNode(
  selection: RangeSelection | NodeSelection | GridSelection | null,
) {
  if (!$isRangeSelection(selection)) return false;

  const anchor = selection?.anchor;
  const anchorNode = anchor?.getNode();

  switch (true) {
    case $isCodeHighlightNodeN(anchorNode):
    case $isCodeLineNodeN(anchorNode):
    case $isCodeNodeN(anchorNode):
      return true;
    default:
      return false;
  }
}

export function getCodeNode(): CodeNodeN | null {
  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    const anchor = selection.anchor;
    const anchorNode = anchor.getNode();
    const parentNode = anchorNode.getParent();
    const grandparentNode = parentNode && parentNode.getParent();
    const codeNode =
      [anchorNode, parentNode, grandparentNode].find(
        (node): node is CodeNodeN => {
          return $isCodeNodeN(node);
        },
      ) || null;

    return codeNode;
  }

  return null;
}
