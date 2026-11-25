import { OPTIONAL_BOT_SCOPES, REQUIRED_BOT_SCOPES } from "@support-agent/shared/api/slack";
import { config } from "../config";

/**
 * The Slack app manifest: Socket Mode (no public URL needed), the bot's
 * scopes and events, and the redirect URL for "Sign in with Slack" when the
 * same app signs people in to the admin interface.
 */
export function slackManifest(name: string): Record<string, unknown> {
  const appName = name.trim().slice(0, 35) || "Support Agent";
  return {
    display_information: {
      name: appName,
      description: "Answers support questions from the organization's knowledge base.",
      background_color: "#1f2937",
    },
    features: {
      bot_user: { display_name: appName, always_online: true },
    },
    oauth_config: {
      redirect_urls: [`${config().APP_URL}/api/auth/callback/oidc`],
      scopes: {
        bot: [...REQUIRED_BOT_SCOPES, ...OPTIONAL_BOT_SCOPES],
        // Only for "Sign in with Slack" (OIDC_ISSUER=https://slack.com).
        user: ["openid", "email", "profile"],
      },
    },
    settings: {
      event_subscriptions: {
        bot_events: ["message.channels", "message.groups", "reaction_added", "reaction_removed"],
      },
      interactivity: { is_enabled: false },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  };
}
