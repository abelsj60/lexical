/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {$generateNodesFromSerializedNodes} from '@lexical/clipboard';
import {$generateNodesFromDOM} from '@lexical/html';
import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isRootNode,
  DOMExportOutput,
  EditorConfig,
  ElementNode,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  ParagraphNode,
  SerializedElementNode,
  Spread,
} from 'lexical';
import {EditorThemeClassName} from 'packages/lexical/src/LexicalEditor';

import {
  addClassNamesToElement,
  removeClassNamesFromElement,
} from '../../../lexical-utils/src';
import {
  $createLinedCodeLineNode,
  $isLinedCodeLineNode,
  LinedCodeLineNode,
} from './LinedCodeLineNode';

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
import {getLinesFromSelection} from './utils';
import {
  convertDivElement,
  convertPreElement,
  convertTableElement,
  isCodeElement,
  isGitHubCodeTable,
} from './DomDecoders';
import {mapToPrismLanguage, Tokenizer} from './Prism';

export type Unserializeable = null;
export interface LinedCodeNodeOptions {
  activateTabs?: boolean | null;
  addPreOnExportDOM?: boolean | null;
  defaultLanguage?: string | null;
  initialLanguage?: string | null;
  isLockedBlock?: boolean | null;
  lineNumbers?: boolean | null;
  theme?: LinedCodeNodeTheme | null;
  tokenizer?: Tokenizer | null;
}

export interface LinedCodeNodeTheme {
  code?: EditorThemeClassName;
  codeLine?: {
    classes?: EditorThemeClassName;
    numberClasses?: EditorThemeClassName;
  };
  codeHighlight?: Record<string, EditorThemeClassName>;
}

export interface SerializableLinedCodeNodeOptions extends LinedCodeNodeOptions {
  tokenizer: Unserializeable;
}

type SerializedCodeNodeN = Spread<
  {
    options: SerializableLinedCodeNodeOptions;
    type: 'code-block';
    version: 1;
  },
  SerializedElementNode
>;

const LANGUAGE_DATA_ATTRIBUTE = 'data-highlight-language';

// review methods and move between cn and cln
// test commands?
// utils

export class LinedCodeNode extends ElementNode {
  /** @internal */
  __activateTabs: boolean | null;
  /** @internal */
  __addPreOnExportDOM: boolean | null;
  /** @internal */
  __defaultLanguage: string | null;
  /** @internal */
  __isLockedBlock: boolean | null;
  /** @internal */
  __language: string | null;
  /** @internal */
  __lineNumbers: boolean | null;
  /** @internal */
  __options: LinedCodeNodeOptions;
  /** @internal */
  __theme: LinedCodeNodeTheme | null;
  /** @internal */
  __tokenizer: Tokenizer | null;

  static getType() {
    return 'code-block';
  }

  static clone(node: LinedCodeNode): LinedCodeNode {
    // must access via getOptions method to prevent staleness!
    return new LinedCodeNode(node.getOptions(), node.__key);
  }

  constructor(options?: LinedCodeNodeOptions, key?: NodeKey) {
    const activateTabs =
      options && typeof options.activateTabs !== 'undefined'
        ? options.activateTabs
        : null;
    const addPreOnExportDOM =
      options && typeof options.addPreOnExportDOM !== 'undefined'
        ? options.addPreOnExportDOM
        : null;
    const defaultLanguage =
      options && typeof options.defaultLanguage !== 'undefined'
        ? options.defaultLanguage
        : null;
    const initialLanguage =
      (options &&
        options.initialLanguage &&
        mapToPrismLanguage(options.initialLanguage)) ||
      null;
    const isLockedBlock =
      options && typeof options.isLockedBlock !== 'undefined'
        ? options.isLockedBlock
        : null;
    const lineNumbers =
      options && typeof options.lineNumbers !== 'undefined'
        ? options.lineNumbers
        : null;
    const theme =
      options && typeof options.theme !== 'undefined' ? options.theme : null;
    const tokenizer =
      options && typeof options.tokenizer !== 'undefined'
        ? options.tokenizer
        : null;

    super(key);

    // config values
    this.__activateTabs = activateTabs;
    this.__addPreOnExportDOM = addPreOnExportDOM;
    this.__defaultLanguage = defaultLanguage;
    this.__isLockedBlock = isLockedBlock;
    this.__language = initialLanguage;
    this.__lineNumbers = lineNumbers;
    this.__theme = theme;
    this.__tokenizer = tokenizer; // set via replacement/defaultVals

    // .__options:
    // 1. We'll use a getter to build an options object on the fly.
    // 2. We build a special serializable version for exportJSON
    // It sets unserializable props to null.
    // 3. Be careful about accessing .__options direclty. It's often
    // stale, but it makes cloning/import easy-peasy. Generally,
    // get it through getOptions().

    this.__options = this.getLatest().getOptions();
  }

