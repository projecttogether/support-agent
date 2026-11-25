import type { Role } from "@support-agent/shared/roles";

/** The signed-in person of a request. */
export type UserPrincipal = {
  kind: "user";
  id: string;
  email: string;
  name: string;
  role: Role;
  image: string | null;
};

const OPERATOR = Symbol("operator");

/**
 * Whoever runs the operator command (`cli settings …`) on the server, with an
 * admin's rights. Only the command creates one (src/cli): a request carries
 * no symbol, so no route can stand for it.
 */
export type OperatorPrincipal = {
  readonly [OPERATOR]: true;
  /** The command without its options, e.g. `cli settings apply slack`, for the audit log. */
  readonly command: string;
};

/** Who changes something: a signed-in person or the operator command. */
export type Actor = UserPrincipal | OperatorPrincipal;

/** The operator running `command`. Command line only. */
export function operator(command: string): OperatorPrincipal {
  return { [OPERATOR]: true, command };
}

export function isOperator(actor: unknown): actor is OperatorPrincipal {
  return typeof actor === "object" && actor !== null && OPERATOR in actor;
}
