import agents from "./agents";
import exchanges from "./exchanges";
import knowledge from "./knowledge";
import meta from "./meta";
import providers from "./providers";
import settings from "./settings";
import slack from "./slack";
import users from "./users";

/** Routers mounted under /api/v1. */
export const API_MODULES = [meta, agents, providers, knowledge, slack, exchanges, settings, users];