  // View

  createDOM(config: EditorConfig): HTMLElement {
    const self = this.getLatest();
    const element = document.createElement('code');
    const {theme} = self.getOptions();
    let codeBlockClasses = config.theme.code;

    if (theme && theme.code) {
      codeBlockClasses = theme.code;
    }

    addClassNamesToElement(element, codeBlockClasses);
    element.setAttribute('spellcheck', 'false');
    const language = this.getLanguage();

    if (language) {
      element.setAttribute(LANGUAGE_DATA_ATTRIBUTE, language);
    }

    return element;
  }

  updateDOM(
    prevNode: LinedCodeNode,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const self = this.getLatest();
    const language = self.__language;
    const prevLanguage = prevNode.__language;
    const {theme} = self.getOptions();
    let codeBlockClasses = config.theme.code;

    if (theme && theme.code) {
      codeBlockClasses = theme.code;
    }

    if (codeBlockClasses) {
      const prevClasses = dom.className;
      const needsUpdate = codeBlockClasses.split(' ').some((cls) => {
        return !dom.classList.contains(cls);
      });

      if (needsUpdate) {
        if (prevClasses) {
          removeClassNamesFromElement(dom, prevClasses);
        }

        addClassNamesToElement(dom, codeBlockClasses);
      }
    }

    if (language) {
      if (language !== prevLanguage) {
        dom.setAttribute(LANGUAGE_DATA_ATTRIBUTE, language);
      }
    } else if (prevLanguage) {
      dom.removeAttribute(LANGUAGE_DATA_ATTRIBUTE);
    }

    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const self = this.getLatest();
    const {element} = super.exportDOM(editor);

    return {
      after: (generatedElement: HTMLElement | null | undefined) => {
        if (generatedElement) {
          if (self.getOptions().addPreOnExportDOM) {
            const preElement = document.createElement('pre');
            preElement.appendChild(generatedElement);

            return preElement;
          }
        }

        return generatedElement;
      },
      element,
    };
  }

  static importDOM() {
    // When dealing with code, we'll let the top-level conversion
    // function handle text. To make this work, we'll also use
    // the 'forChild' callbacks to remove child text nodes.
    return {
      // Typically <pre> is used for code blocks, and <code> for inline code styles
      // but if it's a multi line <code> we'll create a block. Pass through to
      // inline format handled by TextNode otherwise
      code: (node: Node) => {
        const hasPreElementParent =
          node.parentElement instanceof HTMLPreElement;
        const isMultiLineCodeElement =
          node.textContent != null && /\r?\n/.test(node.textContent);

        if (!hasPreElementParent && isMultiLineCodeElement) {
          return {
            conversion: convertPreElement,
            priority: 1,
          };
        }

        return null;
      },
      div: (node: Node) => {
        const isCode = isCodeElement(node as HTMLDivElement);

        if (isCode) {
          return {
            conversion: convertDivElement,
            priority: 1,
          };
        }

        return null;
      },
      pre: (node: Node) => {
        const isPreElement = node instanceof HTMLPreElement;

        if (isPreElement) {
          return {
            conversion: convertPreElement,
            priority: 0,
          };
        }

        return null;
      },
      table: (node: Node) => {
        const table = node; // domNode is a <table> since we matched it by nodeName

        if (isGitHubCodeTable(table as HTMLTableElement)) {
          return {
            conversion: convertTableElement,
            priority: 4,
          };
        }

        return null;
      },
    };
  }

  static importJSON(serializedNode: SerializedCodeNodeN): LinedCodeNode {
    const node = $createLinedCodeNode(serializedNode.options);
    node.setFormat(serializedNode.format); // TODO: kill?
    node.setIndent(serializedNode.indent); // TODO: kill?
    node.setDirection(serializedNode.direction); // TODO: kill?
    return node;
  }

  exportJSON(): SerializedCodeNodeN {
    return {
      ...super.exportJSON(),
      options: this.getLatest().getSerializableOptions(),
      type: 'code-block',
      version: 1,
    };
  }

