import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTagCatalog } from "@/lib/tagCatalog";

// Mirror of the server rule (backend/app/dto/customer.py normalize_tags), so a
// bad tag is caught before submit instead of coming back a 422. Kept in lockstep
// with that function: one optional colon, both sides non-empty, no comma, <=64,
// and at most MAX_TAGS per customer.
const MAX_TAG_LENGTH = 64;
const MAX_TAGS = 25;

function normalizeTag(raw: string): string | null {
  const tag = raw.trim();
  if (!tag || tag.length > MAX_TAG_LENGTH || tag.includes(",")) return null;
  if ((tag.match(/:/g) || []).length > 1) return null;
  if (tag.includes(":")) {
    const [key, value] = tag.split(":").map((p) => p.trim());
    if (!key || !value) return null;
    return `${key}:${value}`;
  }
  return tag;
}

// the key part of a normalized tag ("interest" for "interest:x", "vip" for "vip")
const tagKey = (tag: string) => (tag.includes(":") ? tag.slice(0, tag.indexOf(":")) : tag);

/**
 * Chip editor for a customer's tags. Type a "key" or "key:value" and press
 * Enter/comma to commit; Backspace on an empty box removes the last chip.
 * Suggestions come from /customer/tags (tags already in use on this tenant) so
 * spellings converge. Value is the canonical string[] the API stores.
 */
export function TagInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const { t, te } = useLanguage();
  const [draft, setDraft] = useState("");
  // remounts the predefined Select after each pick so it returns to its
  // placeholder instead of holding the last choice
  const [pickCount, setPickCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // true while the pointer is heading into the predefined picker: opening the
  // Select blurs the free-text input, and without this flag the blur-commit
  // below would turn a half-typed draft into a stored junk tag
  const pickerInteracting = useRef(false);

  // predefined distribution-analytics tags ("<tag> - <arabic>" labels);
  // labelFor renders a stored tag — translated for catalog hits, VERBATIM for
  // custom tags (never route a custom tag through te, it can mangle it)
  const { catalog, labelFor } = useTagCatalog();

  const { data } = useQuery<{ tags: string[] }>({
    queryKey: ["/customer/tags"],
    queryFn: () => apiRequest("/customer/tags"),
    staleTime: 60_000,
  });

  // suggestions not already chosen, matching what's typed
  const suggestions = useMemo(() => {
    const all = data?.tags ?? [];
    const typed = draft.trim().toLowerCase();
    return all
      .filter((tag) => !value.includes(tag))
      .filter((tag) => !typed || tag.toLowerCase().includes(typed))
      .slice(0, 8);
  }, [data, value, draft]);

  const atCap = value.length >= MAX_TAGS;

  // clearDraft=false for the predefined picker, so choosing from it never
  // wipes a custom tag the user is mid-typing in the free-text box
  const add = (raw: string, clearDraft = true) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    // one value per key: adding "interest:not_interested" replaces any existing
    // "interest:*" rather than stacking a second value the server would reject.
    // Keys compare case-insensitively so "Blacklist" and "blacklist" can't
    // coexist as one-tap near-duplicates that would split analytics counts.
    const key = tagKey(tag).toLowerCase();
    const withoutSameKey = value.filter((existing) => tagKey(existing).toLowerCase() !== key);
    // cap on the RESULT, so swapping a same-key value is never blocked at the cap
    if (withoutSameKey.length >= MAX_TAGS) return;
    if (!withoutSameKey.includes(tag)) onChange([...withoutSameKey, tag]);
    if (clearDraft) setDraft("");
  };

  // whether the predefined tag applies to this customer already (any case)
  const applied = (tag: string) => value.some((existing) => existing.toLowerCase() === tag.toLowerCase());

  // the picker stays available at the cap when it can still SWAP a same-key
  // value (add() permits that), e.g. flipping customer_sale:no_sale to
  // repeated_sale on a customer already carrying 25 tags
  const canPickPredefined =
    catalog.length > 0 &&
    (!atCap || catalog.some((entry) => value.some((existing) => tagKey(existing).toLowerCase() === tagKey(entry.tag).toLowerCase())));

  const removeAt = (i: number) => onChange(value.filter((_, idx) => idx !== i));

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      removeAt(value.length - 1);
    }
  };

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-10 focus-within:ring-1 focus-within:ring-ring"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <Badge key={tag} variant="secondary" className="gap-1 font-normal" data-testid={`tag-chip-${tag}`}>
            {labelFor(tag)}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                className="rounded-full hover:bg-black/10"
                aria-label={t("customers.removeTag")}
                data-testid={`tag-remove-${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
        <Input
          ref={inputRef}
          value={draft}
          disabled={disabled || atCap}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            pickerInteracting.current = false;
          }}
          onBlur={() => {
            // focus moving into the predefined picker must not commit the
            // draft — the user abandoned typing to pick, not to submit
            if (pickerInteracting.current) return;
            if (draft.trim()) add(draft);
          }}
          placeholder={
            atCap
              ? t("customers.tagsAtCap")
              : value.length === 0
                ? t("customers.tagsPlaceholder")
                : ""
          }
          className="flex-1 min-w-[8rem] border-0 p-0 h-6 shadow-none focus-visible:ring-0"
          data-testid="tag-input"
        />
      </div>
      {/* predefined distribution-analytics tags: pick from the server catalog,
          translated per language; the clean tag is what gets stored. Custom
          tags keep using the free-text input above. */}
      {!disabled && canPickPredefined && (
        <div
          className="mt-1.5"
          onPointerDown={() => {
            pickerInteracting.current = true;
          }}
        >
          <Select key={pickCount} onValueChange={(tag) => { add(tag, false); setPickCount((n) => n + 1); }}>
            <SelectTrigger className="h-8 w-auto min-w-[12rem] text-xs" data-testid="tag-predefined">
              <SelectValue placeholder={t("customers.predefinedTags")} />
            </SelectTrigger>
            <SelectContent>
              {catalog.map((entry) => (
                <SelectItem key={entry.tag} value={entry.tag} data-testid={`tag-predefined-opt-${entry.tag}`}>
                  {/* mirror the app's picker: mark tags already on the customer */}
                  {applied(entry.tag) ? "✓ " : ""}
                  {te(entry.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {!atCap && suggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="text-xs px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50"
              data-testid={`tag-suggest-${tag}`}
            >
              + {labelFor(tag)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
