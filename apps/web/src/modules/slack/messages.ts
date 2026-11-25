import { defineMessages } from "@/i18n";

export const messages = defineMessages({
  en: {
    title: "Slack",
    description: "Connect the bot to your Slack workspace in four steps.",
    status: "Connection",
    notConnected: "Not connected yet.",
    workspace: "Workspace",
    botName: "Bot",
    botToken: "Bot token",
    appToken: "App-level token",
    stored: "Stored ({hint})",
    missing: "Missing",
    lastCheckMissing: "The last check found missing scopes: {scopes}",

    step1: "Step 1: Create the Slack app",
    step1Text:
      "The manifest sets up the app with the right scopes, events and Socket Mode. In Slack, choose Create New App → From a manifest, pick your workspace, and paste the manifest.",
    appName: "App name",
    appNameHint: "Shown in Slack, up to 35 characters. Agents can use their own names later.",
    manifest: "Manifest",
    copyManifest: "Copy manifest",
    openSlack: "Open Slack (From a manifest)",

    step2: "Step 2: Install the app",
    step2Text:
      "In the app's settings, open Install App and install it to your workspace. Then copy the Bot User OAuth Token. It starts with xoxb-.",

    step3: "Step 3: Create an app-level token",
    step3Text:
      "Under Basic Information → App-Level Tokens, choose Generate Token and Scopes, add the scope connections:write, and generate it. Copy the token. It starts with xapp-.",

    step4: "Step 4: Paste the tokens and check the connection",
    step4Text: "The tokens are stored encrypted and never shown again; only their last characters are.",
    saveTokens: "Save tokens",
    tokensSaved: "Tokens saved",
    check: "Check connection",
    checking: "Checking…",
    checkTeam: "Workspace: {team}",
    checkBot: "Bot: {bot}",
    missingRequired: "Missing required scopes",
    missingRequiredText: "Add them under OAuth & Permissions → Bot Token Scopes, then reinstall the app.",
    missingOptional: "Missing optional scopes",
    optionalTitle: "Optional scopes",
    optionalText:
      "Optional scopes turn on features: files:read lets agents read images, chat:write.customize lets agents use their own name and icon, reactions:write shows the working reaction, and reactions:read collects 👍/👎 feedback.",
    allScopes: "All scopes are there.",

    alerts: "Alert channel",
    alertsText: "The bot posts its errors and warnings to this channel. Invite the bot to it.",
    alertChannel: "Channel",
    noAlertChannel: "No alert channel",
    alertSaved: "Alert channel saved",
    channelId: "Channel ID",
    channelIdHint:
      "Slack isn't connected yet, so channels can't be listed. Type a channel ID, e.g. C01ABCDEF.",
    privateChannel: "private",
    notMember: "bot not in channel",
  },
  de: {
    title: "Slack",
    description: "Verbinde den Bot in vier Schritten mit deinem Slack-Workspace.",
    status: "Verbindung",
    notConnected: "Noch nicht verbunden.",
    workspace: "Workspace",
    botName: "Bot",
    botToken: "Bot-Token",
    appToken: "App-Token",
    stored: "Gespeichert ({hint})",
    missing: "Fehlt",
    lastCheckMissing: "Bei der letzten Prüfung fehlten Scopes: {scopes}",

    step1: "Schritt 1: Slack-App anlegen",
    step1Text:
      "Das Manifest richtet die App mit den richtigen Scopes, Events und Socket Mode ein. Wähle in Slack Create New App → From a manifest, wähle deinen Workspace und füge das Manifest ein.",
    appName: "Name der App",
    appNameHint: "Wird in Slack angezeigt, bis zu 35 Zeichen. Agenten können später eigene Namen nutzen.",
    manifest: "Manifest",
    copyManifest: "Manifest kopieren",
    openSlack: "Slack öffnen (From a manifest)",

    step2: "Schritt 2: App installieren",
    step2Text:
      "Öffne in den Einstellungen der App Install App und installiere sie in deinem Workspace. Kopiere dann das Bot User OAuth Token. Es beginnt mit xoxb-.",

    step3: "Schritt 3: App-Token erstellen",
    step3Text:
      "Wähle unter Basic Information → App-Level Tokens Generate Token and Scopes, füge den Scope connections:write hinzu und erzeuge das Token. Kopiere es. Es beginnt mit xapp-.",

    step4: "Schritt 4: Tokens einfügen und Verbindung prüfen",
    step4Text:
      "Die Tokens werden verschlüsselt gespeichert und nie wieder angezeigt, nur ihre letzten Zeichen.",
    saveTokens: "Tokens speichern",
    tokensSaved: "Tokens gespeichert",
    check: "Verbindung prüfen",
    checking: "Wird geprüft…",
    checkTeam: "Workspace: {team}",
    checkBot: "Bot: {bot}",
    missingRequired: "Fehlende Pflicht-Scopes",
    missingRequiredText:
      "Füge sie unter OAuth & Permissions → Bot Token Scopes hinzu und installiere die App danach neu.",
    missingOptional: "Fehlende optionale Scopes",
    optionalTitle: "Optionale Scopes",
    optionalText:
      "Optionale Scopes schalten Funktionen frei: files:read lässt Agenten Bilder lesen, chat:write.customize erlaubt eigene Namen und Symbole, reactions:write zeigt die Arbeits-Reaktion und reactions:read sammelt 👍/👎-Rückmeldungen.",
    allScopes: "Alle Scopes sind vorhanden.",

    alerts: "Kanal für Warnungen",
    alertsText: "Der Bot postet seine Fehler und Warnungen in diesen Kanal. Lade den Bot dorthin ein.",
    alertChannel: "Kanal",
    noAlertChannel: "Kein Kanal für Warnungen",
    alertSaved: "Kanal für Warnungen gespeichert",
    channelId: "Kanal-ID",
    channelIdHint:
      "Slack ist noch nicht verbunden, daher lassen sich keine Kanäle auflisten. Gib eine Kanal-ID ein, z. B. C01ABCDEF.",
    privateChannel: "privat",
    notMember: "Bot nicht im Kanal",
  },
});