  hasBreakOutLine(): boolean {
    const self = this.getLatest();

    if (!self.getOptions().isLockedBlock) {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        const lastLine = self.getLastChild<LinedCodeLineNode>();
        const isLastLineSelected =
          lastLine !== null && anchorNode.getKey() === lastLine.getKey();
        const isSelectedLastLineEmpty =
          isLastLineSelected && lastLine.isEmptyLine();

        if (isSelectedLastLineEmpty) {
          const previousLine = lastLine.getPreviousSibling<LinedCodeLineNode>();
          return previousLine !== null && previousLine.isEmptyLine();
        }
      }
    }

    return false;
  }

  // Mutation
  insertNewAfter(): ParagraphNode {
    const self = this.getLatest();
    const lastLine = self.getLastChild() as LinedCodeLineNode;
    const prevLine = lastLine.getPreviousSibling() as LinedCodeLineNode;
    const paragraph = $createParagraphNode();

    paragraph.setDirection(self.getDirection());

    prevLine.remove();
    lastLine.remove();

    self.insertAfter(paragraph);
    paragraph.selectStart();

    return paragraph;
  }

  append(...nodesToAppend: LexicalNode[]): this {
    const isCodeLines = nodesToAppend.every((node) => {
      return $isLinedCodeLineNode(node);
    });

    if (isCodeLines) {
      return super.append(...nodesToAppend);
    }

    return this;
  }

  insertRawText(
    rawText: string,
    startIndex?: number,
    deleteCount?: number,
    selectEnd?: boolean,
  ): LinedCodeLineNode[] {
    const self = this.getLatest();
    const start = startIndex || 0;
    const delCount = deleteCount || self.getChildrenSize();
    const codeLines = rawText.split(/\r?\n/g).reduce((lines, line) => {
      const newLine = $createLinedCodeLineNode();
      const code = newLine.getHighlightNodes(line);

      newLine.append(...code);
      lines.push(newLine);

      return lines;
    }, [] as LinedCodeLineNode[]);

    self.splice(start, delCount, codeLines);

    if (selectEnd) {
      // TODO: re-eval
      const lastLine = self.getLastChild();

      if ($isLinedCodeLineNode(lastLine)) {
        lastLine.selectEnd();
      }
    }

    return codeLines;
  }

  canIndent() {
    return false;
  }

  convertToPlainText(): boolean {
    // CODE_TO_PLAIN_TEXT_COMMAND
    const root = $getRoot();

    if ($isRootNode(root)) {
      const self = this.getLatest();
      const children = self.getChildren();
      const index = self.getIndexWithinParent();

      // must remove before getting plainTextNodes to ensure you get
      // paragraphs not code lines from the nodeReplacer
      self.remove();

      const paragraphs = children.reduce((lines, line) => {
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode(line.getTextContent());

        paragraph.append(textNode);
        lines.push(paragraph);

        return lines;
      }, [] as ParagraphNode[]);

      root.splice(index, 0, paragraphs);
      paragraphs[0].selectStart();

      return true;
    }

    return false;
  }

  collapseAtStart() {
    const self = this.getLatest();

    if (!self.getOptions().isLockedBlock) {
      return self.convertToPlainText();
    }

    return false;
  }

  insertClipboardData_INTERNAL(
    dataTransfer: DataTransfer,
    editor: LexicalEditor,
  ): boolean {
    const self = this.getLatest();
    const htmlString = dataTransfer.getData('text/html');
    const lexicalString = dataTransfer.getData('application/x-lexical-editor');
    const plainString = dataTransfer.getData('text/plain');

    if (htmlString || lexicalString || plainString) {
      const selection = $getSelection();

      if ($isRangeSelection(selection)) {
        const {
          topLine: line,
          lineRange: linesForUpdate,
          splitText,
        } = getLinesFromSelection(selection);

        if ($isLinedCodeLineNode(line)) {
          const lexicalNodes: LexicalNode[] = [];

          if (lexicalString) {
            const {nodes} = JSON.parse(lexicalString);
            lexicalNodes.push(...$generateNodesFromSerializedNodes(nodes));
          } else if (htmlString) {
            const parser = new DOMParser();
            const dom = parser.parseFromString(htmlString, 'text/html');
            lexicalNodes.push(...$generateNodesFromDOM(editor, dom));
          } else {
            lexicalNodes.push($createTextNode(plainString));
          }

          const originalLineIndex = line.getIndexWithinParent();
          const [textBeforeSplit, textAfterSplit] = splitText as string[];

          // Use LexicalNodes here to avoid double linebreaks (\n\n).
          // (CodeNode.getTextContent() inserts double breaks...)
          const normalizedNodesFromPaste = $isLinedCodeNode(lexicalNodes[0])
            ? lexicalNodes[0].getChildren()
            : lexicalNodes;

          const rawText = self.getRawText(
            normalizedNodesFromPaste,
            textBeforeSplit,
            textAfterSplit,
          );
          const newLines = self.insertRawText(
            rawText,
            originalLineIndex,
            (linesForUpdate as LinedCodeLineNode[]).length,
          );

          const lastLine = newLines.slice(-1)[0];
          const nextLineOffset =
            lastLine.getTextContent().length - textAfterSplit.length;

          lastLine.nextSelection(nextLineOffset);

          return true;
        }
      }
    }

    return false;
  }

  getTextContent(): string {
    const self = this.getLatest();
    const children = self.getChildren();

    return self.getRawText(children);
  }

  setLanguage(language: string): boolean {
    const self = this.getLatest();
    const writable = self.getWritable();
    const nextLanguage = mapToPrismLanguage(language);

    if (nextLanguage) {
      writable.__language = nextLanguage;
      self.updateLines(); // keep kids current

      return true;
    }

    return false;
  }

  getLanguage() {
    return this.getLatest().__language;
  }

  getLineNumberStatus() {
    return this.getLatest().__lineNumbers;
  }

  toggleLineNumbers() {
    // TOGGLE_LINE_NUMBERS_COMMAND
    const writable = this.getWritable();

    writable.__lineNumbers = !writable.__lineNumbers;

    return writable.__lineNumbers;
  }

  toggleTabs() {
    // TOGGLE_TABS_COMMAND
    const writable = this.getWritable();

    writable.__activateTabs = !writable.__activateTabs;

    return writable.__activateTabs;
  }

  updateTheme(nextClasses: LinedCodeNodeTheme) {
    // UPDATE_THEME_COMMAND
    const writable = this.getWritable();
    writable.__theme = {
      ...writable.__theme,
      ...nextClasses,
    };

    return writable.__theme;
  }

  getOptions(): LinedCodeNodeOptions {
    const self = this.getLatest();

    return {
      activateTabs: self.__activateTabs,
      addPreOnExportDOM: self.__addPreOnExportDOM,
      defaultLanguage: self.__defaultLanguage,
      initialLanguage: self.__language,
      isLockedBlock: self.__isLockedBlock,
      lineNumbers: self.__lineNumbers,
      theme: self.__theme,
      tokenizer: self.__tokenizer, // unserializable
    };
  }

  getSerializableOptions(): SerializableLinedCodeNodeOptions {
    return {
      ...this.getLatest().getOptions(),
      tokenizer: null,
    };
  }

  getRawText(
    nodes:
      | LexicalNode[]
      | NodeListOf<ChildNode>
      | HTMLCollectionOf<HTMLTableRowElement>,
    leadingText?: string,
    trailingText?: string,
  ) {
    const leading = leadingText || '';
    const trailing = trailingText || '';
    const rawText =
      [...nodes].reduce((linesText, node, idx, arr) => {
        let text = '';

        if ('getTextContent' in node) {
          text = node.getTextContent();
        } else if (node.textContent !== null) {
          text = node.textContent;
        }

        if (text.length > 0) {
          linesText += text;
        }

        if (!text.includes('\n')) {
          if (idx < arr.length - 1) {
            linesText += '\n';
          }
        }

        return linesText;
      }, leading) + trailing;

    return rawText;
  }

  updateLines(): boolean {
    const self = this.getLatest();
    let isUpdated = false;

    self.getChildren().forEach((line) => {
      if ($isLinedCodeLineNode(line)) {
        line.updateLineCode();

        if (!isUpdated) {
          isUpdated = true;
        }
      }
    });

    return isUpdated;
  }

  isShadowRoot(): boolean {
    return true;
  }

  extractWithChild(): boolean {
    return true;
  }
}

export function $createLinedCodeNode(
  options?: LinedCodeNodeOptions,
): LinedCodeNode {
  return $applyNodeReplacement(new LinedCodeNode(options));
}

export function $isLinedCodeNode(
  node: LexicalNode | null | undefined,
): node is LinedCodeNode {
  return node instanceof LinedCodeNode;
}
