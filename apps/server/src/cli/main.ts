import pg from "pg";
import { AppError } from "../http/errors";
import { ConfigError } from "../config";
import { isFailedQuery } from "../logger";
import { agents } from "./agents";
import { app } from "./app";
import { UsageError, type CliIo } from "./io";
import { knowledgeSources } from "./knowledge-sources";
import { providers } from "./providers";
import { settingsCommand, type Setting } from "./settings";
import { slack } from "./slack";

/** The settings of the admin interface, in the order of its setup steps. */
export const SETTINGS: Setting[] = [providers, knowledgeSources, slack, agents, app];

const DOCS =
  "https://github.com/projecttogether/support-agent/blob/main/docs/deployment.md#settings-from-the-command-line";

function help(): string {
  const width = Math.max(...SETTINGS.map((setting) => setting.name.length));
  return `Support Agent: the operator command. On a server with compose.yaml:
  docker compose run --rm -T migrate cli <command>
In a terminal of the app's container: cli <command>

Commands:
  cli settings list [--json]                  every setting and every entry of a list:
                                              set, not set or incomplete, with hints
  cli settings show <name> [--id <id>]        a setting, a list or one entry, as JSON
  cli settings apply <name> [--id <id>]       save the admin page's JSON body from stdin;
                                              a list without --id gets a new entry
  cli settings remove <name> --id <id>        delete an entry of a list
  cli settings test <name> [--id <id>]        what the page's test button does
  cli help                                    this text

Options of some settings:
  show providers --id <id> --models           the models the provider lists
  test providers --id <id> --model <model>    a short call to the model (required)
  test knowledge-sources --id <id> --query <text>
                                              a test search (required)
  show slack --channels                       the channels the bot can see
  show slack --manifest [--name <app name>]   the manifest for a new Slack app

Settings (lists: providers, knowledge-sources, agents):
${SETTINGS.map((setting) => `  ${setting.name.padEnd(width)}  ${setting.label}`).join("\n")}

Secrets go only on stdin, never in an argument; output shows hints only.
Exit codes: 0 done, 1 refused (the page's message on stderr), 2 wrong command
or a body that is not JSON. Example bodies: ${DOCS}
`;
}

/**
 * What went wrong, for stderr. A database error or an unexpected one gets the
 * page's generic message, with its code at most: its text can quote values,
 * and a failed query carries its parameters.
 */
function report(error: unknown, io: CliIo): number {
  if (error instanceof UsageError) {
    io.err(
      `${error.message}\n${error.usage ? `Usage: ${error.usage}\n` : ""}Run "cli help" for the commands.\n`,
    );
    return 2;
  }
  if (error instanceof AppError) {
    io.err(`${error.message}\n`);
    for (const [field, message] of Object.entries(error.fields ?? {})) io.err(`  ${field}: ${message}\n`);
    return 1;
  }
  if (isFailedQuery(error) || error instanceof pg.DatabaseError) {
    const code = ((isFailedQuery(error) ? error.cause : error) as { code?: unknown } | undefined)?.code;
    io.err(
      `Something went wrong. Try again.${typeof code === "string" ? ` (database error ${code})` : ""}\n`,
    );
    return 1;
  }
  if (error instanceof ConfigError) {
    io.err(`${error.message}\n`);
    return 1;
  }
  // Its text could quote anything, such as an address or a header; a code such as ECONNREFUSED stays.
  const code = (error as { code?: unknown } | null)?.code;
  io.err(
    `Something went wrong. Try again.${typeof code === "string" && /^[A-Z][A-Z0-9_]*$/.test(code) ? ` (${code})` : ""}\n`,
  );
  return 1;
}

/** Runs `cli <args>` and returns the exit code. */
export async function runCli(args: string[], io: CliIo): Promise<number> {
  try {
    const [command, ...rest] = args;
    switch (command) {
      case "help":
      case "--help":
      case "-h":
        if (rest.length > 0) throw new UsageError("help takes no arguments.");
        io.out(help());
        return 0;
      case "settings":
        return await settingsCommand(rest, io, SETTINGS);
      case undefined:
        io.err(help());
        return 2;
      default:
        throw new UsageError("Unknown command.");
    }
  } catch (error) {
    return report(error, io);
  }
}
