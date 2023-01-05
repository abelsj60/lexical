/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {createCommand, LexicalCommand, LexicalEditor} from 'lexical';
import {LinedCodeNodeTheme} from './LinedCodeNode';

export const CODE_TO_PLAIN_TEXT_COMMAND: LexicalCommand<void> = createCommand();
export const TOGGLE_LINE_NUMBERS: LexicalCommand<void> = createCommand();
export const TOGGLE_TABS_COMMAND: LexicalCommand<void> = createCommand();
export const UPDATE_THEME_COMMAND: LexicalCommand<LinedCodeNodeTheme> =
  createCommand();

export function dispatchCodeToPlainTextCommand(editor: LexicalEditor) {
  editor.dispatchCommand(CODE_TO_PLAIN_TEXT_COMMAND, undefined);
}
export function dispatchToggleLineNumbersCommand(editor: LexicalEditor) {
  editor.dispatchCommand(TOGGLE_LINE_NUMBERS, undefined);
}
export function dispatchToggleTabsCommand(editor: LexicalEditor) {
  editor.dispatchCommand(TOGGLE_TABS_COMMAND, undefined);
}
export function dispatchUpdateThemeCommand(
  editor: LexicalEditor,
  theme: LinedCodeNodeTheme,
) {
  editor.dispatchCommand(UPDATE_THEME_COMMAND, theme);
}
