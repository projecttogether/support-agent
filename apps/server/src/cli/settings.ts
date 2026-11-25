import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import type { CheckResult } from "@support-agent/shared/api/common";
import { operator, type Actor } from "../auth/principal";
import { entityId } from "../http/json";
import { UsageError, type CliIo } from "./io";

export type SettingStatus = {
  state: "set" | "not set" | "incomplete";
  /** What the admin page shows at a glance: names, addresses, `key …a1b2`. Never a secret. */
  hints: string[];
};

export type OptionValues = Record<string, string | boolean | undefined>;

/** Options of `show` or `test` beyond `--id`, e.g. Slack's `--channels`. */
type ExtraOptions = { options: ParseArgsOptionsConfig; usage: string };

type Common = {
  /** Kebab-case, as on the admin page. */
  name: string;
  /** One line for `cli help`. */
  label: string;
  showOptions?: ExtraOptions;
  testOptions?: ExtraOptions;
};

/**
 * A setting of the admin interface that exists once (Slack, the Settings
 * page). Each one calls the same functions as the page's routes; it adds no
 * checks of its own.
 */
export type SingleSetting = Common & {
  kind: "single";
  status(): Promise<SettingStatus>;
  /** What the admin API's read answers: hints, never a secret. */
  show(options: OptionValues): Promise<unknown>;
  /** Saves the JSON body the admin page sends (the text from stdin); answers what `show` answers. */
  apply(actor: Actor, body: string): Promise<unknown>;
  /** What the page's test button does, where it has one. */
  test?(options: OptionValues): Promise<CheckResult>;
};

/** A list of entries with IDs (providers, knowledge sources, agents), with the same rules. */
export type ListSetting = Common & {
  kind: "list";
  /** The hint of `list` when there is no entry, e.g. "no providers yet". */
  none: string;
  entries(): Promise<(SettingStatus & { id: string })[]>;
  /** Without an ID, every entry as the page's list reads them; with one, that entry. */
  show(id: string | undefined, options: OptionValues): Promise<unknown>;
  /** Creates an entry from the body of the page's "Add" dialog; answers what `show --id` answers. */
  create(actor: Actor, body: string): Promise<{ id: string }>;
  /** Saves the body of the page's edit form; answers what `show --id` answers. */
  update(actor: Actor, id: string, body: string): Promise<unknown>;
  remove(actor: Actor, id: string): Promise<void>;
  test?(id: string, options: OptionValues): Promise<CheckResult>;
};

export type Setting = SingleSetting | ListSetting;

type Row = SettingStatus & { name: string; id: string | null };

const USAGE = "cli settings list|show|apply|remove|test <name> [--id <id>]";

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** The options of a command. Messages never repeat what was typed: it could be a secret. */
function parse(args: string[], options: ParseArgsOptionsConfig, usage: string): OptionValues {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args, options, strict: true, allowPositionals: true });
  } catch (error) {
    const known = (error as { code?: unknown }).code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE";
    throw new UsageError(known ? `${(error as Error).message}.` : "Unknown option.", usage);
  }
  if (parsed.positionals.length > 0) {
    throw new UsageError("Too many arguments. A body goes on stdin, never in an argument.", usage);
  }
  return parsed.values as OptionValues;
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

async function rows(settings: Setting[]): Promise<Row[]> {
  const result: Row[] = [];
  for (const setting of settings) {
    if (setting.kind === "single") {
      result.push({ name: setting.name, id: null, ...(await setting.status()) });
      continue;
    }
    const entries = await setting.entries();
    if (entries.length === 0)
      result.push({ name: setting.name, id: null, state: "not set", hints: [setting.none] });
    for (const { id, ...status } of entries) result.push({ name: setting.name, id, ...status });
  }
  return result;
}

/**
 * `cli settings …`: list, show, apply, remove and test the settings of the
 * admin interface, as an operator with an admin's rights. Returns the exit code.
 */
