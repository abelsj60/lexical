/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {useLexicalComposerContext} from '@lexical/react/LexicalComposerContext';
import * as React from 'react';

import {mergeRegister} from '../../../lexical-utils/src';
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  LexicalEditor,
  MOVE_TO_END,
  MOVE_TO_START,
  COMMAND_PRIORITY_EDITOR,
  KEY_TAB_COMMAND,
  PASTE_COMMAND,
} from 'lexical';
import {
  CODE_TO_PLAIN_TEXT_COMMAND,
  TOGGLE_LINE_NUMBERS,
  TOGGLE_TABS_COMMAND,
  UPDATE_THEME_COMMAND,
} from './Commands';
import {
  handleBorders,
  handleDents,
  handleMoveTo,
  handlePlainTextConversion,
  handleShiftingLines,
} from './Handlers';
import {LinedCodeHighlightNode} from './LinedCodeHighlightNode';
import {$isLinedCodeLineNode, LinedCodeLineNode} from './LinedCodeLineNode';
import {$isLinedCodeNode, LinedCodeNode} from './LinedCodeNode';
import {getLinedCodeNode, getLinesFromSelection} from './utils';

function removeHighlightsWithNoTextAfterImportJSON(
  highlightNode: LinedCodeHighlightNode,
) {
  // needed because exportJSON may export an empty highlight node when
  // it has a length of one. exportDOM is fixed via a patch in export
  // algorithm. we can't handle the JSON version in a mutation b/c
  // it destroys history (it stops working after .remove)
  const isBlankString = highlightNode.getTextContent() === '';

  if (isBlankString) {
    highlightNode.remove();
  }
}

function updateHighlightsWhenTyping(highlightNode: LinedCodeHighlightNode) {
  const selection = $getSelection();

  if ($isRangeSelection(selection)) {
    const line = highlightNode.getParent();

    if ($isLinedCodeLineNode(line)) {
      const codeNode = line.getParent();

      if ($isLinedCodeNode(codeNode)) {
        if (!codeNode.isLineCurrent(line)) {
          const {topPoint} = getLinesFromSelection(selection);
          // get lineOffset before update. it may change...
          const lineOffset = line.getLineOffset(topPoint);

          if (codeNode.updateLineCode(line)) {
            line.nextSelection(lineOffset);
          }
        }
      }
    }
  }
}

export function registerCodeHighlightingN(editor: LexicalEditor) {
  if (
    !editor.hasNodes([LinedCodeNode, LinedCodeLineNode, LinedCodeHighlightNode])
  ) {
    throw new Error(
      'CodeHighlightPlugin: LinedCodeNode, LinedCodeLineNode, or LinedCodeHighlightNode not registered on editor',
    );
  }

  return mergeRegister(
    editor.registerNodeTransform(LinedCodeHighlightNode, (node) => {
      const codeNode = getLinedCodeNode();

      if ($isLinedCodeNode(codeNode)) {
        // editor update not doing much here. still using it
        // for safety...
        editor.update(
          () => {
            updateHighlightsWhenTyping(node);
            removeHighlightsWithNoTextAfterImportJSON(node);
          },
          {
            skipTransforms: true,
          },
        );
      }
    }),
    editor.registerCommand(
      CODE_TO_PLAIN_TEXT_COMMAND,
      () => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          return handlePlainTextConversion();
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      TOGGLE_LINE_NUMBERS,
      () => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          codeNode.toggleLineNumbers();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      TOGGLE_TABS_COMMAND,
      () => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          codeNode.toggleTabs();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      UPDATE_THEME_COMMAND,
      (payload) => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          codeNode.updateTheme(payload);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      PASTE_COMMAND,
      (payload) => {
        const clipboardData =
          payload instanceof InputEvent || payload instanceof KeyboardEvent
            ? null
            : payload.clipboardData;
        const codeNode = getLinedCodeNode();
        const isPasteInternal =
          $isLinedCodeNode(codeNode) && clipboardData !== null;

        if (isPasteInternal) {
          // overrides pasting inside an active code node ("internal pasting")
          return codeNode.insertClipboardData_INTERNAL(clipboardData, editor);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      INSERT_PARAGRAPH_COMMAND,
      () => {
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          const anchor = selection.anchor;
          const anchorNode = anchor.getNode();
          const lineNode = anchorNode.getParent();

          if ($isLinedCodeLineNode(lineNode)) {
            lineNode.insertNewAfter();
            return true;
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_TAB_COMMAND,
      (payload) => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          if (codeNode.getSettings().activateTabs) {
            const selection = $getSelection();

            if ($isRangeSelection(selection)) {
              payload.preventDefault();

              return handleDents(
                payload.shiftKey
                  ? 'OUTDENT_CONTENT_COMMAND'
                  : 'INDENT_CONTENT_COMMAND',
              );
            }
          }
        }

        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    ),
    editor.registerCommand(
      KEY_ARROW_UP_COMMAND,
      (payload) => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          if (!payload.altKey) {
            return handleBorders('KEY_ARROW_UP_COMMAND', payload);
          } else {
            return handleShiftingLines('KEY_ARROW_UP_COMMAND', payload);
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      KEY_ARROW_DOWN_COMMAND,
      (payload) => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          if (!payload.altKey) {
            return handleBorders('KEY_ARROW_DOWN_COMMAND', payload);
          } else {
            return handleShiftingLines('KEY_ARROW_DOWN_COMMAND', payload);
          }
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      MOVE_TO_END,
      (payload) => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          return handleMoveTo('MOVE_TO_END', payload);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
    editor.registerCommand(
      MOVE_TO_START,
      (payload) => {
        const codeNode = getLinedCodeNode();

        if ($isLinedCodeNode(codeNode)) {
          return handleMoveTo('MOVE_TO_START', payload);
        }

        return false;
      },
      COMMAND_PRIORITY_LOW,
    ),
  );
}

export default function LinedCodeHighlighterPlugin(): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  React.useEffect(() => {
    return registerCodeHighlightingN(editor);
  }, [editor]);

  return null;
}
