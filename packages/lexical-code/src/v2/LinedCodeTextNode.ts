/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {
  $createLineBreakNode,
  DOMExportOutput,
  EditorConfig,
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
import {$getLinedCodeNode, getHighlightThemeClass} from './utils';

type SerializedLinedCodeTextNode = Spread<
  {
    highlightType: string | null | undefined;
    type: 'code-text';
    version: 1;
  },
  SerializedTextNode
>;

/** @noInheritDoc */
export class LinedCodeTextNode extends TextNode {
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

  static clone(node: LinedCodeTextNode): LinedCodeTextNode {
    return new LinedCodeTextNode(
      node.__text,
      node.__highlightType || undefined,
      node.__key,
    );
  }

  // View

  createDOM(config: EditorConfig): HTMLElement {
    const self = this.getLatest();
    const codeNode = $getLinedCodeNode();
    let highlightTheme = config.theme;

    if ($isLinedCodeNode(codeNode)) {
      const {theme} = codeNode.getSettings();

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
    const codeNode = $getLinedCodeNode();
    let highlightTheme = config.theme;

    if ($isLinedCodeNode(codeNode)) {
      const {theme} = codeNode.getSettings();

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
    serializedNode: SerializedLinedCodeTextNode,
  ): LinedCodeTextNode {
    // note: can't fix blank strings here b/c there's no way to remove
    // the node that's being created from the function's return value
    // may be able to fix in CodeLineNode or in a core command
    const node = $createLinedCodeTextNode(
      serializedNode.text,
      serializedNode.highlightType,
    );
    node.setFormat(serializedNode.format);
    node.setDetail(serializedNode.detail);
    node.setMode(serializedNode.mode);
    node.setStyle(serializedNode.style);

    return node;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const {element} = super.exportDOM(editor);

    if (element) {
      const isBlankString = element.innerText === '';
      // If the point is at the last character of a line, Lexical
      // will create a highlightNode with a blank string ('').
      // This is no good, so we counteract it here.
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

  // Mutation

  // Prevent formatting (bold, underline, etc)
  setFormat(format: number) {
    return this;
  }

  // Helpers

  getHighlightType() {
    const self = this.getLatest();
    return self.__highlightType;
  }

  canBeEmpty() {
    return false;
  }
}

export function $createLinedCodeTextNode(
  text: string,
  highlightType?: string | null | undefined,
): LinedCodeTextNode {
  return new LinedCodeTextNode(text, highlightType);
}

export function $isLinedCodeTextNode(
  node: LexicalNode | LinedCodeTextNode | null | undefined,
): node is LinedCodeTextNode {
  return node instanceof LinedCodeTextNode;
}
