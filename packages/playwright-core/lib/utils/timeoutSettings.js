"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TimeoutSettings = exports.DEFAULT_TIMEOUT = void 0;

var _utils = require("./utils");

/**
 * Copyright 2019 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const DEFAULT_TIMEOUT = 30000;
exports.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;
const TIMEOUT = (0, _utils.debugMode)() ? 0 : DEFAULT_TIMEOUT;

class TimeoutSettings {
  constructor(parent) {
    this._parent = void 0;
    this._defaultTimeout = null;
    this._defaultNavigationTimeout = null;
    this._parent = parent;
  }

  setDefaultTimeout(timeout) {
    this._defaultTimeout = timeout;
  }

  setDefaultNavigationTimeout(timeout) {
    this._defaultNavigationTimeout = timeout;
  }

  navigationTimeout(options) {
    if (typeof options.timeout === 'number') return options.timeout;
    if (this._defaultNavigationTimeout !== null) return this._defaultNavigationTimeout;
    if (this._defaultTimeout !== null) return this._defaultTimeout;
    if (this._parent) return this._parent.navigationTimeout(options);
    return TIMEOUT;
  }

  timeout(options) {
    if (typeof options.timeout === 'number') return options.timeout;
    if (this._defaultTimeout !== null) return this._defaultTimeout;
    if (this._parent) return this._parent.timeout(options);
    return TIMEOUT;
  }

  static timeout(options) {
    if (typeof options.timeout === 'number') return options.timeout;
    return TIMEOUT;
  }

}

exports.TimeoutSettings = TimeoutSettings;