/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as documents from "../documents.js";
import type * as extract from "../extract.js";
import type * as lib_accept from "../lib/accept.js";
import type * as lib_agenda from "../lib/agenda.js";
import type * as lib_completeTask from "../lib/completeTask.js";
import type * as lib_extraction from "../lib/extraction.js";
import type * as lib_reminders from "../lib/reminders.js";
import type * as lib_workflows from "../lib/workflows.js";
import type * as reminders from "../reminders.js";
import type * as tasks from "../tasks.js";
import type * as workflows from "../workflows.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  documents: typeof documents;
  extract: typeof extract;
  "lib/accept": typeof lib_accept;
  "lib/agenda": typeof lib_agenda;
  "lib/completeTask": typeof lib_completeTask;
  "lib/extraction": typeof lib_extraction;
  "lib/reminders": typeof lib_reminders;
  "lib/workflows": typeof lib_workflows;
  reminders: typeof reminders;
  tasks: typeof tasks;
  workflows: typeof workflows;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
