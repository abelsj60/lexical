/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {
  $createLineBreakNode,
  DOMExportOutput,
  EditorConfig,
  EditorThemeClasses,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  SerializedTextNode,
  Spread,
  TextNode,
} from 'lexical';

import {
  addClassNamesToElement,
  removeClassNamesFromElement,
} from '../../../lexical-utils/src';
import {$isLinedCodeNode} from './LinedCodeNode';
import {getLinedCodeNode} from './utils';

type SerializedLinedCodeHighlightNode = Spread<
  {
    highlightType: string | null | undefined;
    type: 'code-text';
    version: 1;
  },
  SerializedTextNode
>;

/** @noInheritDoc */
export class LinedCodeHighlightNode extends TextNode {
  /** @internal */
  __highlightType: string | null | undefined;

  constructor(
    text: string,
    highlightType?: string | null | undefined,
    key?: NodeKey,
  ) {
    super(text, key);
    this.__highlightType = highlightType;
  }

  static getType() {
    return 'code-text';
  }

  static clone(node: LinedCodeHighlightNode): LinedCodeHighlightNode {
    return new LinedCodeHighlightNode(
      node.__text,
      node.__highlightType || undefined,
      node.__key,
    );
  }

  getHighlightType() {
    const self = this.getLatest();
    return self.__highlightType;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const self = this.getLatest();
    const codeNode = getLinedCodeNode();
    let highlightTheme = config.theme;

    if ($isLinedCodeNode(codeNode)) {
      const {theme} = codeNode.getOptions();

      if (theme && theme.codeHighlight) {
        highlightTheme = theme.codeHighlight;
      }
    }

    const element = super.createDOM(config);
    const className = getHighlightThemeClass(
      highlightTheme,
      self.__highlightType,
    );

    addClassNamesToElement(element, className);

    return element;
  }

  updateDOM(
    prevNode: TextNode,
    dom: HTMLElement,
    config: EditorConfig,
  ): boolean {
    const update = super.updateDOM(prevNode, dom, config);

    const self = this.getLatest();
    const codeNode = getLinedCodeNode();
    let highlightTheme = config.theme;

    if ($isLinedCodeNode(codeNode)) {
      const {theme} = codeNode.getOptions();

      if (theme && theme.codeHighlight) {
        highlightTheme = theme.codeHighlight;
      }
    }

    const prevClassName = getHighlightThemeClass(
      highlightTheme,
      prevNode.__highlightType,
    );
    const nextClassName = getHighlightThemeClass(
      highlightTheme,
      self.__highlightType,
    );

    if (prevClassName !== nextClassName) {
      if (prevClassName) {
        removeClassNamesFromElement(dom, prevClassName);
      }

      if (nextClassName) {
        addClassNamesToElement(dom, nextClassName);
      }
    }

    return update;
  }

  static importJSON(
    serializedNode: SerializedLinedCodeHighlightNode,
  ): LinedCodeHighlightNode {
    // note: can't fix blank strings here b/c there's no way to remove
    // the node that's being created from the function's return value
    // may be able to fix in CodeLineNode or in a core command
    const node = $createLinedCodeHighlightNode(
      serializedNode.text,
      serializedNode.highlightType,
    );
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);

    return node;
  }

  canBeEmpty() {
    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const {element} = super.exportDOM(editor);

    if (element) {
      const isBlankString = element.innerText === '';
      // if the point is at the last character of a line, Lexical
      // will pick up the last highlightNode with a blank string
      const hasPreviousSiblings = this.getPreviousSiblings().length > 0;

      if (isBlankString && hasPreviousSiblings) {
        const lineBreak = $createLineBreakNode();
        return {...lineBreak.exportDOM(editor)};
      }
    }

    return {
      element,
    };
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      highlightType: this.getLatest().getHighlightType(),
      type: 'code-text',
      version: 1,
    };
  }

  // Prevent formatting (bold, underline, etc)
  setFormat(format: number) {
    return this;
  }
}

export function $createLinedCodeHighlightNode(
  text: string,
  highlightType?: string | null | undefined,
): LinedCodeHighlightNode {
  return new LinedCodeHighlightNode(text, highlightType);
}

export function $isLinedCodeHighlightNode(
  node: LexicalNode | LinedCodeHighlightNode | null | undefined,
): node is LinedCodeHighlightNode {
  return node instanceof LinedCodeHighlightNode;
}

function getHighlightThemeClass(
  theme: EditorThemeClasses,
  highlightType: string | null | undefined,
): string | null | undefined {
  return (
    highlightType &&
    theme &&
    theme.codeHighlight &&
    theme.codeHighlight[highlightType]
  );
}
