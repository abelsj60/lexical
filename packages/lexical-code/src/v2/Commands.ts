/* eslint-disable header/header */
// eslint-disable-next-line simple-import-sort/imports
import {createCommand, LexicalCommand, LexicalEditor} from 'lexical';
import {LinedCodeNodeTheme} from './LinedCodeNode';

// LinedCodeNode
export const CODE_TO_PLAIN_TEXT_COMMAND: LexicalCommand<boolean> =
  createCommand();
export const SET_LANGUAGE_COMMAND: LexicalCommand<string> = createCommand(); // add
export const TOGGLE_IS_LOCKED_BLOCK: LexicalCommand<void> = createCommand(); // add
export const TOGGLE_LINE_NUMBERS: LexicalCommand<void> = createCommand();
export const TOGGLE_TABS_COMMAND: LexicalCommand<void> = createCommand();
export const UPDATE_THEME_COMMAND: LexicalCommand<LinedCodeNodeTheme> =
  createCommand();

export function dispatchCodeToPlainTextCommand(editor: LexicalEditor) {
  editor.dispatchCommand(CODE_TO_PLAIN_TEXT_COMMAND, undefined);
}
export function dispatchUpdateLanguageCommand(
  editor: LexicalEditor,
  language: string,
) {
  editor.dispatchCommand(SET_LANGUAGE_COMMAND, language);
}
export function dispatchToggleIsLockedBlockCommand(editor: LexicalEditor) {
  editor.dispatchCommand(TOGGLE_IS_LOCKED_BLOCK, undefined);
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

// LinedCodeLineNode
export const ADD_DISCRETE_LINE_CLASSES_COMMAND: LexicalCommand<string> = // add
  createCommand();
export const REMOVE_DISCRETE_LINE_CLASSES_COMMAND: LexicalCommand<string> = // add
  createCommand();

export function dispatchAddDiscreteLineClassesCommand(
  editor: LexicalEditor,
  classes: string,
) {
  editor.dispatchCommand(ADD_DISCRETE_LINE_CLASSES_COMMAND, classes);
}
export function dispatchRemoveDiscreteLineClassesCommand(
  editor: LexicalEditor,
  classes: string,
) {
  editor.dispatchCommand(REMOVE_DISCRETE_LINE_CLASSES_COMMAND, classes);
}
