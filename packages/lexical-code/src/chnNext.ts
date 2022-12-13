/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

// eslint-disable-next-line simple-import-sort/imports
import {
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
} from '../../lexical-utils/src';

type SerializedCodeHighlightNode = Spread<
  {
    highlightType: string | null | undefined;
    type: 'code-highlight';
    version: 1;
  },
  SerializedTextNode
>;

/** @noInheritDoc */

export class CodeHighlightNodeN extends TextNode {
export class CodeHighlightNodeN extends TextNode {
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
    return 'code-highlight';
  }

  static clone(node: CodeHighlightNodeN): CodeHighlightNodeN {
    return new CodeHighlightNodeN(
  static clone(node: CodeHighlightNodeN): CodeHighlightNodeN {
    return new CodeHighlightNodeN(
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
    const element = super.createDOM(config);
    const className = getHighlightThemeClass(
      config.theme,
      this.__highlightType,
    );
    addClassNamesToElement(element, className);
    return element;
  }

  updateDOM(
    prevNode: CodeHighlightNodeN,
    prevNode: CodeHighlightNodeN,
    dom: HTMLElement,
    config: EditorConfig,
  ) {
    const update = super.updateDOM(prevNode, dom, config);
    const prevClassName = getHighlightThemeClass(
      config.theme,
      prevNode.__highlightType,
    );
    const nextClassName = getHighlightThemeClass(
      config.theme,
      this.__highlightType,
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

  // exportDOM(editor: LexicalEditor) {
  //   const test = super.exportDOM(editor);
  //   return { element: test.element };
  // }

  static importJSON(
    serializedNode: SerializedCodeHighlightNode,
  ): CodeHighlightNodeN {
  ): CodeHighlightNodeN {
    const node = $createCodeHighlightNode(
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
    const self = this.getLatest();
    const text = self.getTextContent();
    if (text === '') {
      return {element: null};
    }

    return {...super.exportDOM(editor)};
  }

  exportJSON() {
    const node = {
      ...super.exportJSON(),
      highlightType: this.getHighlightType(),
      type: 'code-highlight',
      version: 1,
    };
    return node;
  }

  // Prevent formatting (bold, underline, etc)
  setFormat(format: number) {
    return this;
  }

  // canInsertTab() {
  //   return true;
  // }
}

export function $createCodeHighlightNode(
  text: string,
  highlightType?: string | null | undefined,
): CodeHighlightNodeN {
  return new CodeHighlightNodeN(text, highlightType);
): CodeHighlightNodeN {
  return new CodeHighlightNodeN(text, highlightType);
}

export function $isCodeHighlightNodeN(
  node: LexicalNode | CodeHighlightNodeN | null | undefined,
): node is CodeHighlightNodeN {
  return node instanceof CodeHighlightNodeN;
export function $isCodeHighlightNodeN(
  node: LexicalNode | CodeHighlightNodeN | null | undefined,
): node is CodeHighlightNodeN {
  return node instanceof CodeHighlightNodeN;
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
