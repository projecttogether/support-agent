import { useState } from "react";
import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { errorMessage } from "@/lib/api";
import { cn } from "@/components/ui/utils";
import { useProviderModels } from "@/modules/providers/api";

const messages = defineMessages({
  en: {
    placeholder: "Choose or type a model",
    search: "Search or type a model…",
    use: 'Use "{model}"',
    loading: "Loading models…",
    failed: "Couldn't load the models: {message} Type a model name instead.",
    none: "No models listed. Type a model name.",
    chooseProviderFirst: "Choose a provider first",
    models: "Models",
  },
  de: {
    placeholder: "Modell wählen oder eingeben",
    search: "Modell suchen oder eingeben…",
    use: "„{model}“ verwenden",
    loading: "Modelle werden geladen…",
    failed: "Die Modelle konnten nicht geladen werden: {message} Gib stattdessen einen Modellnamen ein.",
    none: "Keine Modelle aufgeführt. Gib einen Modellnamen ein.",
    chooseProviderFirst: "Wähle zuerst einen Anbieter",
    models: "Modelle",
  },
});

/**
 * Picks a model of a provider from its model list, or takes any typed name
 * (lists can be incomplete, and some APIs have none).
 */
export function ModelCombobox(props: {
  id: string;
  providerId: string | null;
  value: string;
  onChange: (model: string) => void;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
}) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const models = useProviderModels(open ? props.providerId : null);
  const typed = search.trim();
  const listed = models.data?.some((model) => model.id === typed) ?? false;

  const choose = (model: string) => {
    props.onChange(model);
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) props.onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={props.id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={props.invalid ? true : undefined}
          aria-describedby={props.describedBy}
          disabled={!props.providerId}
          className={cn("w-full justify-between font-normal", !props.value && "text-muted-foreground")}
        >
          <span className="truncate font-mono text-sm">
            {props.value || (props.providerId ? t("placeholder") : t("chooseProviderFirst"))}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command>
          <CommandInput
            aria-label={t("search")}
            placeholder={t("search")}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {models.isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-3 py-2 text-sm" role="status">
                <Spinner />
                {t("loading")}
              </div>
            ) : null}
            {models.isError ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">
                {t("failed", { message: errorMessage(models.error) })}
              </p>
            ) : null}
            {models.data && models.data.length === 0 ? (
              <p className="text-muted-foreground px-3 py-2 text-sm">{t("none")}</p>
            ) : null}
            {typed && !listed ? (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`typed:${typed}`} onSelect={() => choose(typed)}>
                  <Pencil />
                  <span className="truncate">{t("use", { model: typed })}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {models.data && models.data.length > 0 ? (
              <>
                <CommandEmpty>{typed ? null : t("none")}</CommandEmpty>
                <CommandGroup heading={t("models")}>
                  {models.data.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.id}
                      keywords={model.name ? [model.name] : undefined}
                      onSelect={() => choose(model.id)}
                    >
                      <Check className={cn(model.id === props.value ? "opacity-100" : "opacity-0")} />
                      <div className="grid min-w-0">
                        <span className="truncate font-mono text-sm">{model.id}</span>
                        {model.name && model.name !== model.id ? (
                          <span className="text-muted-foreground truncate text-xs">{model.name}</span>
                        ) : null}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