export async function settingsCommand(args: string[], io: CliIo, settings: Setting[]): Promise<number> {
  const names = settings.map((setting) => setting.name).join(", ");
  const [command, ...rest] = args;

  if (command === "list") {
    const values = parse(rest, { json: { type: "boolean" } }, "cli settings list [--json]");
    const listed = await rows(settings);
    if (values.json) {
      io.out(json(listed));
      return 0;
    }
    const labels = listed.map((row) => (row.id === null ? row.name : `${row.name} --id ${row.id}`));
    const width = Math.max(...labels.map((label) => label.length));
    listed.forEach((row, index) => {
      io.out(
        `${labels[index]!.padEnd(width)}  ${row.state.padEnd(10)}  ${row.hints.join(", ")}`.trimEnd() + "\n",
      );
    });
    return 0;
  }

  if (command !== "show" && command !== "apply" && command !== "remove" && command !== "test") {
    throw new UsageError("Unknown command.", USAGE);
  }
  const [name, ...optionArgs] = rest;
  const usage = `cli settings ${command} <name>`;
  if (!name || name.startsWith("-")) throw new UsageError(`Name the setting: ${names}.`, usage);
  const setting = settings.find((candidate) => candidate.name === name);
  if (!setting) throw new UsageError(`Unknown setting. The settings are ${names}.`, usage);
  const idOption = { id: { type: "string" } } as const;
  const audited = `cli settings ${command} ${setting.name}`;

  if (setting.kind === "single") {
    const single = (values: OptionValues) => {
      if (values.id !== undefined)
        throw new UsageError(`${setting.name} is a single setting: leave out --id.`);
    };
    switch (command) {
      case "show": {
        const extra = setting.showOptions;
        const values = parse(optionArgs, { ...idOption, ...extra?.options }, extra?.usage ?? usage);
        single(values);
        io.out(json(await setting.show(values)));
        return 0;
      }
      case "apply": {
        single(parse(optionArgs, idOption, usage));
        const body = await io.readStdin();
        if (!isJson(body)) throw new UsageError("The body on stdin is not JSON.", `${usage} < body.json`);
        io.out(json(await setting.apply(operator(audited), body)));
        return 0;
      }
      case "remove":
        throw new UsageError(`${setting.name} is a single setting, not a list: apply a body to change it.`);
      case "test": {
        if (!setting.test) throw new UsageError(`${setting.name} has no test.`);
        const extra = setting.testOptions;
        const values = parse(optionArgs, { ...idOption, ...extra?.options }, extra?.usage ?? usage);
        single(values);
        return report(await setting.test(values), io);
      }
    }
  }

  // A list: --id names an entry; without it, show lists them all and apply creates one.
  const withId = `cli settings ${command} ${setting.name} --id <id>`;
  const idOf = (values: OptionValues) => (typeof values.id === "string" ? entityId(values.id) : undefined);
  const required = (id: string | undefined) => {
    if (id === undefined)
      throw new UsageError("Name the entry with --id. cli settings list shows the IDs.", withId);
    return id;
  };
  switch (command) {
    case "show": {
      const extra = setting.showOptions;
      const values = parse(optionArgs, { ...idOption, ...extra?.options }, extra?.usage ?? usage);
      io.out(json(await setting.show(idOf(values), values)));
      return 0;
    }
    case "apply": {
      const id = idOf(parse(optionArgs, idOption, `cli settings apply ${setting.name} [--id <id>]`));
      // The whole body first, before anything is loaded or locked.
      const body = await io.readStdin();
      if (!isJson(body)) throw new UsageError("The body on stdin is not JSON.", `${usage} < body.json`);
      if (id !== undefined) {
        io.out(json(await setting.update(operator(audited), id, body)));
        return 0;
      }
      const created = await setting.create(operator(audited), body);
      io.err(`Created. ID: ${created.id}\n`);
      io.out(json(created));
      return 0;
    }
    case "remove": {
      const id = required(idOf(parse(optionArgs, idOption, withId)));
      await setting.remove(operator(audited), id);
      io.err("Removed.\n");
      return 0;
    }
    case "test": {
      if (!setting.test) throw new UsageError(`${setting.name} has no test.`);
      const extra = setting.testOptions;
      const values = parse(optionArgs, { ...idOption, ...extra?.options }, extra?.usage ?? withId);
      const id = required(idOf(values));
      return report(await setting.test(id, values), io);
    }
  }
}

/** A test's result on stdout; its message on stderr and exit 1 when it failed. */
function report(result: CheckResult, io: CliIo): number {
  io.out(json(result));
  if (result.ok) return 0;
  io.err(`${result.message}\n`);
  return 1;
}
