/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Autopilot logo silhouette path — a hexagonal gear shape symbolizing automation.
// The aquarium cannot use an SVG file directly because each fish renders the
// logo as live, same-document SVG geometry: fish.ts stores this path in a
// shared <symbol>, then renders clipped <use> slices with staggered CSS
// animations. That keeps the swimming-strip effect, currentColor species
// tinting, and auxiliary-window support while avoiding duplicate path parsing
// per fish.
export const VSCODE_LOGO_PATH = 'M45 5 L82 27 L82 63 L45 85 L8 63 L8 27 Z M45 20 L72 37 L72 55 L45 72 L18 55 L18 37 Z';